import Link from "next/link";
import type { Metadata } from "next";
import { differenceInCalendarDays, format } from "date-fns";
import { Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { BillEvent } from "@/lib/types";
import { BillActions } from "./bill-actions";

export const metadata: Metadata = { title: "Bills" };

function dueMeta(dueDate: string) {
  const daysLeft = differenceInCalendarDays(new Date(dueDate), new Date());
  const progress = Math.max(0, Math.min(100, ((30 - daysLeft) / 30) * 100));
  const label =
    daysLeft > 1
      ? `${daysLeft} days left`
      : daysLeft === 1
        ? "Due tomorrow"
        : daysLeft === 0
          ? "Due today"
          : `Overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"}`;
  return { daysLeft, progress, label };
}

export default async function BillsPage() {
  const customer = await requireCustomer();
  const supabase = await createClient();

  // RLS scopes bill_events to the signed-in customer.
  const { data: billRows } = await supabase
    .from("bill_events")
    .select("*")
    .eq("customer_id", customer.id)
    .neq("status", "dismissed")
    .order("due_date", { ascending: true, nullsFirst: false });
  const bills = (billRows ?? []) as BillEvent[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bills</h1>
        <p className="text-muted-foreground">
          Payees, amounts, and due dates extracted automatically from your scanned mail.
        </p>
      </div>

      {bills.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Receipt className="size-10 text-muted-foreground" />
            <h2 className="font-semibold">No bills yet</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Bills extracted from scanned mail appear here automatically. Request an{" "}
              <Link href="/portal" className="underline underline-offset-4">
                Open &amp; Scan
              </Link>{" "}
              on a bill — we&apos;ll read the payee, amount, and due date for you.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {bills.map((bill) => {
            const meta = bill.due_date ? dueMeta(bill.due_date) : null;
            const urgent = meta !== null && meta.daysLeft < 3;
            return (
              <Card key={bill.id} className={cn(urgent && bill.status !== "paid" && "border-red-300")}>
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{bill.payee ?? "Unknown payee"}</p>
                      <p className="text-2xl font-semibold tracking-tight">{formatCents(bill.amount_cents)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {bill.doc_type ? (
                        <Badge variant="outline" className="capitalize">
                          {bill.doc_type.replaceAll("_", " ")}
                        </Badge>
                      ) : null}
                      <Badge
                        className={cn(
                          "capitalize",
                          bill.status === "paid"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-800"
                        )}
                      >
                        {bill.status}
                      </Badge>
                    </div>
                  </div>

                  {bill.due_date && meta ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Due {format(new Date(bill.due_date), "MMM d, yyyy")}
                        </span>
                        <span className={cn("font-medium", urgent ? "text-red-600" : "text-muted-foreground")}>
                          {meta.label}
                        </span>
                      </div>
                      <Progress
                        value={meta.progress}
                        className={cn(urgent && "[&_[data-slot=progress-indicator]]:bg-red-500")}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No due date found on this document.</p>
                  )}

                  <BillActions billId={bill.id} status={bill.status} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
