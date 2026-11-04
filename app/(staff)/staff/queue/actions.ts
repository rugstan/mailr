"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { defaultSettings, recordMailEvent, transitionMailItem } from "@/lib/mail";
import { notifyCustomer } from "@/lib/notify";
import { uploadPrivate } from "@/lib/storage";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActionRequest,
  ActionStatus,
  ActionType,
  LocationSettings,
  MailItem,
  StaffUser,
} from "@/lib/types";

export type QueueActionResult = { success: true } | { error: string };

const OPEN_STATUSES: ActionStatus[] = ["requested", "in_progress"];

function portalUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

interface LoadedRequest {
  request: ActionRequest;
  item: MailItem;
}

/**
 * Admin read: validates the request/item pair (existence, action type, open
 * status, location ownership) before any pipeline write. Authz (requireStaff)
 * has already run in the calling action.
 */
async function loadOpenRequest(
  admin: SupabaseClient,
  staff: StaffUser,
  requestId: string,
  expectedActions: ActionType[]
): Promise<LoadedRequest | { error: string }> {
  const { data } = await admin
    .from("action_requests")
    .select("*, mail_item:mail_items(*)")
    .eq("id", requestId)
    .maybeSingle();
  const row = data as unknown as (ActionRequest & { mail_item: MailItem | null }) | null;
  if (!row || !row.mail_item) return { error: "Request not found" };
  if (!expectedActions.includes(row.action)) {
    return { error: `This is a "${row.action}" request — wrong fulfillment flow` };
  }
  if (!OPEN_STATUSES.includes(row.status)) {
    return { error: `Request is already ${row.status}` };
  }
  if (row.mail_item.location_id !== staff.location_id) {
    return { error: "Item belongs to another location" };
  }
  // row.mail_item is narrowed non-null here; the request fields are on row itself.
  return { request: row as unknown as ActionRequest, item: row.mail_item };
}

/** Bridges items still in checked_in/notified into action_pending. */
async function ensureActionPending(
  admin: SupabaseClient,
  item: MailItem
): Promise<MailItem> {
  if (item.status === "checked_in" || item.status === "notified") {
    return transitionMailItem(admin, {
      itemId: item.id,
      to: "action_pending",
      eventType: "action_requested",
      actorType: "system",
    });
  }
  return item;
}

