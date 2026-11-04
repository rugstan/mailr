import { notFound } from "next/navigation";
import { format } from "date-fns";
import {
  MailStatusBadge,
  RecipientStatusBadge,
  SubStatusBadge,
} from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasRole, requireStaff } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type {
  Customer,
  MailboxStatus,
  MailboxType,
  MailStatus,
  RecipientStatus,
  SubStatus,
} from "@/lib/types";
import { CustomerAdminActions } from "./customer-admin-actions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SubscriptionRow {
  id: string;
  status: SubStatus;
  current_period_end: string | null;
  quota_usage: Record<string, number> | null;
  created_at: string;
  plan: { name: string; monthly_price_cents: number; quotas: Record<string, number> } | null;
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const staff = await requireStaff("counter");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  // User-context reads — RLS scopes to this staff member's location.
  const supabase = await createClient();
  const { data: customerData } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("location_id", staff.location_id)
    .maybeSingle();
  if (!customerData) notFound();
  const customer = customerData as Customer;

  const [{ data: mailboxesData }, { data: subsData }, { data: recipientsData }, { data: usageData }] =
    await Promise.all([
      supabase
        .from("mailboxes")
        .select("id, pmb_number, type, status")
        .eq("customer_id", id)
        .order("pmb_number"),
      supabase
        .from("subscriptions")
        .select(
          "id, status, current_period_end, quota_usage, created_at, plan:plans(name, monthly_price_cents, quotas)"
        )
        .eq("customer_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("recipients")
        .select("id, full_name, status, id_expires_on")
        .eq("customer_id", id)
        .order("created_at"),
      supabase
        .from("usage_records")
        .select("qty, unit_cents")
        .eq("customer_id", id)
        .eq("stripe_recorded", false),
    ]);

  const mailboxes = (mailboxesData ?? []) as {
    id: string;
    pmb_number: number;
    type: MailboxType;
    status: MailboxStatus;
  }[];
  const subscriptions = (subsData ?? []) as unknown as SubscriptionRow[];
  const recipients = (recipientsData ?? []) as {
    id: string;
    full_name: string;
    status: RecipientStatus;
    id_expires_on: string | null;
  }[];
  const unbilledCents = ((usageData ?? []) as { qty: number; unit_cents: number }[]).reduce(
    (sum, r) => sum + r.qty * r.unit_cents,
    0
  );

  const mailboxIds = mailboxes.map((m) => m.id);
  let items: { id: string; barcode: string | null; status: MailStatus; received_at: string }[] =
    [];
  if (mailboxIds.length > 0) {
    const { data: itemsData } = await supabase
      .from("mail_items")
      .select("id, barcode, status, received_at")
      .in("mailbox_id", mailboxIds)
      .order("received_at", { ascending: false })
      .limit(10);
    items = (itemsData ?? []) as typeof items;
  }

  const sub = subscriptions.find((s) => s.status !== "canceled") ?? subscriptions[0] ?? null;
  const scansUsed = sub?.quota_usage?.open_scans ?? 0;
  const scansQuota = sub?.plan?.quotas?.open_scans;
  const isManager = hasRole(staff, "manager");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            {customer.full_name}
            <SubStatusBadge status={customer.status} />
          </h1>
          <p className="text-muted-foreground">
            Customer since {format(new Date(customer.created_at), "MMM d, yyyy")}
          </p>
        </div>
        {isManager && (
          <CustomerAdminActions
            customerId={customer.id}
            customerName={customer.full_name}
            isSuspended={customer.status === "suspended"}
          />
        )}
      </div>

      {customer.status === "suspended" && (
        <Alert variant="destructive">
          <AlertTitle>Service suspended</AlertTitle>
          <AlertDescription>
            {customer.suspension_reason ?? "No reason recorded."}
            {customer.suspended_at &&
              ` Since ${format(new Date(customer.suspended_at), "MMM d, yyyy")}.`}{" "}
            Mail is held; pickups are blocked by the system until the balance is paid.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Email </span>
              {customer.email}
            </p>
            <p>
              <span className="text-muted-foreground">Phone </span>
              {customer.phone ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Unbilled usage </span>
              <span className="font-medium">{formatCents(unbilledCents)}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
            {sub?.plan && (
              <CardDescription>
                {sub.plan.name} · {formatCents(sub.plan.monthly_price_cents)}/mo
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {!sub ? (
              <p className="text-muted-foreground">No subscription on file.</p>
            ) : (
              <>
                <p className="flex items-center gap-2">
                  <span className="text-muted-foreground">Status</span>
                  <SubStatusBadge status={sub.status} />
                </p>
                <p>
                  <span className="text-muted-foreground">Period ends </span>
                  {sub.current_period_end
                    ? format(new Date(sub.current_period_end), "MMM d, yyyy")
                    : "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Open & scan used </span>
                  {scansUsed}
                  {scansQuota != null ? ` / ${scansQuota}` : ""} this period
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mailboxes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {mailboxes.length === 0 && (
              <p className="text-muted-foreground">No mailboxes assigned.</p>
            )}
            {mailboxes.map((m) => (
              <p key={m.id} className="flex items-center gap-2">
                <span className="font-mono font-medium">PMB {m.pmb_number}</span>
                <span className="capitalize text-muted-foreground">{m.type}</span>
                <Badge variant="outline" className="capitalize">
                  {m.status}
                </Badge>
              </p>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recipients</CardTitle>
            <CardDescription>Only verified recipients can receive mail.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {recipients.length === 0 && (
              <p className="text-muted-foreground">No recipients added.</p>
            )}
            {recipients.map((r) => (
              <p key={r.id} className="flex items-center gap-2">
                <span className="font-medium">{r.full_name}</span>
                <RecipientStatusBadge status={r.status} />
                {r.id_expires_on && (
                  <span className="text-xs text-muted-foreground">
                    ID expires {format(new Date(r.id_expires_on), "MMM d, yyyy")}
                  </span>
                )}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent mail</CardTitle>
          <CardDescription>Last 10 items across all mailboxes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {items.length === 0 && <p className="text-muted-foreground">No mail yet.</p>}
          {items.map((item) => (
            <p key={item.id} className="flex items-center gap-3">
              <span className="w-44 shrink-0 font-mono">{item.barcode ?? "no barcode"}</span>
              <MailStatusBadge status={item.status} />
              <span className="text-muted-foreground">
                {format(new Date(item.received_at), "MMM d, yyyy h:mm a")}
              </span>
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
