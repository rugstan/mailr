"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripeConfigured } from "@/lib/stripe";
import { createPlanCheckoutSession } from "@/lib/billing";
import type { Plan } from "@/lib/types";

const schema = z.object({
  planId: z.uuid(),
  interval: z.enum(["month", "year"]),
});

export async function startCheckout(
  planId: string,
  interval: "month" | "year"
): Promise<{ error: string } | undefined> {
  // 1. Validate input.
  const parsed = schema.safeParse({ planId, interval });
  if (!parsed.success) return { error: "Invalid plan selection." };

  // 2. Authz.
  const customer = await requireCustomer();

  // 3. Read the plan through the user-context client (RLS: active plans only)
  //    and verify it is sellable to this customer.
  const supabase = await createClient();
  const { data: planRow } = await supabase.from("plans").select("*").eq("id", parsed.data.planId).maybeSingle();
  const plan = planRow as Plan | null;
  if (!plan || !plan.active || plan.mailbox_type !== "digital" || plan.location_id !== customer.location_id) {
    return { error: "That plan is not available." };
  }

  if (!stripeConfigured()) return { error: "Payments are not configured yet" };

  // Admin client: checkout provisioning persists Stripe ids onto plans and
  // customers — columns RLS intentionally blocks customers from writing.
  const admin = createAdminClient();
  let url: string;
  try {
    url = await createPlanCheckoutSession(admin, customer, plan, parsed.data.interval);
  } catch (err) {
    console.error("checkout session failed", err);
    return { error: "Could not start checkout. Please try again." };
  }
  redirect(url);
}
