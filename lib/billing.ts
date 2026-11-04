import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { notifyCustomer } from "@/lib/notify";
import { defaultSettings } from "@/lib/mail";
import type { Customer, Plan, Subscription } from "@/lib/types";

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Returns (creating if needed) the Stripe customer id for one of our customers. */
export async function ensureStripeCustomer(admin: SupabaseClient, customer: Customer): Promise<string> {
  if (customer.stripe_customer_id) return customer.stripe_customer_id;
  const stripe = getStripe();
  const sc = await stripe.customers.create({
    email: customer.email,
    name: customer.full_name,
    metadata: { customer_id: customer.id, location_id: customer.location_id },
  });
  const { error } = await admin
    .from("customers")
    .update({ stripe_customer_id: sc.id })
    .eq("id", customer.id)
    .is("stripe_customer_id", null);
  if (error) throw new Error(error.message);
  return sc.id;
}

/** Creates the Stripe product/prices for a plan on first use and persists ids. */
export async function ensurePlanPrices(admin: SupabaseClient, plan: Plan): Promise<Plan> {
  if (plan.stripe_price_monthly && (plan.annual_price_cents == null || plan.stripe_price_annual)) {
    return plan;
  }
  const stripe = getStripe();
  let productId = plan.stripe_product_id;
  if (!productId) {
    const product = await stripe.products.create({
      name: plan.name,
      metadata: { plan_id: plan.id, location_id: plan.location_id, tier: plan.tier },
    });
    productId = product.id;
  }
  let monthly = plan.stripe_price_monthly;
  if (!monthly) {
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: plan.monthly_price_cents,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { plan_id: plan.id, interval: "month" },
    });
    monthly = price.id;
  }
  let annual = plan.stripe_price_annual;
  if (!annual && plan.annual_price_cents != null) {
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: plan.annual_price_cents,
      currency: "usd",
      recurring: { interval: "year" },
      metadata: { plan_id: plan.id, interval: "year" },
    });
    annual = price.id;
  }
  const { data, error } = await admin
    .from("plans")
    .update({ stripe_product_id: productId, stripe_price_monthly: monthly, stripe_price_annual: annual })
    .eq("id", plan.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Plan;
}

/**
 * Subscription checkout — card required, no trial without card (autopay or no
 * service). Mailbox is assigned by the webhook after payment succeeds.
 */
export async function createPlanCheckoutSession(
  admin: SupabaseClient,
  customer: Customer,
  plan: Plan,
  interval: "month" | "year"
): Promise<string> {
  const stripe = getStripe();
  const hydrated = await ensurePlanPrices(admin, plan);
  const price = interval === "year" ? hydrated.stripe_price_annual : hydrated.stripe_price_monthly;
  if (!price) throw new Error("Plan has no price for the requested interval");
  const stripeCustomerId = await ensureStripeCustomer(admin, customer);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price, quantity: 1 }],
    success_url: `${appUrl()}/onboarding/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/onboarding?canceled=1`,
    metadata: { customer_id: customer.id, plan_id: plan.id },
    subscription_data: {
      metadata: { customer_id: customer.id, plan_id: plan.id, location_id: customer.location_id },
    },
    allow_promotion_codes: true,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createBillingPortalSession(customer: Customer): Promise<string> {
  if (!customer.stripe_customer_id) throw new Error("No Stripe customer on file");
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.stripe_customer_id,
    return_url: `${appUrl()}/portal/billing`,
  });
  return session.url;
}

// ── Webhook handlers (invoked from /api/webhooks/stripe with verified events) ──

function physicalSizeForTier(tier: string): string | null {
  if (tier === "physical_s") return "s";
  if (tier === "physical_m") return "m";
  if (tier === "physical_l") return "l";
  return null;
}

