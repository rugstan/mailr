"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send, Archive, Trash2, ScanLine, Check, LoaderCircle, Inbox } from "lucide-react";
import { Logo } from "@/components/marketing/logo";
import { cn } from "@/lib/utils";
import { requestMailAction } from "./actions";

export interface RenterScan {
  id: string;
  kind: "exterior" | "contents";
  sender: string | null;
  note: string | null;
  scanned_at: string;
  requested_action: "forward" | "hold" | "shred" | "open_scan" | null;
  urls: string[];
}

const ACTIONS = [
  { key: "open_scan", label: "Open & scan", icon: ScanLine },
  { key: "forward", label: "Forward", icon: Send },
  { key: "hold", label: "Hold", icon: Archive },
  { key: "shred", label: "Shred", icon: Trash2 },
] as const;

const ACTION_LABEL: Record<string, string> = {
  open_scan: "Open & scan requested",
  forward: "Forward requested",
  hold: "Hold requested",
  shred: "Shred requested",
};

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function RenterMailView({
  token,
  box,
  location,
  scans,
}: {
  token: string;
  box: { box_number: string; renter: string; business: string | null };
  location: { name: string; street_address: string; city: string; state: string; zip: string } | null;
  scans: RenterScan[];
}) {
  const [state, setState] = useState<Record<string, RenterScan["requested_action"]>>(
    () => Object.fromEntries(scans.map((s) => [s.id, s.requested_action])),
  );
  const [pending, setPending] = useState<string | null>(null);

  async function request(scanId: string, action: "forward" | "hold" | "shred" | "open_scan") {
    setPending(`${scanId}:${action}`);
    const res = await requestMailAction({ token, scan_id: scanId, action });
    setPending(null);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    setState((s) => ({ ...s, [scanId]: action }));
    toast.success("Request sent to the store");
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <Logo />
          <div className="text-right">
            <p className="text-sm font-semibold leading-tight">Box {box.box_number}</p>
            <p className="text-[11px] text-muted-foreground">{box.business || box.renter}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-16 pt-5">
        <div className="mb-5">
          <h1 className="text-xl font-semibold tracking-tight">Your mail</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {location ? `${location.name} · ${location.city}, ${location.state}` : "Scanned mail, ready to act on."}
          </p>
        </div>

        {scans.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <Inbox className="mx-auto size-9 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium">No mail scanned yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              When the store scans mail for box {box.box_number}, it shows up here.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {scans.map((s) => {
              const requested = state[s.id];
              return (
                <li key={s.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
                  {s.urls.length > 0 ? (
                    <div className={cn("grid gap-0.5 bg-muted", s.urls.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                      {s.urls.slice(0, 4).map((u, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={u}
                          alt={`Scan ${i + 1}`}
                          className="aspect-[4/3] w-full object-cover"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  ) : null}

                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand-emphasis">
                        {s.kind === "contents" ? "Opened & scanned" : "Received"}
                      </span>
                      <span className="text-xs text-muted-foreground">{fmt(s.scanned_at)}</span>
                    </div>
                    {s.sender ? <p className="mt-2.5 text-sm font-medium">{s.sender}</p> : null}
                    {s.note ? <p className="mt-1 text-sm text-muted-foreground">{s.note}</p> : null}

                    {requested ? (
                      <div className="mt-3 flex items-center gap-2 rounded-xl border border-brand/25 bg-brand/5 px-3 py-2 text-sm text-brand-emphasis">
                        <Check className="size-4" />
                        {ACTION_LABEL[requested]} — the store will take it from here.
                      </div>
                    ) : (
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {ACTIONS.map((a) => {
                          const isPending = pending === `${s.id}:${a.key}`;
                          return (
                            <button
                              key={a.key}
                              type="button"
                              disabled={!!pending}
                              onClick={() => request(s.id, a.key)}
                              className={cn(
                                "flex flex-col items-center gap-1 rounded-xl border border-border bg-background py-2.5 text-[11px] font-medium transition-colors",
                                "hover:border-foreground/30 hover:bg-accent disabled:opacity-50",
                                a.key === "shred" && "hover:border-destructive/40 hover:text-destructive",
                              )}
                            >
                              {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <a.icon className="size-4 text-brand-emphasis" />}
                              {a.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Private link for box {box.box_number}. Don&apos;t share it — anyone with this link can see your mail.
        </p>
      </main>
    </div>
  );
}
