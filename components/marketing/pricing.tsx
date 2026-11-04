"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Reveal } from "./motion";

export interface PricingTier {
  id: string;
  name: string;
  tier: string;
  monthlyCents: number;
  annualCents: number | null;
  features: string[];
  popular: boolean;
}

export function Pricing({ tiers }: { tiers: PricingTier[] }) {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="scroll-mt-16 border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <Reveal className="flex flex-col items-start gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-emphasis">Pricing</span>
            <h2 className="mt-3 max-w-xl text-balance text-3xl font-semibold tracking-tight md:text-[2.6rem] md:leading-[1.08]">
              One honest price. No per-scan surprises.
            </h2>
            <p className="mt-4 max-w-lg text-pretty text-[15px] leading-relaxed text-muted-foreground">
              Every plan includes same-day photos, the bill inbox, Scam Shield, and standing rules. Scans and check
              deposits are bundled — not billed by the click.
            </p>
          </div>

          {/* monthly / annual toggle */}
          <div
            role="tablist"
            aria-label="Billing period"
            className="inline-flex shrink-0 items-center rounded-full border border-border bg-secondary p-1 text-sm"
          >
            {[
              { label: "Monthly", val: false },
              { label: "Annual", val: true },
            ].map((opt) => (
              <button
                key={opt.label}
                role="tab"
                aria-selected={annual === opt.val}
                onClick={() => setAnnual(opt.val)}
                className={cn(
                  "relative rounded-full px-4 py-1.5 font-medium transition-colors",
                  annual === opt.val ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {annual === opt.val ? (
                  <motion.span
                    layoutId="billing-pill"
                    className="absolute inset-0 rounded-full bg-card shadow-sm"
                    transition={{ type: "spring", stiffness: 320, damping: 30 }}
                  />
                ) : null}
                <span className="relative z-10 inline-flex items-center gap-1.5">
                  {opt.label}
                  {opt.label === "Annual" ? (
                    <span className="rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-emphasis">
                      2 mo free
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </Reveal>

        {tiers.length === 0 ? (
          <div className="mx-auto mt-12 max-w-md rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Plans are being set up — check back shortly, or leave your email below.
          </div>
        ) : (
          <div className="mt-12 grid items-stretch gap-5 md:grid-cols-3">
            {tiers.map((t, i) => {
              const showAnnual = annual && t.annualCents != null;
              const price = showAnnual ? t.annualCents! : t.monthlyCents;
              return (
                <Reveal key={t.id} delay={i * 0.06} className="h-full">
                  <div
                    className={cn(
                      "relative flex h-full flex-col rounded-3xl border bg-card p-7",
                      t.popular
                        ? "border-brand shadow-[var(--shadow-float)] ring-1 ring-brand"
                        : "border-border shadow-[var(--shadow-soft)]",
                    )}
                  >
                    {t.popular ? (
                      <span className="absolute -top-3 left-7 rounded-full bg-brand px-3 py-1 text-[11px] font-semibold text-brand-foreground">
                        Most popular
                      </span>
                    ) : null}
                    <h3 className="text-[15px] font-semibold tracking-tight">{t.name}</h3>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="font-mono text-[2.6rem] font-semibold leading-none tracking-tight tabular">
                        {formatCents(price)}
                      </span>
                      <span className="text-sm text-muted-foreground">/{showAnnual ? "yr" : "mo"}</span>
                    </div>
                    <p className="mt-1.5 h-4 text-xs text-brand-emphasis">
                      {!annual && t.annualCents != null
                        ? `or ${formatCents(t.annualCents)}/yr — 2 months free`
                        : showAnnual
                          ? "Billed once a year"
                          : ""}
                    </p>

                    <ul className="mt-6 flex-1 space-y-3 text-[14px]">
                      {t.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5">
                          <Check className="mt-0.5 size-4 shrink-0 text-brand-emphasis" />
                          <span className="text-muted-foreground">{f}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      asChild
                      className="mt-7 h-11 w-full"
                      variant={t.popular ? "default" : "outline"}
                    >
                      <Link href="/signup">Choose {t.name}</Link>
                    </Button>
                  </div>
                </Reveal>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
