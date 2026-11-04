"use client";

import Link from "next/link";
import { ArrowRight, CircleAlert, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Reveal } from "./motion";

interface PlanLite {
  id: string;
  tier: string;
  name: string;
}

export function LeadCta({
  action,
  plans,
  lead,
}: {
  action: (formData: FormData) => void | Promise<void>;
  plans: PlanLite[];
  lead?: string;
}) {
  return (
    <section id="lead" className="scroll-mt-16 bg-[#0a0c11] text-white">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 md:p-14">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-brand/20 blur-[100px]" />
          <Reveal className="relative max-w-2xl">
            <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-[2.7rem] md:leading-[1.05]">
              Your address is ready when you are.
            </h2>
            <p className="mt-4 max-w-lg text-pretty text-[15px] leading-relaxed text-white/60">
              Set it up in a few minutes online, finish verification in store, and never sort through a pile of
              envelopes again.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 gap-2 px-6 text-[15px]">
                <Link href="/signup">
                  Get your address
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 border-white/20 bg-transparent px-6 text-[15px] text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/login">Sign in</Link>
              </Button>
            </div>

            <div className="mt-10 border-t border-white/10 pt-8">
              {lead === "ok" ? (
                <div className="flex items-center gap-2 text-sm text-brand-emphasis">
                  <CircleCheck className="size-5" />
                  Thanks — you&apos;re on the list. We&apos;ll be in touch shortly.
                </div>
              ) : (
                <>
                  <p className="text-sm text-white/55">Not ready yet? We&apos;ll send a one-page switch guide.</p>
                  {lead && lead !== "ok" ? (
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-red-300">
                      <CircleAlert className="size-4" />
                      {lead === "invalid"
                        ? "Enter a valid email address."
                        : lead === "limit"
                          ? "Too many requests — please try again later."
                          : "Something went wrong — please try again."}
                    </p>
                  ) : null}
                  <form action={action} className="mt-4 flex max-w-lg flex-col gap-3 sm:flex-row">
                    <Input
                      type="email"
                      name="email"
                      required
                      placeholder="you@example.com"
                      aria-label="Email address"
                      className="h-11 border-white/15 bg-white/5 text-white placeholder:text-white/40"
                    />
                    <select
                      name="plan_interest"
                      defaultValue=""
                      aria-label="Plan interest"
                      className="h-11 rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white outline-none focus-visible:border-brand"
                    >
                      <option value="" className="text-foreground">Just curious</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.tier} className="text-foreground">
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" variant="secondary" className="h-11 shrink-0 text-foreground">
                      Notify me
                    </Button>
                  </form>
                </>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
