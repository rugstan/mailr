import { Inbox, ListChecks, PackageCheck, ShieldCheck, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Location, StaffRole } from "@/lib/types";

const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Owner",
  manager: "Manager",
  scan_operator: "Scan operator",
  counter: "Counter",
};

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff("counter");

  const supabase = await createClient();
  const { data } = await supabase
    .from("locations")
    .select("*")
    .eq("id", staff.location_id)
    .single();
  const location = (data as Location | null) ?? null;

  return (
    <AppShell
      accent="staff"
      appName={location?.name ?? "MailboxOS"}
      nav={[
        { href: "/staff/intake", label: "Intake", icon: Inbox },
        { href: "/staff/queue", label: "Queues", icon: ListChecks },
        { href: "/staff/pickup", label: "Pickup", icon: PackageCheck },
        { href: "/staff/customers", label: "Customers", icon: Users },
        { href: "/staff/compliance", label: "Compliance", icon: ShieldCheck },
      ]}
      userLabel={staff.full_name}
      userSub={ROLE_LABELS[staff.role]}
    >
      {children}
    </AppShell>
  );
}