export async function handleCheckoutCompleted(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session
): Promise<void> {
  const customerId = session.metadata?.customer_id;
  const planId = session.metadata?.plan_id;
  if (!customerId || !planId) return;

  const { data: customer } = await admin.from("customers").select("*").eq("id", customerId).single();
  const { data: plan } = await admin.from("plans").select("*").eq("id", planId).single();
  if (!customer || !plan) return;

  // Idempotency: skip if this Stripe subscription is already recorded.
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (subId) {
    const { data: existing } = await admin
      .from("subscriptions")
      .select("id")
      .eq("stripe_subscription_id", subId)
      .maybeSingle();
    if (existing) return;
  }

  // Reuse the customer's mailbox if they already have one of this type; else assign.
  let mailboxId: string | null = null;
  let pmbNumber: number | null = null;
  const { data: existingBox } = await admin
    .from("mailboxes")
    .select("id, pmb_number")
    .eq("customer_id", customerId)
    .eq("type", (plan as Plan).mailbox_type)
    .eq("status", "active")
    .maybeSingle();
  if (existingBox) {
    mailboxId = existingBox.id;
    pmbNumber = existingBox.pmb_number;
  } else {
    const { data: box, error } = await admin.rpc("assign_mailbox", {
      p_location: customer.location_id,
      p_customer: customerId,
      p_type: (plan as Plan).mailbox_type,
      p_size: physicalSizeForTier((plan as Plan).tier),
    });
    if (error) throw new Error(`mailbox assignment failed: ${error.message}`);
    mailboxId = box.id;
    pmbNumber = box.pmb_number;
  }

  const { error: subErr } = await admin.from("subscriptions").insert({
    customer_id: customerId,
    plan_id: planId,
    mailbox_id: mailboxId,
    stripe_subscription_id: subId ?? null,
    status: "active",
    current_period_start: new Date().toISOString(),
    quota_usage: {},
  });
  if (subErr) throw new Error(subErr.message);

  await admin
    .from("customers")
    .update({ status: "active", suspended_at: null, suspension_reason: null })
    .eq("id", customerId);

  const { data: location } = await admin
    .from("locations")
    .select("street_address, city, state, zip")
    .eq("id", customer.location_id)
    .single();
  await notifyCustomer(admin, {
    customerId,
    template: "address_issued",
    subject: `Your new mailing address — PMB ${pmbNumber}`,
    body: `Welcome! Your new address is:\n\n${customer.full_name}\n${location?.street_address} PMB ${pmbNumber}\n${location?.city}, ${location?.state} ${location?.zip}\n\nNote: mail can only be received for recipients with a verified USPS Form 1583. Complete verification in your portal or in store.`,
  });
}

export async function handleInvoicePaid(admin: SupabaseClient, invoice: Stripe.Invoice): Promise<void> {
  const subId = stripeSubscriptionIdFromInvoice(invoice);
  if (!subId) return;
  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  if (!sub) return;

  await admin
    .from("subscriptions")
    .update({
      status: "active",
      quota_usage: {},
      dunning: {},
      current_period_start: new Date((invoice.period_start ?? Date.now() / 1000) * 1000).toISOString(),
      current_period_end: new Date((invoice.period_end ?? Date.now() / 1000) * 1000).toISOString(),
    })
    .eq("id", sub.id);

  // Reactivate the customer if every other subscription is also in good standing.
  const { data: bad } = await admin
    .from("subscriptions")
    .select("id")
    .eq("customer_id", sub.customer_id)
    .in("status", ["past_due", "suspended"]);
  if (!bad || bad.length === 0) {
    await admin
      .from("customers")
      .update({ status: "active", suspended_at: null, suspension_reason: null })
      .eq("id", sub.customer_id)
      .neq("status", "canceled");
  }

  await flushPendingUsage(admin, sub.customer_id);
}

export async function handleInvoiceFailed(admin: SupabaseClient, invoice: Stripe.Invoice): Promise<void> {
  const subId = stripeSubscriptionIdFromInvoice(invoice);
  if (!subId) return;
  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  if (!sub) return;

  const dunning = (sub as Subscription).dunning ?? {};
  if (!dunning.failed_at) {
    dunning.failed_at = new Date().toISOString();
    dunning.notices_sent = [];
  }
  await admin.from("subscriptions").update({ status: "past_due", dunning }).eq("id", sub.id);
  await admin
    .from("customers")
    .update({ status: "past_due" })
    .eq("id", sub.customer_id)
    .in("status", ["active", "trialing", "past_due"]);

  await notifyCustomer(admin, {
    customerId: sub.customer_id,
    template: "payment_failed",
    subject: "Payment failed — action required",
    body: "Your mailbox payment failed. Please update your card in the billing portal. Service is suspended and mail is held if the balance is not resolved within 10 days. A late fee applies after 3 days.",
    channels: ["email", "sms"],
  });
}

