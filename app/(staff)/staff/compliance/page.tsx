import { differenceInCalendarDays, format } from "date-fns";
import { Download } from "lucide-react";
import { RecipientStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { RecipientStatus } from "@/lib/types";
import { currentQuarter } from "./crd";
import { VerifySheet } from "./verify-sheet";

interface RecipientRow {
  id: string;
  full_name: string;
  business_name: string | null;
  status: RecipientStatus;
  id_verified_at: string | null;
  id_expires_on: string | null;
  created_at: string;
  customer: { full_name: string } | null;
  mailbox: { pmb_number: number } | null;
}

function RecipientTable({
  rows,
  emptyText,
  showVerify,
}: {
  rows: RecipientRow[];
  emptyText: string;
  showVerify?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="rounded-md border p-8 text-center text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Recipient</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>PMB</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>ID verified</TableHead>
            <TableHead>ID expires</TableHead>
            {showVerify && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">
                {r.full_name}
                {r.business_name && (
                  <span className="block text-xs text-muted-foreground">{r.business_name}</span>
                )}
              </TableCell>
              <TableCell>{r.customer?.full_name ?? "—"}</TableCell>
              <TableCell className="font-mono tabular-nums">
                {r.mailbox?.pmb_number ?? "—"}
              </TableCell>
              <TableCell>
                <RecipientStatusBadge status={r.status} />
              </TableCell>
              <TableCell>
                {r.id_verified_at ? format(new Date(r.id_verified_at), "MMM d, yyyy") : "—"}
              </TableCell>
              <TableCell>
                {r.id_expires_on ? format(new Date(r.id_expires_on), "MMM d, yyyy") : "—"}
              </TableCell>
              {showVerify && (
                <TableCell className="text-right">
                  <VerifySheet
                    recipient={{
                      id: r.id,
                      fullName: r.full_name,
                      customerName: r.customer?.full_name ?? null,
                      pmb: r.mailbox?.pmb_number ?? null,
                    }}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default async function CompliancePage() {
  // Link is visible to all staff — the page itself is manager-only.
  await requireStaff("manager");

  // User-context read — RLS scopes recipients to this manager's location.
  const supabase = await createClient();
  const { data } = await supabase
    .from("recipients")
    .select(
      "id, full_name, business_name, status, id_verified_at, id_expires_on, created_at, customer:customers(full_name), mailbox:mailboxes(pmb_number)"
    )
    .order("created_at", { ascending: true });
  const rows = ((data ?? []) as unknown as RecipientRow[]);

  const pending = rows.filter((r) => r.status === "pending_id" || r.status === "pending_1583");
  const verified = rows.filter((r) => r.status === "verified");
  const problem = rows.filter((r) => r.status === "expired" || r.status === "rejected");

  const today = new Date();
  const expiring = verified
    .filter((r) => {
      if (!r.id_expires_on) return false;
      const days = differenceInCalendarDays(new Date(r.id_expires_on), today);
      return days <= 60;
    })
    .sort((a, b) => (a.id_expires_on ?? "").localeCompare(b.id_expires_on ?? ""));

  const quarter = currentQuarter(today);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Compliance</h1>
        <p className="text-muted-foreground">
          USPS Form 1583 registry — verification, expiring IDs, and quarterly CRD export.
        </p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="verified">Verified ({verified.length})</TabsTrigger>
          <TabsTrigger value="problem">Problem ({problem.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">
          <RecipientTable
            rows={pending}
            emptyText="No recipients waiting for verification."
            showVerify
          />
        </TabsContent>
        <TabsContent value="verified">
          <RecipientTable rows={verified} emptyText="No verified recipients yet." />
        </TabsContent>
        <TabsContent value="problem">
          <RecipientTable rows={problem} emptyText="No expired or rejected recipients." />
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>IDs expiring within 60 days</CardTitle>
          <CardDescription>
            Expired IDs block new check-ins for the recipient — chase renewals early.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {expiring.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing expiring in the next 60 days.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>PMB</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Days left</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiring.map((r) => {
                    const days = differenceInCalendarDays(new Date(r.id_expires_on!), today);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.full_name}</TableCell>
                        <TableCell>{r.customer?.full_name ?? "—"}</TableCell>
                        <TableCell className="font-mono tabular-nums">
                          {r.mailbox?.pmb_number ?? "—"}
                        </TableCell>
                        <TableCell>{format(new Date(r.id_expires_on!), "MMM d, yyyy")}</TableCell>
                        <TableCell
                          className={days < 14 ? "font-semibold text-red-600" : "tabular-nums"}
                        >
                          {days < 0 ? `expired ${-days}d ago` : `${days}d`}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CRD quarterly export</CardTitle>
          <CardDescription>
            Current quarter: <span className="font-medium text-foreground">{quarter}</span> —
            includes every recipient at this location with 1583 signed/terminated dates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a href="/staff/compliance/export">
              <Download /> Generate CRD export (CSV)
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
