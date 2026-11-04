"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Camera, Send, Search, ScrollText, ScanLine, Sparkles } from "lucide-react";
import { Reveal } from "./motion";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

export function Features() {
  return (
    <section id="features" className="scroll-mt-16 border-t border-border bg-secondary/40">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <Reveal>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-emphasis">What you get</span>
          <h2 className="mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-tight md:text-[2.6rem] md:leading-[1.08]">
            More than a photo of an envelope.
          </h2>
          <p className="mt-4 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground">
            Every other virtual mailbox stops at a picture. Ours opens the envelope, understands what&apos;s inside,
            and tells you what to do about it.
          </p>
        </Reveal>

        <div className="mt-12 grid auto-rows-[minmax(0,1fr)] grid-cols-1 gap-4 md:grid-cols-12">
          {/* Hero card: doccy bill extraction */}
          <BentoCard className="md:col-span-7 md:row-span-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-brand-emphasis" /> Bills read themselves
            </div>
            <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-muted-foreground">
              Our AI reads each scanned bill and notice, pulls out the payee, amount, and due date, and reminds you
              before the deadline — so a late fee never sneaks up on you.
            </p>
            <ExtractionDemo />
          </BentoCard>

          {/* Scam shield */}
          <BentoCard className="bg-[#0a0c11] text-white md:col-span-5">
            <ScamMini />
          </BentoCard>

          {/* Same-day photos */}
          <BentoCard className="md:col-span-5">
            <FeatureHead icon={Camera} title="See it the day it lands" />
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              Every envelope and package is photographed at intake and in your inbox the same day it arrives.
            </p>
          </BentoCard>

          {/* Forward */}
          <BentoCard className="md:col-span-4">
            <FeatureHead icon={Send} title="Forward anywhere" />
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              Ship any item to wherever you are — rate-shopped postage, with tracking.
            </p>
          </BentoCard>

          {/* Search */}
          <BentoCard className="md:col-span-4">
            <FeatureHead icon={Search} title="Search every letter" />
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              Every scanned piece is text-searchable. Find that one notice from six months ago in seconds.
            </p>
          </BentoCard>

          {/* Audit trail */}
          <BentoCard className="md:col-span-4">
            <FeatureHead icon={ScrollText} title="A real audit trail" />
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              Every action on your mail is logged, append-only. Nothing happens to a piece without your say-so.
            </p>
          </BentoCard>
        </div>
      </div>
    </section>
  );
}

function BentoCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Reveal className={cn("h-full", className)}>
      <div className="flex h-full flex-col rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-float)] md:p-7">
        {children}
      </div>
    </Reveal>
  );
}

function FeatureHead({ icon: Icon, title }: { icon: typeof Camera; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl border border-border bg-secondary">
        <Icon className="size-[18px] text-brand-emphasis" />
      </span>
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
    </div>
  );
}

function ExtractionDemo() {
  const reduce = useReducedMotion();
  const rows = [
    { k: "Payee", v: "Pacific Gas & Electric" },
    { k: "Amount", v: "$146.72", mono: true },
    { k: "Due date", v: "Jun 28, 2026", mono: true },
    { k: "Category", v: "Utility bill" },
  ];
  return (
    <div className="mt-6 grid flex-1 grid-cols-1 items-end gap-4 sm:grid-cols-[0.8fr_1fr]">
      {/* faux scanned doc */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-muted/60 to-muted/20 p-4">
        <div className="space-y-1.5">
          <div className="h-2.5 w-1/2 rounded bg-foreground/15" />
          <div className="h-2 w-full rounded bg-foreground/10" />
          <div className="h-2 w-5/6 rounded bg-foreground/10" />
          <div className="mt-3 h-2 w-2/3 rounded bg-foreground/10" />
          <div className="h-2 w-3/4 rounded bg-foreground/10" />
        </div>
        {!reduce ? (
          <motion.div
            aria-hidden
            initial={{ top: "-10%" }}
            animate={{ top: ["-10%", "110%"] }}
            transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.6, ease: "easeInOut" }}
            className="absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-brand/25 to-transparent"
          />
        ) : null}
      </div>
      {/* extracted fields */}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <motion.div
            key={r.k}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 + i * 0.1, ease: EASE }}
            className="flex items-center justify-between border-b border-dashed border-border pb-2 text-[13px]"
          >
            <span className="text-muted-foreground">{r.k}</span>
            <span className={cn("font-medium", r.mono && "font-mono tabular")}>{r.v}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ScamMini() {
  return (
    <>
      <FeatureHeadDark icon={ScanLine} title="Scam Shield" />
      <p className="mt-2 text-[14px] leading-relaxed text-white/55">
        We cross-check the sender and any payment link against the real ones. Fake fee letters get flagged before
        anyone in your family pays them.
      </p>
      <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-red-300">“USPS” redelivery fee</span>
          <span className="rounded-md bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300">FLAGGED</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-white/55">
          Payment domain <span className="font-mono text-red-300">usps-redelivery-fee.com</span> is not a USPS
          domain. USPS never charges a redelivery fee by letter.
        </p>
      </div>
    </>
  );
}

function FeatureHeadDark({ icon: Icon, title }: { icon: typeof Camera; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl border border-white/10 bg-white/5">
        <Icon className="size-[18px] text-brand-emphasis" />
      </span>
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
    </div>
  );
}
