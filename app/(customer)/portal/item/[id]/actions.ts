"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeSlaDue, transitionMailItem } from "@/lib/mail";
import type { ActionRequest, MailItem } from "@/lib/types";

export interface ActionResult {
  error?: string;
  success?: boolean;
}

const forwardAddressSchema = z.object({
  name: z.string().trim().min(2, "Recipient name is required.").max(120),
  street: z.string().trim().min(3, "Street address is required.").max(200),
  city: z.string().trim().min(2, "City is required.").max(100),
  state: z.string().trim().min(2, "State is required.").max(40),
  zip: z.string().trim().min(3, "ZIP is required.").max(20),
});

const requestSchema = z.object({
  itemId: z.uuid(),
  action: z.enum(["open_scan", "forward", "pickup", "shred", "recycle"]),
  rush: z.boolean(),
  params: forwardAddressSchema.optional(),
});

const ACTIONABLE_STATUSES = ["checked_in", "notified", "action_pending"] as const;

export async function requestAction(
  itemId: string,
  action: "open_scan" | "forward" | "pickup" | "shred" | "recycle",
  rush: boolean,
  params?: { name: string; street: string; city: string; state: string; zip: string }
): Promise<ActionResult> {
  // 1. Validate input.
  const parsed = requestSchema.safeParse({ itemId, action, rush, params });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  if (parsed.data.action === "forward" && !parsed.data.params) {
    return { error: "A forwarding address is required." };
  }

  // 2. Authz.
  const customer = await requireCustomer();

  // 3. Re-read the item through the user-context client — proves ownership
  //    (RLS returns nothing for someone else's mail).
  const supabase = await createClient();
  const { data: itemRow } = await supabase
    .from("mail_items")
    .select("*")
    .eq("id", parsed.data.itemId)
    .maybeSingle();
  const item = itemRow as MailItem | null;
  if (!item) return { error: "Mail item not found." };
  if (!ACTIONABLE_STATUSES.includes(item.status as (typeof ACTIONABLE_STATUSES)[number])) {
    return { error: "This item can no longer be actioned." };
  }

  // 4. Reject if an open request already exists.
  const { data: openRows } = await supabase
    .from("action_requests")
    .select("id")
    .eq("mail_item_id", item.id)
    .in("status", ["requested", "in_progress"])
    .limit(1);
  if (openRows && openRows.length > 0) {
    return { error: "There's already an open request for this item. Cancel it first to choose differently." };
  }

  // 5. SLA in the location's timezone (locations are readable to all signed-in users).
  const { data: locRow } = await supabase
    .from("locations")
    .select("timezone")
    .eq("id", item.location_id)
    .maybeSingle();
  const timezone = (locRow as { timezone: string } | null)?.timezone ?? "America/Los_Angeles";

  // 6. Insert through the USER client — RLS WITH CHECK enforces ownership and
  //    the DB trigger blocks suspended accounts.
  const { error: insertError } = await supabase.from("action_requests").insert({
    mail_item_id: item.id,
    customer_id: customer.id,
    action: parsed.data.action,
    status: "requested",
    rush: parsed.data.rush,
    sla_due_at: computeSlaDue(parsed.data.rush, timezone),
    params: parsed.data.action === "forward" ? { to_address: parsed.data.params } : {},
  });
  if (insertError) {
    if (insertError.message.includes("SERVICE SUSPENDED")) {
      return { error: "Your account is suspended — settle your balance to request actions." };
    }
    console.error("action request insert failed", insertError);
    return { error: "Could not submit the request. Please try again." };
  }

  // 7. Move checked_in/notified → action_pending. Admin client justified:
  //    mail_items status writes are staff/system-only under RLS; ownership was
  //    proven by the user-context read above.
  if (item.status === "checked_in" || item.status === "notified") {
    try {
      const admin = createAdminClient();
      await transitionMailItem(admin, {
        itemId: item.id,
        to: "action_pending",
        eventType: "action_requested",
        actorType: "customer",
        actorId: customer.id,
        metadata: { action: parsed.data.action },
      });
    } catch (err) {
      // A concurrent transition can race us — the request itself stands.
      console.warn("action_pending transition skipped", err);
    }
  }

  revalidatePath(`/portal/item/${item.id}`);
  revalidatePath("/portal");
  return { success: true };
}

export async function cancelRequest(requestId: string): Promise<ActionResult> {
  // 1. Validate input.
  const parsed = z.uuid().safeParse(requestId);
  if (!parsed.success) return { error: "Invalid request." };

  // 2. Authz.
  const customer = await requireCustomer();

  // 3. Read the row through the user-context client first — never trust client ids.
  const supabase = await createClient();
  const { data: reqRow } = await supabase
    .from("action_requests")
    .select("*")
    .eq("id", parsed.data)
    .eq("customer_id", customer.id)
    .maybeSingle();
  const request = reqRow as ActionRequest | null;
  if (!request) return { error: "Request not found." };
  if (request.status !== "requested") {
    return { error: "This request is already being worked on and can no longer be canceled." };
  }

  // 4. Update via the user client — the DB trigger only permits requested → canceled.
  const { error } = await supabase
    .from("action_requests")
    .update({ status: "canceled" })
    .eq("id", request.id)
    .eq("customer_id", customer.id);
  if (error) {
    console.error("cancel request failed", error);
    return { error: "Could not cancel the request. Please try again." };
  }

  revalidatePath(`/portal/item/${request.mail_item_id}`);
  revalidatePath("/portal");
  return { success: true };
}
