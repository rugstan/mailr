"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Plan } from "@/lib/types";

export interface SettingsResult {
  error?: string;
  success?: boolean;
}

// ── Profile ───────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name.").max(120),
  phone: z.string().trim().max(30).optional(),
});

export async function updateProfile(_prev: SettingsResult, formData: FormData): Promise<SettingsResult> {
  const parsed = profileSchema.safeParse({
    full_name: String(formData.get("full_name") ?? ""),
    phone: String(formData.get("phone") ?? "").trim() || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const customer = await requireCustomer();

  // User client: RLS limits the update to the customer's own row and the grant
  // is column-limited (full_name, phone, notification_prefs).
  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ full_name: parsed.data.full_name, phone: parsed.data.phone ?? null })
    .eq("id", customer.id);
  if (error) {
    console.error("profile update failed", error);
    return { error: "Could not save your profile. Please try again." };
  }

  revalidatePath("/portal/settings");
  revalidatePath("/portal", "layout"); // sidebar shows the name
  return { success: true };
}

// ── Notification preferences ──────────────────────────────────────────────────

const prefSchema = z.object({
  key: z.enum(["urgent_sms", "scan_ready_email", "bill_reminders"]),
  value: z.boolean(),
});

export async function setNotificationPref(
  key: "urgent_sms" | "scan_ready_email" | "bill_reminders",
  value: boolean
): Promise<SettingsResult> {
  const parsed = prefSchema.safeParse({ key, value });
  if (!parsed.success) return { error: "Invalid preference." };

  const customer = await requireCustomer();
  const prefs = { ...(customer.notification_prefs ?? {}), [parsed.data.key]: parsed.data.value };

  const supabase = await createClient();
  const { error } = await supabase.from("customers").update({ notification_prefs: prefs }).eq("id", customer.id);
  if (error) {
    console.error("notification pref update failed", error);
    return { error: "Could not save the preference." };
  }

  revalidatePath("/portal/settings");
  return { success: true };
}

// ── Recipients ────────────────────────────────────────────────────────────────

const recipientSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the recipient's full name.").max(120),
  business_name: z.string().trim().max(160).optional(),
  is_minor: z.boolean(),
});

export async function addRecipient(_prev: SettingsResult, formData: FormData): Promise<SettingsResult> {
  const parsed = recipientSchema.safeParse({
    full_name: String(formData.get("full_name") ?? ""),
    business_name: String(formData.get("business_name") ?? "").trim() || undefined,
    is_minor: formData.get("is_minor") != null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const customer = await requireCustomer();
  const supabase = await createClient();

  // Enforce the plan's recipient quota (-1 / absent = unlimited).
  const [{ count }, { data: subRow }] = await Promise.all([
    supabase
      .from("recipients")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customer.id),
    supabase
      .from("subscriptions")
      .select("plan:plans(quotas)")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const quotas = ((subRow as { plan: Pick<Plan, "quotas"> | null } | null)?.plan?.quotas ?? {}) as Record<
    string,
    number
  >;
  const limit = quotas.recipients;
  if (limit != null && limit >= 0 && (count ?? 0) >= limit) {
    return {
      error: `Your plan includes ${limit} recipient${limit === 1 ? "" : "s"} — upgrade your plan to add more.`,
    };
  }

  // The recipient attaches to the customer's mailbox (user-context read).
  const { data: boxRow } = await supabase
    .from("mailboxes")
    .select("id")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!boxRow) return { error: "No mailbox on your account yet — finish onboarding first." };

  // User client insert: RLS WITH CHECK forces ownership and status 'pending_id'.
  const { error } = await supabase.from("recipients").insert({
    customer_id: customer.id,
    mailbox_id: (boxRow as { id: string }).id,
    full_name: parsed.data.full_name,
    business_name: parsed.data.business_name ?? null,
    is_minor: parsed.data.is_minor,
    status: "pending_id",
  });
  if (error) {
    console.error("recipient insert failed", error);
    return { error: "Could not add the recipient. Please try again." };
  }

  revalidatePath("/portal/settings");
  return { success: true };
}
