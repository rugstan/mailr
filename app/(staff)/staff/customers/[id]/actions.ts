"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { notifyCustomer } from "@/lib/notify";

export type CustomerAdminResult = { success: true } | { error: string };

const suspendSchema = z.object({
  customerId: z.uuid(),
  reason: z.string().trim().min(3, "Give a short reason").max(500),
});

export async function suspendCustomer(input: {
  customerId: string;
  reason: string;
}): Promise<CustomerAdminResult> {
  const staff = await requireStaff("manager");

  const parsed = suspendSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { customerId, reason } = parsed.data;

  // Authz: the customer must belong to this manager's location (user-context read).
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, status")
    .eq("id", customerId)
    .eq("location_id", staff.location_id)
    .maybeSingle();
  if (!customer) return { error: "Customer not found at your location" };
  if (customer.status === "suspended") return { error: "Customer is already suspended" };

  // Admin client: customer/subscription status fields are not client-updatable
  // by RLS design — suspension is a server-mediated state change.
  const admin = createAdminClient();
  const { error: custErr } = await admin
    .from("customers")
    .update({
      status: "suspended",
      suspended_at: new Date().toISOString(),
      suspension_reason: reason,
    })
    .eq("id", customerId);
  if (custErr) return { error: custErr.message };

  const { error: subErr } = await admin
    .from("subscriptions")
    .update({ status: "suspended" })
    .eq("customer_id", customerId)
    .neq("status", "canceled");
  if (subErr) return { error: subErr.message };

  await notifyCustomer(admin, {
    customerId,
    template: "service_suspended",
    subject: "Service suspended — mail is being held",
    body: `Your mailbox service was suspended: ${reason}. Incoming mail is held securely, but scans, pickups, and forwarding are paused until the account is brought current.`,
    channels: ["email", "sms"],
  });

  revalidatePath(`/staff/customers/${customerId}`);
  revalidatePath("/staff/customers");
  return { success: true };
}

export async function reactivateCustomer(customerId: string): Promise<CustomerAdminResult> {
  const staff = await requireStaff("manager");

  const parsed = z.uuid().safeParse(customerId);
  if (!parsed.success) return { error: "Invalid customer id" };

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, status")
    .eq("id", parsed.data)
    .eq("location_id", staff.location_id)
    .maybeSingle();
  if (!customer) return { error: "Customer not found at your location" };
  if (customer.status !== "suspended") return { error: "Customer is not suspended" };

  // Admin client: status fields are not client-updatable by RLS design.
  const admin = createAdminClient();
  const { error: custErr } = await admin
    .from("customers")
    .update({ status: "active", suspended_at: null, suspension_reason: null })
    .eq("id", parsed.data);
  if (custErr) return { error: custErr.message };

  const { error: subErr } = await admin
    .from("subscriptions")
    .update({ status: "active" })
    .eq("customer_id", parsed.data)
    .eq("status", "suspended");
  if (subErr) return { error: subErr.message };

  await notifyCustomer(admin, {
    customerId: parsed.data,
    template: "service_restored",
    subject: "Service restored",
    body: "Your mailbox service is active again. Scans, pickups, and forwarding have resumed — thanks for bringing the account current.",
  });

  revalidatePath(`/staff/customers/${parsed.data}`);
  revalidatePath("/staff/customers");
  return { success: true };
}
