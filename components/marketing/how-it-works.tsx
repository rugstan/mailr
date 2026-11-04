"use client";

import { useRef, useState } from "react";
import { useScroll, useMotionValueEvent, motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { MapPin, IdCard, ScanLine, Send, Trash2, Check, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface LocationLite {
  street_address: string;
  city: string;
  state: string;
  zip: string;
}

const EASE = [0.16, 1, 0.3, 1] as const;

export function HowItWorks({ location }: { location: LocationLite | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start center", "end center"] });
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const i = Math.min(2, Math.max(0, Math.floor(p * 3)));
    setActive(i);
  });

  const steps = [
    {
      kicker: "Step 1",
      title: "Pick a plan, get your address",
      body: "Choose a mailbox, and your private PMB number at our street address is issued on the spot — use it for deliveries, your driver's license, or your business filing.",
      visual: <VisualAddress location={location} />,
    },
    {
      kicker: "Step 2",
      title: "Verify once, in store",
      body: "Bring two IDs and sign USPS Form 1583 with us. It's the one federal step that lets us legally receive mail for you — done in minutes, with our notary on site.",
      visual: <VisualVerify />,
    },
    {
      kicker: "Step 3",
      title: "Run your mail from anywhere",
      body: "We photograph everything the day it arrives. Open & scan, forward, or shred — one tap, from wherever you are. No trip to the store.",
      visual: <VisualInbox />,
    },
  ];

  return (
    <section id="how" className="scroll-mt-16 bg-background">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <header className="pt-20 md:pt-28">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-emphasis">How it works</span>
          <h2 className="mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-tight md:text-[2.6rem] md:leading-[1.08]">
            From sign-up to mail-from-anywhere in one afternoon.
          </h2>
        </header>

        <div ref={ref} className="relative grid gap-10 py-10 md:grid-cols-2 md:gap-16 md:py-16">
          {/* Sticky morphing visual (desktop) */}
          <div className="hidden md:block">
            <div className="sticky top-28 flex h-[460px] items-center">
              <div className="relative h-full w-full">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active}
                    initial={{ opacity: 0, y: 16, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -16, scale: 0.98 }}
                    transition={{ duration: 0.45, ease: EASE }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    {steps[active].visual}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Steps */}
          <div>
            {steps.map((s, i) => (
              <div key={s.title} className="flex flex-col justify-center py-9 md:min-h-[58vh] md:py-8">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-full text-sm font-semibold transition-colors",
                      active === i ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {s.kicker}
                  </span>
                </div>
                <h3
                  className={cn(
                    "mt-4 text-2xl font-semibold tracking-tight transition-colors md:text-[1.7rem]",
                    active === i ? "text-foreground" : "text-foreground/45",
                  )}
                >
                  {s.title}
                </h3>
                <p className="mt-3 max-w-md text-pretty text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
                <div className="mt-7 md:hidden">{s.visual}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-float)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function VisualAddress({ location }: { location: LocationLite | null }) {
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand-emphasis">
          <CircleCheck className="size-3.5" /> Address active
        </span>
        <span className="font-mono text-xs text-muted-foreground">PMB 214</span>
      </div>
      <div className="mt-6 rounded-2xl border border-dashed border-border bg-muted/40 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your mailing address</p>
        <p className="mt-2 text-[15px] font-semibold leading-snug text-foreground">
          {location ? location.street_address : "1242 Commerce Ave"}, #214
          <br />
          {location ? `${location.city}, ${location.state} ${location.zip}` : "San Jose, CA 95128"}
        </p>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <MapPin className="size-3.5 text-brand" /> A real, staffed storefront — not a P.O. box.
      </div>
    </Panel>
  );
}

function VisualVerify() {
  return (
    <Panel>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <IdCard className="size-4 text-brand" /> USPS Form 1583
      </div>
      <div className="mt-5 space-y-2.5">
        {["Photo ID — verified", "Secondary ID — verified", "Notarized in store", "Filed with the CMRA"].map((t, i) => (
          <motion.div
            key={t}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 + i * 0.1, ease: EASE }}
            className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-[13px]"
          >
            <span className="grid size-5 place-items-center rounded-full bg-brand/15 text-brand-emphasis">
              <Check className="size-3" />
            </span>
            {t}
          </motion.div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">The federal step that makes receiving your mail legal.</p>
    </Panel>
  );
}

function VisualInbox() {
  const reduce = useReducedMotion();
  const actions = [
    { icon: ScanLine, label: "Scan" },
    { icon: Send, label: "Forward" },
    { icon: Trash2, label: "Shred" },
  ];
  return (
    <Panel className="bg-[#0a0c11] text-white">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <p className="text-[13px] font-semibold">Today’s mail</p>
        <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-semibold text-brand-emphasis">2 new</span>
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-3">
          <span className="grid h-10 w-8 place-items-center rounded-md bg-[#15803d] text-[9px] font-bold">PG&E</span>
          <div className="flex-1">
            <p className="text-[12px] font-medium">Pacific Gas & Electric</p>
            <p className="text-[10px] text-white/45">Bill · $146.72 · due Jun 28</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-3">
          <span className="grid h-10 w-8 place-items-center rounded-md bg-[#2563eb] text-[9px] font-bold">IRS</span>
          <div className="flex-1">
            <p className="text-[12px] font-medium">Internal Revenue Service</p>
            <p className="text-[10px] text-white/45">Notice · verified by Scam Shield</p>
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {actions.map((a, i) => (
          <motion.button
            key={a.label}
            type="button"
            animate={reduce ? undefined : { y: [0, -2, 0] }}
            transition={reduce ? undefined : { duration: 2.4, repeat: Infinity, delay: i * 0.3, ease: "easeInOut" }}
            className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-[11px] font-medium text-white/80"
          >
            <a.icon className="size-4 text-brand-emphasis" />
            {a.label}
          </motion.button>
        ))}
      </div>
    </Panel>
  );
}
