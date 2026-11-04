import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/ratelimit";
import type { Location, Plan } from "@/lib/types";
import { SiteNav } from "@/components/marketing/site-nav";
import { Hero } from "@/components/marketing/hero";
import { TrustStrip } from "@/components/marketing/trust-strip";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Features } from "@/components/marketing/features";
import { Testimonials } from "@/components/marketing/testimonials";
import { Pricing, type PricingTier } from "@/components/marketing/pricing";
import { Faq } from "@/components/marketing/faq";
import { LeadCta } from "@/components/marketing/lead-cta";
import { SiteFooter } from "@/components/marketing/site-footer";

const DEFAULT_SLUG = process.env.DEFAULT_LOCATION_SLUG ?? "postalannex-main";

const leadSchema = z.object({
  email: z.email(),
  plan_interest: z.string().max(60).optional(),
});

/** Lead capture — anonymous by design, so rate limiting stands in for authz. */
async function captureLead(formData: FormData) {
  "use server";
  const parsed = leadSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    plan_interest: String(formData.get("plan_interest") ?? "") || undefined,
  });
  if (!parsed.success) redirect("/?lead=invalid#lead");

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`lead:${ip}`, 5, 3600, true))) redirect("/?lead=limit#lead");

  try {
    const admin = createAdminClient();
    const { data: loc } = await admin.from("locations").select("id").eq("slug", DEFAULT_SLUG).maybeSingle();
    await admin.from("leads").insert({
      location_id: (loc as { id: string } | null)?.id ?? null,
      email: parsed.data.email,
      plan_interest: parsed.data.plan_interest ?? null,
      source: "landing",
    });
  } catch (err) {
    console.error("lead capture failed", err);
    redirect("/?lead=error#lead");
  }
  redirect("/?lead=ok#lead");
}

function quotaFeatures(plan: Plan): string[] {
  const q = plan.quotas ?? {};
  const features: string[] = ["Real street address & private PMB"];
  const scans = q.open_scans;
  if (scans != null) features.push(scans < 0 ? "Unlimited open & scans" : `${scans} open & scans / month`);
  const items = q.items;
  if (items != null) features.push(items < 0 ? "Unlimited incoming items" : `Up to ${items} items / month`);
  const recipients = q.recipients;
  if (recipients != null)
    features.push(recipients < 0 ? "Unlimited recipients" : `${recipients} recipient${recipients === 1 ? "" : "s"}`);
  features.push("Forward or shred on request");
  return features;
}

export default async function Home({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const { lead } = await searchParams;

  // Anonymous reads: location (public columns) + active digital plan catalog.
  const supabase = await createClient();
  const { data: locRow } = await supabase
    .from("locations")
    .select("id, name, street_address, city, state, zip")
    .eq("slug", DEFAULT_SLUG)
    .maybeSingle();
  const location = locRow as Pick<Location, "id" | "name" | "street_address" | "city" | "state" | "zip"> | null;

  let plans: Plan[] = [];
  if (location) {
    const { data: planRows } = await supabase
      .from("plans")
      .select("*")
      .eq("location_id", location.id)
      .eq("mailbox_type", "digital")
      .eq("active", true)
      .order("monthly_price_cents", { ascending: true });
    plans = (planRows ?? []) as Plan[];
  }

  const tiers: PricingTier[] = plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    tier: plan.tier,
    monthlyCents: plan.monthly_price_cents,
    annualCents: plan.annual_price_cents ?? null,
    features: quotaFeatures(plan),
    popular: plan.tier === "digital_plus",
  }));

  const planLite = plans.map((p) => ({ id: p.id, tier: p.tier, name: p.name }));

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SiteNav />
      <main className="flex-1">
        <Hero location={location} />
        <TrustStrip />
        <HowItWorks location={location} />
        <Features />
        <Testimonials />
        <Pricing tiers={tiers} />
        <Faq />
        <LeadCta action={captureLead} plans={planLite} lead={lead} />
      </main>
      <SiteFooter location={location} />
    </div>
  );
}
