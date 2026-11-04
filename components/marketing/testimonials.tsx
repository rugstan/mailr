"use client";

import type React from "react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";

// Adapted from a 21st.dev "Design Testimonial" pattern: oversized parallax index,
// word-by-word reveal, vertical progress, ticker — recolored to the emerald/ink
// system with real MailboxOS customers.
const TESTIMONIALS = [
  {
    quote: "My mail shows up in the app the morning it arrives. I haven't touched a physical envelope in eight months.",
    author: "Priya Raman",
    context: "Runs an LLC across three time zones",
  },
  {
    quote: "It flagged a fake unpaid-toll letter aimed at my mom before she wrote the check. That alone paid for the year.",
    author: "Dani Okonkwo",
    context: "Remote product designer",
  },
  {
    quote: "We live in our Airstream full-time. Everything that lands in our box is scanned the same day, and we forward what we actually need to wherever we're parked.",
    author: "Hollis Vance",
    context: "Full-time RVer",
  },
  {
    quote: "A property-tax notice would have slipped right past me. The reminder hit my phone with eleven days to spare.",
    author: "Theo Marchetti",
    context: "Freelance editor",
  },
];

const EASE = [0.22, 1, 0.36, 1] as const;

export function Testimonials() {
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const x = useSpring(mouseX, { damping: 28, stiffness: 180 });
  const y = useSpring(mouseY, { damping: 28, stiffness: 180 });
  const numberX = useTransform(x, [-300, 300], [-22, 22]);
  const numberY = useTransform(y, [-300, 300], [-12, 12]);

  function handleMouseMove(e: React.MouseEvent) {
    if (reduce) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set(e.clientX - (rect.left + rect.width / 2));
    mouseY.set(e.clientY - (rect.top + rect.height / 2));
  }

  const next = () => setActive((p) => (p + 1) % TESTIMONIALS.length);
  const prev = () => setActive((p) => (p - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);

  useEffect(() => {
    const t = setInterval(() => setActive((p) => (p + 1) % TESTIMONIALS.length), 6500);
    return () => clearInterval(t);
  }, []);

  const current = TESTIMONIALS[active];

  return (
    <section id="stories" className="relative overflow-hidden border-t border-border bg-background py-24 md:py-32">
      <div ref={containerRef} onMouseMove={handleMouseMove} className="relative mx-auto max-w-6xl px-4 md:px-6">
        {/* Oversized parallax index */}
        <motion.div
          aria-hidden
          style={reduce ? undefined : { x: numberX, y: numberY }}
          className="pointer-events-none absolute -top-10 left-0 select-none text-[12rem] font-bold leading-none tracking-tighter text-foreground/[0.04] md:-top-16 md:text-[22rem]"
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={active}
              initial={{ opacity: 0, scale: 0.85, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
              transition={{ duration: 0.6, ease: EASE }}
              className="block"
            >
              {String(active + 1).padStart(2, "0")}
            </motion.span>
          </AnimatePresence>
        </motion.div>

        <div className="relative flex gap-10 md:gap-16">
          {/* vertical rail (desktop) */}
          <div className="hidden flex-col items-center md:flex">
            <span
              className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground"
              style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
            >
              Stories
            </span>
            <div className="relative mt-6 h-28 w-px bg-border">
              <motion.div
                className="absolute left-0 top-0 w-full origin-top bg-brand"
                animate={{ height: `${((active + 1) / TESTIMONIALS.length) * 100}%` }}
                transition={{ duration: 0.5, ease: EASE }}
              />
            </div>
          </div>

          {/* main */}
          <div className="relative flex-1 pt-6 md:pt-12">
            <AnimatePresence mode="wait">
              <motion.div
                key={`ctx-${active}`}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.4 }}
                className="mb-7"
              >
                <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 font-mono text-[11px] text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-brand" />
                  {current.context}
                </span>
              </motion.div>
            </AnimatePresence>

            <div className="relative mb-10 min-h-[180px] md:min-h-[220px]">
              <AnimatePresence mode="wait">
                <motion.blockquote
                  key={`q-${active}`}
                  className="max-w-3xl text-[1.7rem] font-medium leading-[1.18] tracking-tight text-foreground md:text-[2.6rem]"
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  {current.quote.split(" ").map((word, i) => (
                    <motion.span
                      key={`${active}-${i}`}
                      className="mr-[0.28em] inline-block"
                      variants={{
                        hidden: { opacity: 0, y: 16, rotateX: reduce ? 0 : 70 },
                        visible: {
                          opacity: 1,
                          y: 0,
                          rotateX: 0,
                          transition: { duration: 0.5, delay: reduce ? 0 : i * 0.035, ease: EASE },
                        },
                        exit: { opacity: 0, y: -8, transition: { duration: 0.18, delay: i * 0.012 } },
                      }}
                    >
                      {word}
                    </motion.span>
                  ))}
                </motion.blockquote>
              </AnimatePresence>
            </div>

            <div className="flex items-end justify-between gap-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`a-${active}`}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.4, delay: 0.15 }}
                  className="flex items-center gap-3"
                >
                  <span className="h-px w-8 bg-foreground" />
                  <span className="text-[15px] font-semibold text-foreground">{current.author}</span>
                </motion.div>
              </AnimatePresence>

              <div className="flex items-center gap-3">
                {[{ icon: ArrowLeft, fn: prev, label: "Previous" }, { icon: ArrowRight, fn: next, label: "Next" }].map(
                  (b) => (
                    <motion.button
                      key={b.label}
                      type="button"
                      onClick={b.fn}
                      aria-label={`${b.label} story`}
                      whileTap={{ scale: 0.94 }}
                      className="grid size-11 place-items-center rounded-full border border-border text-foreground transition-colors hover:border-foreground/40 hover:bg-accent"
                    >
                      <b.icon className="size-4" />
                    </motion.button>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
