"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Camera, FileCheck2, Lock, CalendarClock } from "lucide-react";

const SIGNALS = [
  { icon: Camera, label: "Same-day mail photos" },
  { icon: FileCheck2, label: "USPS Form 1583 compliant" },
  { icon: Lock, label: "Encrypted & private" },
  { icon: CalendarClock, label: "Bill reminders built in" },
];

const HANDLES = [
  "IRS notices",
  "Bank statements",
  "DMV renewals",
  "Court summons",
  "Insurance letters",
  "Paper checks",
  "Subscriptions",
  "Jury duty",
  "Tax documents",
  "Packages",
];

export function TrustStrip() {
  const reduce = useReducedMotion();
  return (
    <section className="border-b border-border bg-secondary/40">
      <div className="mx-auto max-w-6xl px-4 py-7 md:px-6">
        <div className="grid grid-cols-2 gap-y-4 md:grid-cols-4">
          {SIGNALS.map((s) => (
            <div key={s.label} className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <s.icon className="size-4 shrink-0 text-brand-emphasis" />
              <span className="font-medium text-foreground/80">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* kinetic marquee of what we handle */}
      <div className="relative overflow-hidden border-t border-border/70 py-3">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-secondary/40 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-secondary/40 to-transparent"
          aria-hidden
        />
        <motion.div
          className="flex w-max gap-3 whitespace-nowrap"
          animate={reduce ? undefined : { x: ["0%", "-50%"] }}
          transition={reduce ? undefined : { duration: 28, repeat: Infinity, ease: "linear" }}
        >
          {[...HANDLES, ...HANDLES].map((h, i) => (
            <span
              key={`${h}-${i}`}
              className="rounded-full border border-border bg-background px-3.5 py-1 font-mono text-xs text-muted-foreground"
            >
              {h}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
