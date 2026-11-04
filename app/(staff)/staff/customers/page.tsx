import Link from "next/link";
import { Search } from "lucide-react";
import { SubStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { SubStatus } from "@/lib/types";
import { format } from "date-fns";

interface CustomerRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: SubStatus;
  created_at: string;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const staff = await requireStaff("counter");
  const { q } = await searchParams;
  const term = (q ?? "").trim();

  // User-context reads — RLS limits results to this staff member's location.
  const supabase = await createClient();
  let customers: CustomerRow[] = [];

  if (term) {
    // Strip PostgREST or-filter syntax characters from the user-provided pattern.
    const safe = term.replace(/[,()]/g, " ").trim();
    if (safe) {
      const pattern = `%${safe}%`;
      const { data } = await supabase
        .from("customers")
        .select("id, full_name, email, phone, status, created_at")
        .eq("location_id", staff.location_id)
        .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
        .order("full_name")
        .limit(25);
      customers = (data ?? []) as CustomerRow[];
    }

    const pmb = Number(term);
    if (Number.isInteger(pmb) && pmb > 0) {
      const { data: mailbox } = await supabase
        .from("mailboxes")
        .select("customer:customers(id, full_name, email, phone, status, created_at)")
        .eq("location_id", staff.location_id)
        .eq("pmb_number", pmb)
        .maybeSingle();
      const byPmb = (mailbox as unknown as { customer: CustomerRow | null } | null)?.customer;
      if (byPmb && !customers.some((c) => c.id === byPmb.id)) {
        customers = [byPmb, ...customers];
      }
    }
  } else {
    const { data } = await supabase
      .from("customers")
      .select("id, full_name, email, phone, status, created_at")
      .eq("location_id", staff.location_id)
      .order("created_at", { ascending: false })
      .limit(25);
    customers = (data ?? []) as CustomerRow[];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Customers</h1>
        <p className="text-muted-foreground">
          Search by name, email, or PMB number. Open a customer for mailboxes, plan, and
          manager actions.
        </p>
      </div>

      <form action="/staff/customers" method="get" className="flex max-w-xl gap-2">
        <Input
          name="q"
          defaultValue={term}
          autoFocus
          autoComplete="off"
          placeholder="Name, email, or PMB"
          className="h-11 text-base"
        />
        <Button type="submit" size="lg" className="h-11">
          <Search /> Search
        </Button>
      </form>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Since</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {term ? `No customers match “${term}”` : "No customers yet"}
                </TableCell>
              </TableRow>
            )}
            {customers.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link
                    href={`/staff/customers/${c.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {c.full_name}
                  </Link>
                </TableCell>
                <TableCell>{c.email}</TableCell>
                <TableCell>{c.phone ?? "—"}</TableCell>
                <TableCell>
                  <SubStatusBadge status={c.status} />
                </TableCell>
                <TableCell>{format(new Date(c.created_at), "MMM d, yyyy")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
