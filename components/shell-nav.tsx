"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * A single sidebar link with active-route highlighting.
 *
 * The icon is rendered by the (server) AppShell and passed as `children` — we do
 * NOT pass icon component references across the server/client boundary. Index
 * routes (one path segment, e.g. /admin) match exactly; deeper routes match by
 * prefix so sub-pages stay highlighted.
 */
export function NavLink({ href, label, children }: { href: string; label: string; children?: ReactNode }) {
  const pathname = usePathname();
  const segments = href.split("/").filter(Boolean).length;
  const active = pathname === href || (segments > 1 && pathname.startsWith(href + "/"));

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
      {label}
    </Link>
  );
}
