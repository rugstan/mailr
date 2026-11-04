import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ACTION_LABELS, defaultSettings } from "@/lib/mail";
import type {
  ActionStatus,
  ActionType,
  LocationSettings,
  MailKind,
  MailStatus,
} from "@/lib/types";
import { QueueClient, type QueueRow } from "./queue-client";

interface RequestRow {
  id: string;
  action: ActionType;
  status: ActionStatus;
  rush: boolean;
  sla_due_at: string | null;
  created_at: string;
  params: Record<string, unknown> | null;
  mail_item: {
    id: string;
    barcode: string | null;
    status: MailStatus;
    kind: MailKind;
    sender_name: string | null;
    location_id: string;
    mailbox: { pmb_number: number } | null;
  } | null;
  customer: { id: string; full_name: string } | null;
}

export default async function QueuePage() {
  const staff = await requireStaff("counter");
  const supabase = await createClient();

  // User-context read — RLS scopes requests to this staff member's location.
  const { data } = await supabase
    .from("action_requests")
    .select(
      "id, action, status, rush, sla_due_at, created_at, params, mail_item:mail_items(id, barcode, status, kind, sender_name, location_id, mailbox:mailboxes(pmb_number)), customer:customers(id, full_name)"
    )
    .in("status", ["requested", "in_progress"])
    .order("rush", { ascending: false })
    .order("sla_due_at", { ascending: true, nullsFirst: false });

  const { data: locationRow } = await supabase
    .from("locations")
    .select("settings")
    .eq("id", staff.location_id)
    .single();
  const settings = defaultSettings((locationRow?.settings ?? null) as LocationSettings | null);

  const rows: QueueRow[] = ((data ?? []) as unknown as RequestRow[]).map((r) => ({
    id: r.id,
    action: r.action,
    label: ACTION_LABELS[r.action] ?? r.action,
    status: r.status,
    rush: r.rush,
    slaDueAt: r.sla_due_at,
    requestedAt: r.created_at,
    params: r.params ?? {},
    itemId: r.mail_item?.id ?? null,
    itemStatus: r.mail_item?.status ?? null,
    barcode: r.mail_item?.barcode ?? null,
    kind: r.mail_item?.kind ?? null,
    sender: r.mail_item?.sender_name ?? null,
    pmb: r.mail_item?.mailbox?.pmb_number ?? null,
    customerName: r.customer?.full_name ?? null,
  }));

  const scanRows = rows.filter((r) => r.action === "open_scan");
  const otherRows = rows.filter((r) => r.action !== "open_scan");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Queues</h1>
        <p className="text-muted-foreground">
          Open customer requests sorted by rush, then SLA. Fulfill from here — every step is
          audited.
        </p>
      </div>
      <QueueClient
        scanRows={scanRows}
        otherRows={otherRows}
        settings={{
          forwardMarkupPct: settings.forward_markup_pct,
          forwardHandlingCents: settings.forward_handling_cents,
        }}
      />
    </div>
  );
}
