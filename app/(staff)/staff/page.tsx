import Link from "next/link";
import { AlarmClock, Inbox, ScanLine, UserCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

interface Stat {
  label: string;
  value: number;
  href: string;
  icon: LucideIcon;
  alert?: boolean;
}

export default async function StaffDashboardPage() {
  const staff = await requireStaff("counter");
  const supabase = await createClient();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const nowIso = new Date().toISOString();

  // RLS scopes every query to this staff member's location.
  const [receivedToday, scanQueue, overdue, pendingRecipients] = await Promise.all([
    supabase
      .from("mail_items")
      .select("id", { count: "exact", head: true })
      .eq("location_id", staff.location_id)
      .gte("received_at", startOfToday.toISOString()),
    supabase
      .from("action_requests")
      .select("id", { count: "exact", head: true })
      .eq("action", "open_scan")
      .in("status", ["requested", "in_progress"]),
    supabase
      .from("action_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["requested", "in_progress"])
      .lt("sla_due_at", nowIso),
    supabase
      .from("recipients")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending_id", "pending_1583"]),
  ]);

  const stats: Stat[] = [
    {
      label: "Items received today",
      value: receivedToday.count ?? 0,
      href: "/staff/intake",
      icon: Inbox,
    },
    {
      label: "Open scan queue",
      value: scanQueue.count ?? 0,
      href: "/staff/queue",
      icon: ScanLine,
    },
    {
      label: "Requests past SLA",
      value: overdue.count ?? 0,
      href: "/staff/queue",
      icon: AlarmClock,
      alert: (overdue.count ?? 0) > 0,
    },
    {
      label: "Pending recipients",
      value: pendingRecipients.count ?? 0,
      href: "/staff/compliance",
      icon: UserCheck,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="text-muted-foreground">
          Counter overview for your location — jump straight into the work.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="group">
            <Card className="transition-colors group-hover:border-foreground/30">
              <CardHeader>
                <CardDescription className="flex items-center gap-2">
                  <stat.icon className="size-4" />
                  {stat.label}
                </CardDescription>
                <CardTitle
                  className={`text-4xl tabular-nums ${stat.alert ? "text-red-600" : ""}`}
                >
                  {stat.value}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
