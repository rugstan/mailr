import Link from "next/link";
import type { Metadata } from "next";
import { CircleCheck, IdCard, PartyPopper, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Location, Mailbox, Subscription } from "@/lib/types";
import { OnboardingStepper } from "../stepper";
import { RefreshPoller } from "./refresh-poller";
import { CopyButton } from "./copy-button";

export const metadata: Metadata = { title: "Your new address" };

const CHECKLIST = [
  "Banks & credit cards",
  "USPS mail forwarding from your old address",
  "DMV / driver's license",
  "Employer & payroll",
  "Subscriptions and online shopping accounts",
  "Insurance, doctors, and government agencies",
] as const;

export default async function OnboardingCompletePage() {
  const customer = await requireCustomer();
  const supabase = await createClient();

  // Newest subscription → its mailbox → the location (all RLS-scoped reads).
  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const subscription = subRow as Subscription | null;

  let mailbox: Mailbox | null = null;
  let location: Location | null = null;
  if (subscription?.mailbox_id) {
    const { data: boxRow } = await supabase
      .from("mailboxes")
      .select("*")
      .eq("id", subscription.mailbox_id)
      .maybeSingle();
    mailbox = boxRow as Mailbox | null;
    if (mailbox) {
      const { data: locRow } = await supabase
        .from("locations")
        .select("*")
        .eq("id", mailbox.location_id)
        .maybeSingle();
      location = locRow as Location | null;
    }
  }

  // Webhook lag — payment finished but the mailbox isn't assigned yet.
  if (!subscription || !mailbox || !location) {
    return (
      <div>
        <OnboardingStepper current={2} />
        <Card className="mx-auto max-w-md text-center">
          <CardHeader>
            <CardTitle>Finalizing your mailbox…</CardTitle>
            <CardDescription>
              Payment received — we&apos;re assigning your PMB number now. This usually takes a few seconds.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RefreshPoller />
          </CardContent>
        </Card>
      </div>
    );
  }

  const addressText = `${customer.full_name}\n${location.street_address} PMB ${mailbox.pmb_number}\n${location.city}, ${location.state} ${location.zip}`;

  return (
    <div>
      <OnboardingStepper current={3} />
      <div className="mx-auto max-w-2xl space-y-6">
        <Card className="border-emerald-300">
          <CardHeader className="text-center">
            <PartyPopper className="mx-auto mb-2 size-10 text-emerald-600" />
            <CardTitle className="text-2xl">Your new address is ready</CardTitle>
            <CardDescription>PMB {mailbox.pmb_number} at {location.name} is yours.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-5 text-center">
              <p className="whitespace-pre-line font-mono text-base leading-7">{addressText}</p>
              <div className="mt-3 flex justify-center">
                <CopyButton text={addressText} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <TriangleAlert />
          <AlertTitle>Before we can receive mail for you</AlertTitle>
          <AlertDescription className="text-amber-900/90">
            Each recipient must be verified in store: bring two acceptable forms of ID (one with a photo) and
            we&apos;ll complete and witness USPS Form 1583 together. Mail for unverified recipients is refused —
            the system enforces this automatically.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Update your address everywhere</CardTitle>
            <CardDescription>The sooner senders have your new address, the sooner it all lands here.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2.5 text-sm sm:grid-cols-2">
              {CHECKLIST.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/portal/settings#recipients">
              <IdCard />
              Add recipients
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/portal">Go to my inbox</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
