"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, MapPin, ShieldCheck, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LocationLite {
  name: string;
  street_address: string;
  city: string;
  state: string;
  zip: string;
}

const EASE = [0.16, 1, 0.3, 1] as const;

export function Hero({ location }: { location: LocationLite | null }) {
  const reduce = useReducedMotion();
  const rise = (delay: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay, ease: EASE } };

  return (
    <section className="relative overflow-hidden bg-[#0a0c11] text-white">
      {/* ambient: emerald glow + faint grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-10%] size-[36rem] rounded-full bg-brand/20 blur-[120px]" />
        <div className="absolute right-[-10%] top-[20%] size-[28rem] rounded-full bg-sky-500/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse 90% 60% at 50% 0%, black 40%, transparent 75%)",
          }}
        />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-28 md:grid-cols-[1.04fr_0.96fr] md:gap-10 md:px-6 md:pb-28 md:pt-36">
        {/* Left: message */}
        <div className="max-w-xl">
          <motion.span
            {...rise(0)}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80"
          >
            <Sparkles className="size-3.5 text-brand" />
            Digital mailbox{location ? ` · ${location.city}, ${location.state}` : ""}
          </motion.span>

          <motion.h1
            {...rise(0.06)}
            className="mt-5 text-balance text-4xl font-semibold leading-[1.04] tracking-tight md:text-[3.7rem]"
          >
            A real street address that{" "}
            <span className="text-brand-emphasis">reads its own mail.</span>
          </motion.h1>

          <motion.p {...rise(0.13)} className="mt-6 text-pretty text-base leading-relaxed text-white/65 md:text-lg">
            Rent a private mailbox{location ? ` at ${location.street_address}` : ""}. We photograph everything the
            day it lands, our AI pulls out the bills and flags the scams, and you decide what happens next — scan,
            forward, deposit, or shred — from your phone.
          </motion.p>

          <motion.div {...rise(0.2)} className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="h-12 gap-2 px-6 text-[15px]">
              <Link href="/signup">
                Get your address
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 border-white/20 bg-transparent px-6 text-[15px] text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="#pricing">See plans</Link>
            </Button>
          </motion.div>

          <motion.ul {...rise(0.27)} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/55">
            {["USPS Form 1583 compliant", "Same-day mail photos", "Cancel anytime"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="size-4 text-brand" />
                {t}
              </li>
            ))}
          </motion.ul>

          {location ? (
            <motion.p {...rise(0.34)} className="mt-6 flex items-center gap-1.5 text-sm text-white/40">
              <MapPin className="size-4" />
              {location.street_address}, {location.city}, {location.state} {location.zip}
            </motion.p>
          ) : null}
        </div>

        {/* Right: animated inbox */}
        <HeroInbox />
      </div>
    </section>
  );
}

const MAIL = [
  { from: "Internal Revenue Service", note: "Notice CP14 · $1,284.00", tone: "verified" as const, mono: "IRS", bg: "#2563eb" },
  { from: "Pacific Gas & Electric", note: "Due Jun 28 · $146.72", tone: "verified" as const, mono: "PG&E", bg: "#15803d" },
  { from: "“USPS” redelivery fee", note: "$3.95 · pay now", tone: "scam" as const, mono: "?", bg: "#b91c1c" },
];

function HeroInbox() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 40, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
      className="relative mx-auto w-full max-w-[400px]"
      style={{ perspective: 1200 }}
    >
      {/* floating "scam blocked" pill */}
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.6, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 1, type: "spring", stiffness: 220, damping: 14 }}
        className="absolute -right-3 top-10 z-20 flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 backdrop-blur"
      >
        <ShieldCheck className="size-3.5" />
        Scam blocked
      </motion.div>

      <div className="relative overflow-hidden rounded-[1.6rem] border border-white/12 bg-white/[0.04] p-3 shadow-[0_40px_80px_-32px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        {/* header */}
        <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-brand/90 text-[11px] font-bold text-brand-foreground">
              MR
            </span>
            <div>
              <p className="text-[13px] font-semibold leading-tight">Marisol Reyes</p>
              <p className="text-[11px] text-white/45">PMB 214 · Inbox</p>
            </div>
          </div>
          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold text-brand-emphasis">
            3 new
          </span>
        </div>

        {/* mail rows */}
        <div className="mt-2 space-y-1.5">
          {MAIL.map((m, i) => (
            <motion.div
              key={m.from}
              initial={reduce ? false : { opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.16, duration: 0.5, ease: EASE }}
              className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-3"
            >
              <span
                className="grid h-11 w-9 shrink-0 place-items-center rounded-md text-[9px] font-bold text-white"
                style={{ backgroundColor: m.bg }}
              >
                {m.mono}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{m.from}</p>
                <p className="truncate text-[11px] text-white/45">{m.note}</p>
              </div>
              {m.tone === "scam" ? (
                <span className="rounded-md bg-red-500/15 px-2 py-1 text-[10px] font-bold text-red-300">FLAGGED</span>
              ) : (
                <span className="grid size-5 place-items-center rounded-full bg-brand/20 text-brand-emphasis">
                  <Check className="size-3" />
                </span>
              )}
            </motion.div>
          ))}
        </div>

        {/* scan shimmer sweep */}
        {!reduce ? (
          <motion.div
            aria-hidden
            initial={{ y: "-20%", opacity: 0 }}
            animate={{ y: ["-20%", "120%"], opacity: [0, 0.8, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut", delay: 1.4 }}
            className="pointer-events-none absolute inset-x-3 top-0 h-16 rounded-full bg-gradient-to-b from-transparent via-brand/25 to-transparent blur-md"
          />
        ) : null}
      </div>
    </motion.div>
  );
}
