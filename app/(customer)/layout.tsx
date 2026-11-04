import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard, Inbox, Receipt, Settings, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { AppShell, type NavItem } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Mailbox } from "@/lib/types";

const NAV: NavItem[] = [
  { href: "/portal", label: "Inbox", icon: Inbox },
  { href: "/portal/bills", label: "Bills", icon: Receipt },
  { href: "/portal/rules", label: "Rules", icon: SlidersHorizontal },
  { href: "/portal/billing", label: "Billing", icon: CreditCard },
  { href: "/portal/settings", label: "Settings", icon: Settings },
];

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const customer = await requireCustomer();
  const supabase = await createClient();

  const [{ data: boxRow }, { data: subRows }] = await Promise.all([
    supabase
      .from("mailboxes")
      .select("*")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("subscriptions").select("id").eq("customer_id", customer.id).limit(1),
  ]);

  // No subscription at all → they never finished onboarding.
  if (!subRows || subRows.length === 0) redirect("/onboarding");

  const mailbox = boxRow as Mailbox | null;

  let banner: React.ReactNode = null;
  if (customer.status === "past_due") {
    banner = (
      <div className="border-b bg-amber-50 px-4 py-3 md:px-8">
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <TriangleAlert />
          <AlertTitle>Payment failed — update your card to avoid late fees and suspension</AlertTitle>
          <AlertDescription className="text-amber-900/90">
            <Link href="/portal/billing" className="font-medium underline underline-offset-4">
              Update payment method
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  } else if (customer.status === "suspended") {
    banner = (
      <div className="border-b bg-red-50 px-4 py-3 md:px-8">
        <Alert variant="destructive" className="border-red-300 bg-red-50">
          <TriangleAlert />
          <AlertTitle>Service suspended — mail is held until your balance is paid</AlertTitle>
          <AlertDescription>
            <Link href="/portal/billing" className="font-medium underline underline-offset-4">
              Pay your balance
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <AppShell
      accent="customer"
      appName="MailboxOS"
      nav={NAV}
      userLabel={customer.full_name}
      userSub={mailbox ? `PMB ${mailbox.pmb_number}` : undefined}
      banner={banner}
    >
      {children}
    </AppShell>
  );
}