async function fulfillRequestRow(staffId: string, requestId: string): Promise<string | null> {
  // User-context update — staff RLS allows fulfilling requests at their location.
  const supabase = await createClient();
  const { error } = await supabase
    .from("action_requests")
    .update({
      status: "fulfilled",
      fulfilled_by: staffId,
      fulfilled_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  return error ? error.message : null;
}

// ── Open & Scan ───────────────────────────────────────────────────────────────

export async function startScanRequest(requestId: string): Promise<QueueActionResult> {
  const staff = await requireStaff("scan_operator");
  const parsed = z.uuid().safeParse(requestId);
  if (!parsed.success) return { error: "Invalid request id" };

  // User-context: read + status update are allowed by staff RLS policies.
  const supabase = await createClient();
  const { data } = await supabase
    .from("action_requests")
    .select("id, action, status, mail_item:mail_items(location_id)")
    .eq("id", parsed.data)
    .maybeSingle();
  const row = data as unknown as {
    id: string;
    action: ActionType;
    status: ActionStatus;
    mail_item: { location_id: string } | null;
  } | null;
  if (!row || row.mail_item?.location_id !== staff.location_id) {
    return { error: "Request not found at your location" };
  }
  if (row.action !== "open_scan") return { error: "Not an open & scan request" };
  if (row.status !== "requested") return { error: `Request is already ${row.status}` };

  const { error } = await supabase
    .from("action_requests")
    .update({ status: "in_progress" })
    .eq("id", row.id);
  if (error) return { error: error.message };

  revalidatePath("/staff/queue");
  return { success: true };
}

const scanSchema = z.object({
  requestId: z.uuid(),
  pageCount: z.coerce.number().int().min(1).max(500),
});

export async function fulfillScan(formData: FormData): Promise<QueueActionResult> {
  const staff = await requireStaff("scan_operator");

  const parsed = scanSchema.safeParse({
    requestId: formData.get("requestId"),
    pageCount: formData.get("pageCount"),
  });
  if (!parsed.success) return { error: "Enter a valid page count" };

  const pdf = formData.get("pdf");
  if (!(pdf instanceof File) || pdf.size === 0) return { error: "Attach the scanned PDF" };
  if (pdf.type !== "application/pdf") return { error: "Scan must be a PDF file" };
  if (pdf.size > 50 * 1024 * 1024) return { error: "PDF must be 50MB or less" };

  // Admin client: storage + mail pipeline are server-mediated (service role).
  const admin = createAdminClient();
  const loaded = await loadOpenRequest(admin, staff, parsed.data.requestId, ["open_scan"]);
  if ("error" in loaded) return loaded;
  const { request, item } = loaded;

  if (!["checked_in", "notified", "action_pending"].includes(item.status)) {
    return { error: `Item is not scannable in status "${item.status}"` };
  }

  const pdfPath = `${staff.location_id}/${item.id}/${crypto.randomUUID()}.pdf`;
  try {
    await uploadPrivate(admin, "scans", pdfPath, await pdf.arrayBuffer(), "application/pdf");

    // Pipeline sequence — each step audited; DB triggers are the authority.
    const pendingItem = await ensureActionPending(admin, item);
    await transitionMailItem(admin, {
      itemId: pendingItem.id,
      to: "opening",
      actorType: "staff",
      actorId: staff.id,
    });
    // The open-consent trigger validates this consent_source; its error is surfaced verbatim.
    await recordMailEvent(admin, {
      itemId: item.id,
      eventType: "opened",
      actorType: "staff",
      actorId: staff.id,
      consentSource: { type: "action_request", id: request.id },
    });
    const { error: docErr } = await admin.from("scan_documents").insert({
      mail_item_id: item.id,
      pdf_path: pdfPath,
      page_count: parsed.data.pageCount,
    });
    if (docErr) throw new Error(docErr.message);
    // Fires the scan quota / overage trigger.
    await transitionMailItem(admin, {
      itemId: item.id,
      to: "scanned",
      actorType: "staff",
      actorId: staff.id,
      metadata: { page_count: parsed.data.pageCount },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Scan fulfillment failed" };
  }

  const fulfillErr = await fulfillRequestRow(staff.id, request.id);
  if (fulfillErr) return { error: fulfillErr };

  await notifyCustomer(admin, {
    customerId: request.customer_id,
    mailItemId: item.id,
    template: "scan_ready",
    subject: "Your mail scan is ready",
    body: `Your mail item ${item.barcode ?? ""} was opened with your consent and scanned (${parsed.data.pageCount} page${parsed.data.pageCount === 1 ? "" : "s"}). View it in your portal: ${portalUrl()}/portal/inbox`,
  });

  revalidatePath("/staff/queue");
  return { success: true };
}

// ── Forward ───────────────────────────────────────────────────────────────────

const forwardSchema = z.object({
  requestId: z.uuid(),
  carrier: z.string().trim().min(1, "Carrier is required").max(50),
  service: z.string().trim().min(1, "Service is required").max(100),
  postageCents: z.coerce.number().int().min(0).max(1_000_000),
  trackingNumber: z.string().trim().max(100),
});

export async function fulfillForward(formData: FormData): Promise<QueueActionResult> {
  const staff = await requireStaff("counter");

  const parsed = forwardSchema.safeParse({
    requestId: formData.get("requestId"),
    carrier: formData.get("carrier"),
    service: formData.get("service"),
    postageCents: formData.get("postageCents"),
    trackingNumber: formData.get("trackingNumber") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const input = parsed.data;

  // Admin client: mail pipeline transitions are server-mediated.
  const admin = createAdminClient();
  const loaded = await loadOpenRequest(admin, staff, input.requestId, ["forward"]);
  if ("error" in loaded) return loaded;
  const { request, item } = loaded;

  if (!["checked_in", "notified", "action_pending"].includes(item.status)) {
    return { error: `Item cannot be forwarded in status "${item.status}"` };
  }

  const supabase = await createClient();
  const { data: locationRow } = await supabase
    .from("locations")
    .select("settings")
    .eq("id", staff.location_id)
    .single();
  const settings = defaultSettings((locationRow?.settings ?? null) as LocationSettings | null);
  const markupCents = Math.round((input.postageCents * settings.forward_markup_pct) / 100);
  const handlingCents = settings.forward_handling_cents;

  try {
    await ensureActionPending(admin, item);
    await transitionMailItem(admin, {
      itemId: item.id,
      to: "out_for_forward",
      eventType: "out_for_forward",
      actorType: "staff",
      actorId: staff.id,
    });
    await transitionMailItem(admin, {
      itemId: item.id,
      to: "forwarded",
      eventType: "forwarded",
      actorType: "staff",
      actorId: staff.id,
      metadata: { tracking_number: input.trackingNumber || null, carrier: input.carrier },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Forward transition failed" };
  }

  // User-context writes — staff RLS policies allow these inserts.
  const { error: shipErr } = await supabase.from("forward_shipments").insert({
    action_request_id: request.id,
    to_address: request.params,
    carrier: input.carrier,
    service: input.service,
    postage_cents: input.postageCents,
    markup_cents: markupCents,
    handling_cents: handlingCents,
    tracking_number: input.trackingNumber || null,
    shipped_at: new Date().toISOString(),
  });
  if (shipErr) return { error: shipErr.message };

  const { error: usageErr } = await supabase.from("usage_records").insert({
    customer_id: request.customer_id,
    type: "forward_handling",
    qty: 1,
    unit_cents: input.postageCents + markupCents + handlingCents,
    mail_item_id: item.id,
  });
  if (usageErr) return { error: usageErr.message };

  const fulfillErr = await fulfillRequestRow(staff.id, request.id);
  if (fulfillErr) return { error: fulfillErr };

  await notifyCustomer(admin, {
    customerId: request.customer_id,
    mailItemId: item.id,
    template: "mail_forwarded",
    subject: "Your mail is on the way",
    body: `Your mail item ${item.barcode ?? ""} shipped via ${input.carrier} ${input.service}.${input.trackingNumber ? ` Tracking number: ${input.trackingNumber}.` : ""} Postage and handling will appear on your next invoice.`,
  });

  revalidatePath("/staff/queue");
  return { success: true };
}

// ── Shred / Recycle ───────────────────────────────────────────────────────────

const destroySchema = z.object({
  requestId: z.uuid(),
  mode: z.enum(["shred", "recycle"]),
});

export async function fulfillDestroy(
  requestId: string,
  mode: "shred" | "recycle"
): Promise<QueueActionResult> {
  const staff = await requireStaff("counter");
  const parsed = destroySchema.safeParse({ requestId, mode });
  if (!parsed.success) return { error: "Invalid request" };

  // Admin client: mail pipeline transitions are server-mediated.
  const admin = createAdminClient();
  const loaded = await loadOpenRequest(admin, staff, parsed.data.requestId, [parsed.data.mode]);
  if ("error" in loaded) return loaded;
  const { request, item } = loaded;

  if (!["checked_in", "notified", "action_pending"].includes(item.status)) {
    return { error: `Item cannot be ${parsed.data.mode === "shred" ? "shredded" : "recycled"} in status "${item.status}"` };
  }

  const target = parsed.data.mode === "shred" ? "shredded" : "recycled";
  try {
    await ensureActionPending(admin, item);
    await transitionMailItem(admin, {
      itemId: item.id,
      to: target,
      eventType: target,
      actorType: "staff",
      actorId: staff.id,
      metadata: { consent: { type: "action_request", id: request.id } },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Transition failed" };
  }

  const fulfillErr = await fulfillRequestRow(staff.id, request.id);
  if (fulfillErr) return { error: fulfillErr };

  await notifyCustomer(admin, {
    customerId: request.customer_id,
    mailItemId: item.id,
    template: `mail_${target}`,
    subject: `Your mail was ${target}`,
    body: `As you requested, mail item ${item.barcode ?? ""} was securely ${target}.`,
  });

  revalidatePath("/staff/queue");
  return { success: true };
}

// ── Pickup / Hold ─────────────────────────────────────────────────────────────

export async function fulfillPickupRequest(requestId: string): Promise<QueueActionResult> {
  const staff = await requireStaff("counter");
  const parsed = z.uuid().safeParse(requestId);
  if (!parsed.success) return { error: "Invalid request id" };

  // Admin client: mail pipeline transitions are server-mediated.
  const admin = createAdminClient();
  const loaded = await loadOpenRequest(admin, staff, parsed.data, [
    "pickup",
    "hold",
    "check_deposit",
  ]);
  if ("error" in loaded) return loaded;
  const { request, item } = loaded;

  if (item.status !== "held_for_pickup") {
    if (!["checked_in", "notified", "action_pending"].includes(item.status)) {
      return { error: `Item cannot be held in status "${item.status}"` };
    }
    try {
      await ensureActionPending(admin, item);
      await transitionMailItem(admin, {
        itemId: item.id,
        to: "held_for_pickup",
        eventType: "held_for_pickup",
        actorType: "staff",
        actorId: staff.id,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Transition failed" };
    }
  }

  const fulfillErr = await fulfillRequestRow(staff.id, request.id);
  if (fulfillErr) return { error: fulfillErr };

  await notifyCustomer(admin, {
    customerId: request.customer_id,
    mailItemId: item.id,
    template: "ready_for_pickup",
    subject: "Your mail is ready for pickup",
    body: `Mail item ${item.barcode ?? ""} is ready for pickup at the counter. Bring a photo ID.`,
  });

  revalidatePath("/staff/queue");
  return { success: true };
}
