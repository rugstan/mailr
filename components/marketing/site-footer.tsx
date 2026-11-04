import Link from "next/link";
import { MapPin, FileCheck2, Lock } from "lucide-react";
import { Logo } from "./logo";

interface LocationLite {
  name: string;
  street_address: string;
  city: string;
  state: string;
  zip: string;
}

const COLS = [
  {
    heading: "Product",
    links: [
      { href: "#how", label: "How it works" },
      { href: "#features", label: "Features" },
      { href: "#pricing", label: "Pricing" },
      { href: "#faq", label: "FAQ" },
    ],
  },
  {
    heading: "Account",
    links: [
      { href: "/signup", label: "Get your address" },
      { href: "/login", label: "Sign in" },
      { href: "/portal", label: "Your mailbox" },
    ],
  },
];

export function SiteFooter({ location }: { location: LocationLite | null }) {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-14 md:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
              A real street address that reads its own mail. Photographed same-day, scanned on request, and
              protected from scams.
            </p>
            {location ? (
              <p className="mt-4 flex items-start gap-1.5 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0 text-brand-emphasis" />
                {location.name} · {location.street_address}, {location.city}, {location.state} {location.zip}
              </p>
            ) : null}
          </div>

          {COLS.map((col) => (
            <div key={col.heading}>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{col.heading}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-sm text-foreground/80 transition-colors hover:text-foreground">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-border pt-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>© {2026} MailboxOS. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="flex items-center gap-1.5">
              <FileCheck2 className="size-3.5 text-brand-emphasis" />
              USPS CMRA — Form 1583 verified recipients
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="size-3.5 text-brand-emphasis" />
              Encrypted storage · append-only audit
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
