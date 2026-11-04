"use client";

import { useState, useTransition } from "react";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCents } from "@/lib/money";
import { startCheckout } from "./actions";

export interface PickerPlan {
  id: string;
  name: string;
  tier: string;
  monthly_price_cents: number;
  annual_price_cents: number | null;
  quotas: Record<string, number>;
}

function features(plan: PickerPlan): string[] {
  const q = plan.quotas ?? {};
  const list: string[] = [];
  if (q.open_scans != null)
    list.push(q.open_scans < 0 ? "Unlimited open & scans" : `${q.open_scans} open & scans / month`);
  if (q.items != null) list.push(q.items < 0 ? "Unlimited incoming items" : `Up to ${q.items} items / month`);
  if (q.recipients != null)
    list.push(q.recipients < 0 ? "Unlimited recipients" : `${q.recipients} recipient${q.recipients === 1 ? "" : "s"}`);
  if (q.free_storage_days != null && q.free_storage_days > 0)
    list.push(`${q.free_storage_days} days free package storage`);
  list.push("Forward or shred on request");
  return list;
}

export function PlanPicker({ plans }: { plans: PickerPlan[] }) {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [error, setError] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function choose(planId: string) {
    setError(null);
    setPendingPlan(planId);
    startTransition(async () => {
      const result = await startCheckout(planId, interval);
      if (result?.error) {
        setError(result.error);
        setPendingPlan(null);
      }
      // On success the action redirects to Stripe Checkout.
    });
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      ) : null}

      <div className="flex justify-center">
        <Tabs value={interval} onValueChange={(v) => setInterval(v as "month" | "year")}>
          <TabsList>
            <TabsTrigger value="month">Monthly</TabsTrigger>
            <TabsTrigger value="year">Annual — 2 months free</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => {
          const popular = plan.tier === "digital_plus";
          const annual = plan.annual_price_cents;
          const showAnnual = interval === "year" && annual != null;
          const busy = isPending && pendingPlan === plan.id;
          return (
            <Card key={plan.id} className={popular ? "relative border-brand shadow-md" : undefined}>
              {popular ? (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand text-brand-foreground">Most popular</Badge>
              ) : null}
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tracking-tight">
                    {showAnnual ? formatCents(annual) : formatCents(plan.monthly_price_cents)}
                  </span>
                  <span className="text-muted-foreground">{showAnnual ? "/yr" : "/mo"}</span>
                </div>
                <CardDescription>
                  {showAnnual
                    ? `Equivalent to ${formatCents(Math.round((annual as number) / 12))}/mo`
                    : annual != null
                      ? `or ${formatCents(annual)}/yr (2 months free)`
                      : "Billed monthly"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ul className="space-y-2.5 text-sm">
                  {features(plan).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={popular ? "default" : "outline"}
                  disabled={isPending}
                  onClick={() => choose(plan.id)}
                >
                  {busy ? <LoaderCircle className="animate-spin" /> : null}
                  Choose {plan.name}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        A card on file is required — service is autopay-only. Cancel anytime; USPS rules require us to keep
        Form 1583 records after closure.
      </p>
    </div>
  );
}
