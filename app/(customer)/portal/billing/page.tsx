import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SubStatusBadge } from "@/components/status-badge";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import type { Plan, Subscription, UsageRecord, UsageType } from "@/lib/types";
import { ManageBillingButton } from "./manage-billing-button";

export const metadata: Metadata = { title: "Billing" };

const USAGE_LABELS: Record<UsageType, string> = {
  scan_overage: "Open & scan overage",
  forward_handling: "Mail forwarding & handling",
  check_deposit: "Check deposit service",
  storage_day: "Package storage day",
  extra_recipient: "Additional recipient",
  rush_scan: "Rush scan",
  shred: "Shredding service",
  late_fee: "Late payment fee",
};

type SubWithPlan = Subscription & { plan: Plan | null };

export default async function BillingPage() {
  const customer = await requireCustomer();
  const supabase = await createClient();

  const [{ data: subRow }, { data: usageRows }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("*, plan:plans(*)")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("usage_records")
      .select("*")
      .eq("customer_id", customer.id)
      .eq("stripe_recorded", false)
      .order("created_at", { ascending: false }),
  ]);

  const subscription = subRow as SubWithPlan | null;
  const plan = subscription?.plan ?? null;
  const usage = (usageRows ?? []) as UsageRecord[];
  const usageTotal = usage.reduce((sum, rec) => sum + rec.unit_cents * rec.qty, 0);

  const scansUsed = subscription?.quota_usage?.open_scans ?? 0;
  const scanQuota = plan?.quotas?.open_scans;
  const unlimitedScans = scanQuota == null || scanQuota < 0;
  const pastDue = customer.status === "past_due" || subscription?.status === "past_due";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="text-muted-foreground">Your plan, usage, and payment details.</p>
      </div>

      {pastDue ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Your last payment failed</AlertTitle>
          <AlertDescription>
            We&apos;ll retry your card automatically. A late fee is applied after 3 days, and after 10 days
            service is suspended — incoming mail is held securely but scans, pickups, and forwarding pause
            until the balance is paid. Update your card below to fix it now.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subscription</CardTitle>
            <CardDescription>Autopay only — your card on file is charged each period.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscription && plan ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{plan.name}</p>
                    <p className="text-sm text-muted-foreground">{formatCents(plan.monthly_price_cents)}/mo</p>
                  </div>
                  <SubStatusBadge status={subscription.status} />
                </div>
                {subscription.current_period_end ? (
                  <p className="text-sm text-muted-foreground">
                    Renews {format(new Date(subscription.current_period_end), "MMM d, yyyy")}
                  </p>
                ) : null}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Open &amp; scans this period</span>
                    <span className="font-medium">
                      {unlimitedScans ? `${scansUsed} used · Unlimited` : `${scansUsed} of ${scanQuota}`}
                    </span>
                  </div>
                  {!unlimitedScans ? (
                    <Progress value={Math.min(100, (scansUsed / Math.max(scanQuota as number, 1)) * 100)} />
                  ) : null}
                  {!unlimitedScans && scansUsed > (scanQuota as number) ? (
                    <p className="text-xs text-amber-700">
                      Over quota — additional scans bill as overage on your next invoice.
                    </p>
                  ) : null}
                </div>
                <ManageBillingButton />
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">No subscription found.</p>
                <Button asChild variant="outline">
                  <Link href="/onboarding">Choose a plan</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unbilled charges</CardTitle>
            <CardDescription>À-la-carte services — added to your next invoice automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            {usage.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No pending charges. Forwarding postage, scan overages, and storage days show up here.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage.map((rec) => (
                    <TableRow key={rec.id}>
                      <TableCell>{USAGE_LABELS[rec.type] ?? rec.type}</TableCell>
                      <TableCell className="text-right">{rec.qty}</TableCell>
                      <TableCell className="text-right">{formatCents(rec.unit_cents * rec.qty)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2}>Total</TableCell>
                    <TableCell className="text-right font-semibold">{formatCents(usageTotal)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
