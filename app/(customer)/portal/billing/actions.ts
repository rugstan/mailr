"use server";

import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { stripeConfigured } from "@/lib/stripe";
import { createBillingPortalSession } from "@/lib/billing";

export interface PortalState {
  error?: string;
}

export async function openBillingPortal(_prev: PortalState, _formData: FormData): Promise<PortalState> {
  // Authz first — no other inputs to validate (the form carries no fields).
  const customer = await requireCustomer();

  if (!customer.stripe_customer_id || !stripeConfigured()) {
    return { error: "Billing portal isn't available yet — no payment profile on file." };
  }

  let url: string;
  try {
    url = await createBillingPortalSession(customer);
  } catch (err) {
    console.error("billing portal session failed", err);
    return { error: "Could not open the billing portal. Please try again." };
  }
  redirect(url);
}