export async function handleSubscriptionDeleted(
  admin: SupabaseClient,
  sub: Stripe.Subscription
): Promise<void> {
  const { data: row } = await admin
    .from("subscriptions")
    .select("*")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  if (!row) return;
  await admin.from("subscriptions").update({ status: "canceled" }).eq("id", row.id);

  const { data: remaining } = await admin
    .from("subscriptions")
    .select("id")
    .eq("customer_id", row.customer_id)
    .neq("status", "canceled");
  if (!remaining || remaining.length === 0) {
    await admin.from("customers").update({ status: "canceled" }).eq("id", row.customer_id);
    await notifyCustomer(admin, {
      customerId: row.customer_id,
      template: "subscription_canceled",
      subject: "Your mailbox service has ended",
      body: "Your subscription was canceled. Per USPS rules, your Form 1583 will be terminated and mail will no longer be accepted. Contact the store to arrange final mail forwarding within 30 days.",
    });
  }
}

function stripeSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  // API 2025-03+ moved invoice.subscription under parent.subscription_details.
  const inv = invoice as unknown as {
    subscription?: string | { id: string } | null;
    parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
  };
  const raw = inv.subscription ?? inv.parent?.subscription_details?.subscription ?? null;
  if (!raw) return null;
  return typeof raw === "string" ? raw : raw.id;
}

/** Pushes unbilled usage_records (overages, storage days, late fees…) to Stripe as invoice items. */
export async function flushPendingUsage(admin: SupabaseClient, customerId: string): Promise<number> {
  const { data: customer } = await admin.from("customers").select("*").eq("id", customerId).single();
  if (!customer?.stripe_customer_id) return 0;
  const { data: records } = await admin
    .from("usage_records")
    .select("*")
    .eq("customer_id", customerId)
    .eq("stripe_recorded", false);
  if (!records?.length) return 0;

  const stripe = getStripe();
  const labels: Record<string, string> = {
    scan_overage: "Open & scan overage",
    forward_handling: "Mail forwarding & handling",
    check_deposit: "Check deposit service",
    storage_day: "Package storage day",
    extra_recipient: "Additional recipient",
    rush_scan: "Rush scan",
    shred: "Shredding service",
    late_fee: "Late payment fee",
  };
  let flushed = 0;
  for (const rec of records) {
    const amount = rec.unit_cents * rec.qty;
    // Claim-before-charge: only the caller that wins this conditional update
    // performs the Stripe call, so concurrent webhook/cron runs can't double-bill.
    const { data: claimed } = await admin
      .from("usage_records")
      .update({ stripe_recorded: true })
      .eq("id", rec.id)
      .eq("stripe_recorded", false)
      .select("id");
    if (!claimed?.length) continue;
    if (amount <= 0) continue;
    try {
      await stripe.invoiceItems.create(
        {
          customer: customer.stripe_customer_id,
          amount,
          currency: "usd",
          description: `${labels[rec.type] ?? rec.type}${rec.qty > 1 ? ` ×${rec.qty}` : ""}`,
        },
        // Deterministic key: even a crash-and-retry can't create a duplicate item.
        { idempotencyKey: `usage-${rec.id}` }
      );
      flushed++;
    } catch (err) {
      // Un-claim so a later sweep retries; the idempotency key keeps that safe.
      await admin.from("usage_records").update({ stripe_recorded: false }).eq("id", rec.id);
      throw err;
    }
  }
  return flushed;
}

/**
 * Daily dunning sweep (cron): notices on configured days, late fee after the
 * grace period, suspension (mail restricted) after the cutoff.
 */
