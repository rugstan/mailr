import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyCustomer } from "@/lib/notify";
import type {
  ActionType,
  ActorType,
  LocationSettings,
  MailCategory,
  MailItem,
  MailKind,
  MailStatus,
  StandingRule,
} from "@/lib/types";

/** Mirror of the DB state machine (the trigger is the authority; this is the UI guard). */
export const MAIL_TRANSITIONS: Record<MailStatus, MailStatus[]> = {
  received: ["checked_in"],
  checked_in: ["notified", "action_pending", "returned_to_sender"],
  notified: ["action_pending", "archived", "held_for_pickup"],
  action_pending: ["opening", "out_for_forward", "held_for_pickup", "shredded", "recycled", "archived"],
  opening: ["scanned"],
  scanned: ["archived", "shredded", "recycled", "held_for_pickup"],
  out_for_forward: ["forwarded"],
  held_for_pickup: ["picked_up", "action_pending"],
  forwarded: [],
  shredded: [],
  recycled: [],
  picked_up: [],
  archived: [],
  returned_to_sender: [],
};

export interface TransitionParams {
  itemId: string;
  to: MailStatus;
  eventType?: string;
  actorType: ActorType;
  actorId?: string | null;
  consentSource?: { type: "action_request" | "standing_rule"; id: string } | null;
  metadata?: Record<string, unknown>;
}

/**
 * The single way a mail item changes status. Writes the audit event in the
 * same flow; the DB triggers reject illegal transitions and unconsented opens.
 * Callers MUST have performed authorization already.
 */
export async function transitionMailItem(
  admin: SupabaseClient,
  params: TransitionParams
): Promise<MailItem> {
  const { data: item, error: updErr } = await admin
    .from("mail_items")
    .update({ status: params.to })
    .eq("id", params.itemId)
    .select("*")
    .single();
  if (updErr) throw new Error(`transition failed: ${updErr.message}`);

  const { error: evtErr } = await admin.from("mail_events").insert({
    mail_item_id: params.itemId,
    event_type: params.eventType ?? params.to,
    actor_type: params.actorType,
    actor_id: params.actorId ?? null,
    consent_source: params.consentSource ?? null,
    metadata: params.metadata ?? {},
  });
  if (evtErr) throw new Error(`audit event failed: ${evtErr.message}`);
  return item as MailItem;
}

/** Records an audit event without a status change (e.g. 'opened' before 'scanned'). */
export async function recordMailEvent(
  admin: SupabaseClient,
  params: Omit<TransitionParams, "to"> & { eventType: string }
): Promise<void> {
  const { error } = await admin.from("mail_events").insert({
    mail_item_id: params.itemId,
    event_type: params.eventType,
    actor_type: params.actorType,
    actor_id: params.actorId ?? null,
    consent_source: params.consentSource ?? null,
    metadata: params.metadata ?? {},
  });
  if (error) throw new Error(`audit event failed: ${error.message}`);
}

export interface IntakeParams {
  locationId: string;
  staffId: string;
  mailboxId: string;
  pmbNumber: number;
  recipientId: string;
  kind: MailKind;
  senderName?: string | null;
  carrier?: string | null;
  weightOz?: number | null;
  category?: MailCategory;
  urgency?: number;
  photoPaths?: string[];
  freeStorageDays?: number;
}

export interface IntakeResult {
  item: MailItem;
  barcode: string;
  appliedRule: StandingRule | null;
}

/**
 * Staff intake: creates the item (the DB blocks unverified recipients),
 * moves received → checked_in, applies standing rules, notifies the customer.
 */
export async function intakeCheckIn(admin: SupabaseClient, p: IntakeParams): Promise<IntakeResult> {
  const { data: barcode, error: bcErr } = await admin.rpc("next_barcode", { p_pmb: p.pmbNumber });
  if (bcErr) throw new Error(`barcode failed: ${bcErr.message}`);

  const storageFreeUntil =
    p.kind === "package"
      ? new Date(Date.now() + (p.freeStorageDays ?? 5) * 86400000).toISOString().slice(0, 10)
      : null;

  const { data: inserted, error: insErr } = await admin
    .from("mail_items")
    .insert({
      location_id: p.locationId,
      mailbox_id: p.mailboxId,
      recipient_id: p.recipientId,
      barcode,
      kind: p.kind,
      status: "received",
      category: p.category ?? "unknown",
      urgency: p.urgency ?? (p.category === "government" ? 3 : 0),
      sender_name: p.senderName ?? null,
      carrier: p.carrier ?? null,
      weight_oz: p.weightOz ?? null,
      exterior_photos: p.photoPaths ?? [],
      storage_free_until: storageFreeUntil,
    })
    .select("*")
    .single();
  if (insErr) throw new Error(insErr.message);

  let item = inserted as MailItem;
  item = await transitionMailItem(admin, {
    itemId: item.id,
    to: "checked_in",
    actorType: "staff",
    actorId: p.staffId,
    metadata: { kind: p.kind, sender: p.senderName ?? null },
  });

  const appliedRule = await applyStandingRules(admin, item);

  const { data: mailbox } = await admin
    .from("mailboxes")
    .select("customer_id, pmb_number")
    .eq("id", p.mailboxId)
    .single();
  if (mailbox?.customer_id) {
    const urgent = (item.urgency ?? 0) >= 3;
    await notifyCustomer(admin, {
      customerId: mailbox.customer_id,
      mailItemId: item.id,
      template: urgent ? "mail_checked_in_urgent" : "mail_checked_in",
      subject: urgent
        ? `URGENT mail received in PMB ${mailbox.pmb_number}`
        : `New mail in PMB ${mailbox.pmb_number}`,
      body: `A new ${p.kind.replace("_", " ")} from ${p.senderName || "an unidentified sender"} arrived in your mailbox. Sign in to choose what to do with it.`,
      channels: urgent ? ["email", "sms"] : ["email"],
    });
    await recordMailEvent(admin, {
      itemId: item.id,
      eventType: "notified",
      actorType: "system",
      metadata: { channels: urgent ? ["email", "sms"] : ["email"] },
    });
    if (item.status === "checked_in") {
      item = await transitionMailItem(admin, {
        itemId: item.id,
        to: "notified",
        eventType: "status_notified",
        actorType: "system",
      });
    }
  }

  return { item, barcode: barcode as string, appliedRule };
}

