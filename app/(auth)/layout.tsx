import Link from "next/link";
import { ShieldCheck, ScanLine, MapPin } from "lucide-react";
import { Logo } from "@/components/marketing/logo";

const POINTS = [
  { icon: MapPin, text: "A real street address — use it anywhere mail is accepted." },
  { icon: ScanLine, text: "Mail photographed the day it arrives, scanned on request." },
  { icon: ShieldCheck, text: "Scam Shield flags fraudulent mail before it costs you." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-2">
      {/* Form side */}
      <div className="flex flex-col px-5 py-7 sm:px-10">
        <header>
          <Link href="/" aria-label="MailboxOS home" className="inline-flex">
            <Logo />
          </Link>
        </header>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>© 2026 MailboxOS</span>
          <Link href="/" className="hover:text-foreground">
            Back to home
          </Link>
        </footer>
      </div>

      {/* Brand side */}
      <div className="relative hidden overflow-hidden bg-[#0a0c11] text-white lg:block">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 top-0 size-[32rem] rounded-full bg-brand/20 blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-5%] size-[26rem] rounded-full bg-sky-500/10 blur-[120px]" />
          <div
            className="absolute inset-0 opacity-[0.16]"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              maskImage: "radial-gradient(ellipse 80% 80% at 40% 30%, black 30%, transparent 75%)",
            }}
          />
        </div>
        <div className="relative flex h-full flex-col justify-between p-12">
          <p className="max-w-md text-balance text-2xl font-semibold leading-snug tracking-tight">
            A real street address that{" "}
            <span className="text-brand-emphasis">reads its own mail.</span>
          </p>
          <ul className="space-y-5">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5">
                  <p.icon className="size-[18px] text-brand-emphasis" />
                </span>
                <span className="max-w-sm pt-1.5 text-sm text-white/65">{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