export async function runDunningSweep(admin: SupabaseClient): Promise<{
  notices: number;
  lateFees: number;
  suspensions: number;
}> {
  const result = { notices: 0, lateFees: 0, suspensions: 0 };
  const { data: subs } = await admin.from("subscriptions").select("*").eq("status", "past_due");
  if (!subs?.length) return result;

  for (const sub of subs as Subscription[]) {
    const failedAt = sub.dunning?.failed_at ? new Date(sub.dunning.failed_at) : null;
    if (!failedAt) continue;
    const { data: customer } = await admin
      .from("customers")
      .select("*, locations:location_id (settings)")
      .eq("id", sub.customer_id)
      .single();
    if (!customer) continue;
    const settings = defaultSettings(
      (customer as unknown as { locations: { settings: Record<string, unknown> } }).locations?.settings
    );
    const days = Math.floor((Date.now() - failedAt.getTime()) / 86400000);
    const dunning = { ...(sub.dunning ?? {}) };
    let dirty = false;

    for (const noticeDay of settings.dunning_days) {
      if (days >= noticeDay && !(dunning.notices_sent ?? []).includes(noticeDay)) {
        await notifyCustomer(admin, {
          customerId: sub.customer_id,
          template: `dunning_day_${noticeDay}`,
          subject: "Payment overdue — your mailbox service is at risk",
          body: `Your payment is ${days} day(s) overdue. Update your card in the billing portal to avoid suspension. After ${settings.suspend_after_days} days your service is suspended and mail is held until the balance is paid.`,
          channels: ["email", "sms"],
        });
        dunning.notices_sent = [...(dunning.notices_sent ?? []), noticeDay];
        result.notices++;
        dirty = true;
      }
    }

    if (days >= settings.late_fee_grace_days && !dunning.late_fee_applied_at) {
      await admin.from("usage_records").insert({
        customer_id: sub.customer_id,
        subscription_id: sub.id,
        type: "late_fee",
        qty: 1,
        unit_cents: settings.late_fee_cents,
        period: new Date().toISOString().slice(0, 10),
      });
      dunning.late_fee_applied_at = new Date().toISOString();
      result.lateFees++;
      dirty = true;
      await flushPendingUsage(admin, sub.customer_id);
      await notifyCustomer(admin, {
        customerId: sub.customer_id,
        template: "late_fee_applied",
        subject: "A late fee was added to your account",
        body: `A late fee of $${(settings.late_fee_cents / 100).toFixed(2)} was applied because your payment is more than ${settings.late_fee_grace_days} days overdue.`,
      });
    }

    if (dirty) {
      await admin.from("subscriptions").update({ dunning }).eq("id", sub.id);
    }

    if (days >= settings.suspend_after_days) {
      await admin.from("subscriptions").update({ status: "suspended" }).eq("id", sub.id);
      await admin
        .from("customers")
        .update({
          status: "suspended",
          suspended_at: new Date().toISOString(),
          suspension_reason: "payment_failure",
        })
        .eq("id", sub.customer_id);
      await notifyCustomer(admin, {
        customerId: sub.customer_id,
        template: "service_suspended",
        subject: "Service suspended — mail is being held",
        body: "Your mailbox service is suspended for non-payment. Incoming mail is held securely but scans, pickups, and forwarding are paused until the balance is paid. Pay now in the billing portal to restore service.",
        channels: ["email", "sms"],
      });
      result.suspensions++;
    }
  }
  return result;
}

/** Nightly: bill storage days for packages past their free window. */
export async function runStorageSweep(admin: SupabaseClient): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: items } = await admin
    .from("mail_items")
    .select("id, mailbox_id, storage_free_until, location_id")
    .eq("kind", "package")
    .not("storage_free_until", "is", null)
    .lt("storage_free_until", today)
    .in("status", ["checked_in", "notified", "action_pending", "held_for_pickup"]);
  if (!items?.length) return 0;

  let billed = 0;
  for (const item of items) {
    const { data: mailbox } = await admin
      .from("mailboxes")
      .select("customer_id")
      .eq("id", item.mailbox_id)
      .single();
    if (!mailbox?.customer_id) continue;
    // One storage_day per item per day (skip if already billed today).
    const { data: existing } = await admin
      .from("usage_records")
      .select("id")
      .eq("mail_item_id", item.id)
      .eq("type", "storage_day")
      .eq("period", today)
      .maybeSingle();
    if (existing) continue;
    const { data: loc } = await admin
      .from("locations")
      .select("settings")
      .eq("id", item.location_id)
      .single();
    const settings = defaultSettings(loc?.settings);
    await admin.from("usage_records").insert({
      customer_id: mailbox.customer_id,
      type: "storage_day",
      qty: 1,
      unit_cents: settings.storage_day_cents,
      mail_item_id: item.id,
      period: today,
    });
    billed++;
  }
  return billed;
}
