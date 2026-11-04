"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { StandingRule } from "@/lib/types";

export interface RuleResult {
  error?: string;
  success?: boolean;
}

const MAIL_CATEGORIES = [
  "bill", "government", "legal", "financial", "check", "personal", "marketing",
  "package_contents", "unknown",
] as const;

const createSchema = z
  .object({
    matchType: z.enum(["category", "sender"]),
    category: z.enum(MAIL_CATEGORIES).optional(),
    sender: z.string().trim().min(2, "Enter at least 2 characters of the sender name.").max(120).optional(),
    action: z.enum(["open_scan", "shred", "recycle"]),
    priority: z.coerce.number().int().min(1).max(9999),
  })
  .refine((v) => (v.matchType === "category" ? Boolean(v.category) : Boolean(v.sender)), {
    message: "Pick a category or enter a sender to match.",
  });

export async function createRule(input: {
  matchType: "category" | "sender";
  category?: string;
  sender?: string;
  action: "open_scan" | "shred" | "recycle";
  priority: number;
}): Promise<RuleResult> {
  // 1. Validate input.
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the rule and try again." };

  // 2. Authz.
  const customer = await requireCustomer();

  // 3. Insert via the user client — RLS owns the rows (WITH CHECK customer_id).
  const match =
    parsed.data.matchType === "category"
      ? { category: parsed.data.category }
      : { sender_contains: parsed.data.sender };
  const supabase = await createClient();
  const { error } = await supabase.from("standing_rules").insert({
    customer_id: customer.id,
    priority: parsed.data.priority,
    match,
    action: parsed.data.action,
    active: true,
  });
  if (error) {
    console.error("rule create failed", error);
    return { error: "Could not create the rule. Please try again." };
  }

  revalidatePath("/portal/rules");
  return { success: true };
}

export async function toggleRule(ruleId: string, active: boolean): Promise<RuleResult> {
  const parsed = z.object({ ruleId: z.uuid(), active: z.boolean() }).safeParse({ ruleId, active });
  if (!parsed.success) return { error: "Invalid request." };

  const customer = await requireCustomer();

  // Verify ownership via a user-context read before writing.
  const supabase = await createClient();
  const { data: rule } = await supabase
    .from("standing_rules")
    .select("id")
    .eq("id", parsed.data.ruleId)
    .eq("customer_id", customer.id)
    .maybeSingle();
  if (!rule) return { error: "Rule not found." };

  const { error } = await supabase
    .from("standing_rules")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.ruleId)
    .eq("customer_id", customer.id);
  if (error) {
    console.error("rule toggle failed", error);
    return { error: "Could not update the rule." };
  }

  revalidatePath("/portal/rules");
  return { success: true };
}

export async function deleteRule(ruleId: string): Promise<RuleResult> {
  const parsed = z.uuid().safeParse(ruleId);
  if (!parsed.success) return { error: "Invalid request." };

  const customer = await requireCustomer();

  // Verify ownership via a user-context read before deleting.
  const supabase = await createClient();
  const { data: rule } = await supabase
    .from("standing_rules")
    .select("*")
    .eq("id", parsed.data)
    .eq("customer_id", customer.id)
    .maybeSingle();
  if (!(rule as StandingRule | null)) return { error: "Rule not found." };

  const { error } = await supabase
    .from("standing_rules")
    .delete()
    .eq("id", parsed.data)
    .eq("customer_id", customer.id);
  if (error) {
    console.error("rule delete failed", error);
    return { error: "Could not delete the rule." };
  }

  revalidatePath("/portal/rules");
  return { success: true };
}
