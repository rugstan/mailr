"use client";

import Link from "next/link";
import { useState } from "react";
import { useScroll, useMotionValueEvent, motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function SiteNav() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (v) => setSolid(v > 16));

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        solid ? "border-b border-border/70 bg-background/80 backdrop-blur-xl" : "border-b border-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link href="/" aria-label="MailboxOS home" className="shrink-0">
          <Logo tone={solid ? "default" : "invert"} />
        </Link>

        <div className="hidden items-center gap-0.5 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                solid ? "text-muted-foreground hover:text-foreground" : "text-white/70 hover:text-white",
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={cn("hidden sm:inline-flex", solid ? "" : "text-white hover:bg-white/10 hover:text-white")}
          >
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="shadow-sm">
            <Link href="/signup">Get your address</Link>
          </Button>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className={cn(
              "grid size-9 place-items-center rounded-md md:hidden",
              solid ? "text-foreground hover:bg-accent" : "text-white hover:bg-white/10",
            )}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-border/70 bg-background/95 backdrop-blur-xl md:hidden"
          >
            <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
                >
                  {l.label}
                </Link>
              ))}
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent"
              >
                Sign in
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
