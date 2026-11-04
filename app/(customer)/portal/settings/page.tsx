import type { Metadata } from "next";
import { format } from "date-fns";
import { IdCard } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RecipientStatusBadge } from "@/components/status-badge";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Plan, Recipient } from "@/lib/types";
import { ProfileForm } from "./profile-form";
import { NotificationPrefs } from "./notification-prefs";
import { RecipientForm } from "./recipient-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const customer = await requireCustomer();
  const supabase = await createClient();

  const [{ data: recipientRows }, { data: subRow }] = await Promise.all([
    supabase
      .from("recipients")
      .select("*")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("subscriptions")
      .select("plan:plans(quotas)")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const recipients = (recipientRows ?? []) as Recipient[];
  const quotas = ((subRow as { plan: Pick<Plan, "quotas"> | null } | null)?.plan?.quotas ?? {}) as Record<
    string,
    number
  >;
  const recipientLimit = quotas.recipients;
  const limitLabel =
    recipientLimit == null || recipientLimit < 0
      ? "Your plan includes unlimited recipients."
      : `Your plan includes ${recipientLimit} recipient${recipientLimit === 1 ? "" : "s"} (${recipients.length} used).`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Your profile, notifications, and verified recipients.</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* (a) Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>Shown on your address block and used for account notices.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm fullName={customer.full_name} phone={customer.phone} />
          </CardContent>
        </Card>

        {/* (b) Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notifications</CardTitle>
            <CardDescription>How we reach you when mail arrives or needs attention.</CardDescription>
          </CardHeader>
          <CardContent>
            <NotificationPrefs prefs={customer.notification_prefs ?? {}} />
          </CardContent>
        </Card>
      </div>

      {/* (c) Recipients */}
      <Card id="recipients" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">Recipients</CardTitle>
          <CardDescription>
            People and businesses who can receive mail at your PMB. {limitLabel}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="border-brand/25 bg-brand/5 text-foreground">
            <IdCard />
            <AlertTitle>Verification happens in store</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              To finish verification, visit the store with two acceptable forms of ID (at least one with a
              photo). USPS Form 1583 is completed and witnessed in person. Mail cannot be received for
              unverified recipients — this is enforced automatically.
            </AlertDescription>
          </Alert>

          {recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recipients yet — add yourself first, then anyone else who gets mail at your box.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">ID expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((recipient) => (
                  <TableRow key={recipient.id}>
                    <TableCell className="font-medium">
                      {recipient.full_name}
                      {recipient.is_minor ? (
                        <span className="ml-2 text-xs text-muted-foreground">(minor)</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{recipient.business_name ?? "—"}</TableCell>
                    <TableCell>
                      <RecipientStatusBadge status={recipient.status} />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {recipient.id_expires_on
                        ? format(new Date(recipient.id_expires_on), "MMM d, yyyy")
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="border-t pt-6">
            <h3 className="mb-4 text-sm font-medium">Add a recipient</h3>
            <RecipientForm />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
