"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "./motion";

const FAQS = [
  {
    q: "Is this a real street address?",
    a: "Yes. It's a staffed retail storefront with a real street address — not a P.O. box. You can use it for packages, your driver's license, voter registration, and business filings.",
  },
  {
    q: "What is USPS Form 1583, and do I have to do it?",
    a: "It's the federal form that authorizes us to receive mail on your behalf. You complete it once, in store, with two forms of ID — our notary handles it in minutes. It's the law for any mail-receiving service, and we enforce it so your mail stays legitimate.",
  },
  {
    q: "Can I use this for my LLC or business?",
    a: "Absolutely. A non-residential business address is exactly what most new LLCs need. Add multiple recipient names on the Business plan and keep your home address off public filings.",
  },
  {
    q: "What happens to junk mail?",
    a: "You set standing rules. Tell us to auto-shred a sender, recycle catalogs, or hold everything for pickup — junk never clutters your inbox unless you want to see it.",
  },
  {
    q: "Is my mail private and secure?",
    a: "Your scans live in private, encrypted storage and are only ever shown to you through short-lived, signed links. We open an item only with your recorded consent, and every action is written to an append-only audit log.",
  },
  {
    q: "How quickly do I see what arrives?",
    a: "The same day. Every envelope and package is photographed at intake and lands in your inbox within hours — wherever you are.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="scroll-mt-16 border-t border-border bg-secondary/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-[0.8fr_1.2fr] md:gap-16 md:px-6 md:py-28">
        <Reveal>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-emphasis">FAQ</span>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-[2.4rem] md:leading-[1.1]">
            The questions everyone asks.
          </h2>
          <p className="mt-4 max-w-sm text-pretty text-[15px] leading-relaxed text-muted-foreground">
            Still unsure? Reach the store directly — real people, not a ticket queue.
          </p>
        </Reveal>

        <div className="divide-y divide-border border-y border-border">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left"
                >
                  <span className="text-[15px] font-medium text-foreground">{item.q}</span>
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full border border-border transition-transform duration-300",
                      isOpen && "rotate-45 border-brand text-brand-emphasis",
                    )}
                  >
                    <Plus className="size-4" />
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="max-w-xl pb-5 text-pretty text-[14px] leading-relaxed text-muted-foreground">
                        {item.a}
                      </p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
