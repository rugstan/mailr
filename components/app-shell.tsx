import type { LucideIcon } from "lucide-react";
import { Mailbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NavLink } from "@/components/shell-nav";

export interface NavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
}

interface AppShellProps {
  appName: string;
  nav: NavItem[];
  userLabel: string;
  userSub?: string;
  banner?: React.ReactNode;
  children: React.ReactNode;
  accent?: "customer" | "staff" | "admin";
}

/** Shared sidebar layout for the customer portal, staff app, and admin. */
export function AppShell({ appName, nav, userLabel, userSub, banner, children, accent = "customer" }: AppShellProps) {
  const markBg =
    accent === "staff" ? "bg-amber-500" : accent === "admin" ? "bg-violet-500" : "bg-brand";
  const mark = (size: string) => (
    <span className={cn("grid shrink-0 place-items-center rounded-[0.55rem] text-white shadow-sm", markBg, size)}>
      <Mailbox className="size-[60%]" />
    </span>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex items-center gap-2.5 border-b px-5 py-4">
          {mark("size-8")}
          <span className="font-semibold tracking-tight">{appName}</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label}>
              {item.icon ? <item.icon className="size-4" /> : null}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-4">
          <p className="truncate text-sm font-medium">{userLabel}</p>
          {userSub ? <p className="truncate text-xs text-muted-foreground">{userSub}</p> : null}
          <form action="/auth/signout" method="post" className="mt-2">
            <Button type="submit" variant="outline" size="sm" className="w-full">
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2.5 border-b px-4 py-3 md:hidden">
          {mark("size-7")}
          <span className="font-semibold tracking-tight">{appName}</span>
        </header>
        {banner}
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
