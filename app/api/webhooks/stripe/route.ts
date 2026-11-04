import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleCheckoutCompleted,
  handleInvoiceFailed,
  handleInvoicePaid,
  handleSubscriptionDeleted,
} from "@/lib/billing";

export const runtime = "nodejs";

/**
 * Stripe webhook receiver. Signature-verified, idempotent via the
 * stripe_events ledger, and delegates all business logic to lib/billing.
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeConfigured() || !webhookSecret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const sig = request.headers.get("stripe-signature");
  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig ?? "", webhookSecret);
  } catch (err) {
    console.error("stripe webhook signature verification failed", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  // Service role: webhooks have no user session, and the idempotency ledger is service-role only.
  const admin = createAdminClient();

  // Idempotency: insert-or-ignore into the ledger. Zero rows back ⇒ this
  // event id was already processed (Stripe retried) ⇒ acknowledge and stop.
  const { data: ledger, error: ledgerErr } = await admin
    .from("stripe_events")
    .upsert({ id: event.id, type: event.type }, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  if (ledgerErr) {
    console.error("stripe webhook idempotency ledger failed", ledgerErr);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
  if (!ledger || ledger.length === 0) {
    return NextResponse.json({ received: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(admin, event.data.object as Stripe.Checkout.Session);
        break;
      case "invoice.paid":
        await handleInvoicePaid(admin, event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handleInvoiceFailed(admin, event.data.object as Stripe.Invoice);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(admin, event.data.object as Stripe.Subscription);
        break;
      default:
        // Unhandled event types are acknowledged without side effects.
        break;
    }
  } catch (err) {
    console.error(`stripe webhook handler failed for ${event.type} (${event.id})`, err);
    // Release the ledger entry so Stripe's retry re-runs the (idempotent) handler.
    await admin.from("stripe_events").delete().eq("id", event.id);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