/**
 * First matching active standing rule (by priority) creates an action request
 * whose consent the open-gate trigger validates at scan time.
 */
export async function applyStandingRules(
  admin: SupabaseClient,
  item: MailItem
): Promise<StandingRule | null> {
  const { data: mailbox } = await admin
    .from("mailboxes")
    .select("customer_id")
    .eq("id", item.mailbox_id)
    .single();
  if (!mailbox?.customer_id) return null;

  const { data: rules } = await admin
    .from("standing_rules")
    .select("*")
    .eq("customer_id", mailbox.customer_id)
    .eq("active", true)
    .order("priority", { ascending: true });

  const rule = ((rules ?? []) as StandingRule[]).find((r) => ruleMatches(r, item));
  if (!rule) return null;

  const { error } = await admin.from("action_requests").insert({
    mail_item_id: item.id,
    customer_id: mailbox.customer_id,
    action: rule.action,
    status: "requested",
    sla_due_at: computeSlaDue(false),
    params: { standing_rule_id: rule.id },
  });
  if (error) {
    // Suspension gate may legitimately block rule-driven requests.
    console.warn("standing rule request blocked:", error.message);
    return null;
  }
  await recordMailEvent(admin, {
    itemId: item.id,
    eventType: "rule_applied",
    actorType: "rule",
    actorId: rule.id,
    metadata: { action: rule.action, match: rule.match },
  });
  await transitionMailItem(admin, {
    itemId: item.id,
    to: "action_pending",
    eventType: "action_requested",
    actorType: "rule",
    actorId: rule.id,
    metadata: { action: rule.action },
  });
  return rule;
}

export function ruleMatches(rule: StandingRule, item: MailItem): boolean {
  const m = rule.match ?? {};
  if (m.category && m.category !== item.category) return false;
  if (m.sender_contains) {
    const sender = (item.sender_name ?? "").toLowerCase();
    if (!sender.includes(m.sender_contains.toLowerCase())) return false;
  }
  return Boolean(m.category || m.sender_contains);
}

/**
 * SLA stamp: rush = 2h; standard requested before 14:00 location time is due
 * 17:00 same day, otherwise 12:00 the next day.
 */
export function computeSlaDue(rush: boolean, timezone = "America/Los_Angeles"): string {
  const now = new Date();
  if (rush) return new Date(now.getTime() + 2 * 3600000).toISOString();
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone }).format(now)
  );
  // Before 14:00 local → due 17:00 today; after → due 12:00 tomorrow.
  const hoursUntilDue = hour < 14 ? 17 - hour : 24 - hour + 12;
  return new Date(now.getTime() + hoursUntilDue * 3600000).toISOString();
}

export const ACTION_LABELS: Record<ActionType, string> = {
  open_scan: "Open & Scan",
  forward: "Forward",
  shred: "Shred",
  recycle: "Recycle",
  pickup: "Hold for Pickup",
  hold: "Hold",
  check_deposit: "Deposit Check",
};

export const ACTION_TARGET_STATUS: Record<ActionType, MailStatus> = {
  open_scan: "opening",
  forward: "out_for_forward",
  shred: "shredded",
  recycle: "recycled",
  pickup: "held_for_pickup",
  hold: "held_for_pickup",
  check_deposit: "held_for_pickup",
};

export function defaultSettings(s: LocationSettings | null | undefined): Required<LocationSettings> {
  return {
    sla_hours: s?.sla_hours ?? 4,
    free_storage_days: s?.free_storage_days ?? 5,
    storage_day_cents: s?.storage_day_cents ?? 100,
    scan_overage_cents: s?.scan_overage_cents ?? 150,
    late_fee_cents: s?.late_fee_cents ?? 1000,
    late_fee_grace_days: s?.late_fee_grace_days ?? 3,
    suspend_after_days: s?.suspend_after_days ?? 10,
    dunning_days: s?.dunning_days ?? [0, 3, 7],
    forward_markup_pct: s?.forward_markup_pct ?? 35,
    forward_handling_cents: s?.forward_handling_cents ?? 300,
    rush_scan_cents: s?.rush_scan_cents ?? 500,
    check_deposit_cents: s?.check_deposit_cents ?? 500,
  };
}
