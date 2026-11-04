"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import {
  Camera,
  CircleCheck,
  CircleX,
  CornerUpLeft,
  Printer,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Barcode } from "@/components/barcode";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MailCategory, MailKind } from "@/lib/types";
import {
  checkInItem,
  lookupMailbox,
  returnToSender,
  type CheckInSuccess,
  type MailboxLookup,
} from "./actions";

const KINDS: { value: MailKind; label: string }[] = [
  { value: "letter", label: "Letter" },
  { value: "large_envelope", label: "Large envelope" },
  { value: "package", label: "Package" },
];

const CARRIERS = ["USPS", "UPS", "FedEx", "Amazon", "DHL", "Other"] as const;

const CATEGORIES: MailCategory[] = [
  "unknown",
  "bill",
  "government",
  "legal",
  "financial",
  "check",
  "personal",
  "marketing",
  "package_contents",
];

function isAcceptable(r: MailboxLookup["recipients"][number]): boolean {
  if (r.status !== "verified") return false;
  if (r.idExpiresOn && r.idExpiresOn < new Date().toISOString().slice(0, 10)) return false;
  return true;
}

export function IntakeWorkstation() {
  const [stage, setStage] = useState<"pmb" | "form" | "done">("pmb");
  const [pmbValue, setPmbValue] = useState("");
  const [mailbox, setMailbox] = useState<MailboxLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Form state
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [kind, setKind] = useState<MailKind>("letter");
  const [sender, setSender] = useState("");
  const [carrier, setCarrier] = useState<string>("USPS");
  const [category, setCategory] = useState<MailCategory>("unknown");
  const [weightOz, setWeightOz] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  // Return-to-sender dialog
  const [rtsOpen, setRtsOpen] = useState(false);
  const [rtsKind, setRtsKind] = useState<MailKind>("letter");
  const [rtsSender, setRtsSender] = useState("");
  const [rtsReason, setRtsReason] = useState("");

  const [success, setSuccess] = useState<CheckInSuccess | null>(null);

  // Session speed counter
  const sessionStartRef = useRef<number | null>(null);
  const [completions, setCompletions] = useState<number[]>([]);

  const [pending, startTransition] = useTransition();

  const pmbInputRef = useRef<HTMLInputElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (stage === "pmb") pmbInputRef.current?.focus();
    if (stage === "done") nextButtonRef.current?.focus();
  }, [stage]);

  const avgSeconds = useMemo(() => {
    if (completions.length === 0 || sessionStartRef.current == null) return 0;
    const elapsed = completions[completions.length - 1] - sessionStartRef.current;
    return Math.max(1, Math.round(elapsed / completions.length / 1000));
  }, [completions]);

  function recordCompletion() {
    setCompletions((prev) => [...prev, Date.now()]);
  }

  function resetForNext() {
    setStage("pmb");
    setPmbValue("");
    setMailbox(null);
    setLookupError(null);
    setRecipientId(null);
    setKind("letter");
    setSender("");
    setCarrier("USPS");
    setCategory("unknown");
    setWeightOz("");
    setSubmitError(null);
    setSuccess(null);
    setRtsOpen(false);
    setRtsSender("");
    setRtsReason("");
  }

  function handleLookup() {
    const value = pmbValue.trim();
    if (!value) return;
    if (sessionStartRef.current == null) sessionStartRef.current = Date.now();
    setLookupError(null);
    startTransition(async () => {
      const result = await lookupMailbox(value);
      if ("error" in result) {
        setLookupError(result.error);
        pmbInputRef.current?.select();
        return;
      }
      setMailbox(result.mailbox);
      const firstOk = result.mailbox.recipients.find(isAcceptable);
      setRecipientId(firstOk?.id ?? null);
      setStage("form");
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!mailbox || !recipientId || pending) return;
    setSubmitError(null);

    const fd = new FormData();
    fd.set("mailboxId", mailbox.mailboxId);
    fd.set("recipientId", recipientId);
    fd.set("kind", kind);
    fd.set("sender", sender);
    fd.set("carrier", carrier);
    fd.set("category", category);
    if (kind === "package" && weightOz) fd.set("weightOz", weightOz);
    const photo = photoRef.current?.files?.[0];
    if (photo) fd.set("photo", photo);

    startTransition(async () => {
      const result = await checkInItem(fd);
      if ("error" in result) {
        setSubmitError(result.error);
        return;
      }
      recordCompletion();
      setSuccess(result);
      setStage("done");
      toast.success(`Checked in ${result.barcode}`);
    });
  }

  function handleReturnToSender() {
    if (!mailbox || pending) return;
    const fd = new FormData();
    fd.set("mailboxId", mailbox.mailboxId);
    fd.set("kind", rtsKind);
    fd.set("sender", rtsSender);
    fd.set("reason", rtsReason);
    startTransition(async () => {
      const result = await returnToSender(fd);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      recordCompletion();
      toast.success("Item marked return to sender");
      resetForNext();
    });
  }

  const acceptableCount = mailbox?.recipients.filter(isAcceptable).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge variant="secondary" className="text-sm tabular-nums">
          {completions.length} items · avg {avgSeconds}s
        </Badge>
        {stage !== "pmb" && (
          <Button variant="ghost" size="sm" onClick={resetForNext} disabled={pending}>
            <CircleX /> Cancel — back to PMB
          </Button>
        )}
      </div>

      {stage === "pmb" && (
        <Card>
          <CardContent className="space-y-4 pt-2">
            <Label htmlFor="pmb-input" className="text-base">
              Scan or type the PMB number
            </Label>
            <Input
              id="pmb-input"
              ref={pmbInputRef}
              autoFocus
              inputMode="numeric"
              autoComplete="off"
              placeholder="PMB"
              value={pmbValue}
              onChange={(e) => setPmbValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleLookup();
                }
              }}
              className="h-24 text-center font-mono !text-5xl tracking-widest"
              disabled={pending}
            />
            {lookupError && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>{lookupError}</AlertTitle>
              </Alert>
            )}
            <Button size="lg" className="h-12 w-full text-base" onClick={handleLookup} disabled={pending || !pmbValue.trim()}>
              {pending ? "Looking up…" : "Look up mailbox (Enter)"}
            </Button>
          </CardContent>
        </Card>
      )}

      {stage === "form" && mailbox && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <CardContent className="space-y-5 pt-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-2xl font-semibold">PMB {mailbox.pmb}</span>
                <span className="text-lg">{mailbox.customerName ?? "No customer assigned"}</span>
                {mailbox.customerStatus === "suspended" ? (
                  <Badge variant="destructive">SUSPENDED — intake allowed, mail is held</Badge>
                ) : mailbox.customerStatus ? (
                  <Badge variant="secondary" className="capitalize">
                    {mailbox.customerStatus.replaceAll("_", " ")}
                  </Badge>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label className="text-base">Recipient</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {mailbox.recipients.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No recipients on this mailbox.
                    </p>
                  )}
                  {mailbox.recipients.map((r) => {
                    const ok = isAcceptable(r);
                    const expired =
                      r.status === "verified" &&
                      !!r.idExpiresOn &&
                      r.idExpiresOn < new Date().toISOString().slice(0, 10);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        disabled={!ok}
                        onClick={() => setRecipientId(r.id)}
                        className={`flex min-h-16 flex-col items-start justify-center rounded-lg border-2 px-4 py-2 text-left transition-colors ${
                          recipientId === r.id
                            ? "border-emerald-600 bg-emerald-50"
                            : "border-border bg-background"
                        } ${ok ? "hover:border-emerald-400" : "cursor-not-allowed opacity-60"}`}
                      >
                        <span className="flex items-center gap-2 text-base font-medium">
                          {ok && <CircleCheck className="size-5 text-emerald-600" />}
                          {r.fullName}
                        </span>
                        {!ok && (
                          <span className="text-xs text-red-600">
                            {expired
                              ? `ID expired ${r.idExpiresOn} — cannot accept`
                              : "Not 1583-verified — cannot accept"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-base">Kind</Label>
                <div className="grid grid-cols-3 gap-2">
                  {KINDS.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => setKind(k.value)}
                      className={`min-h-14 rounded-lg border-2 px-2 text-base font-medium transition-colors ${
                        kind === k.value
                          ? "border-amber-600 bg-amber-50"
                          : "border-border bg-background hover:border-amber-400"
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
                {kind === "package" && (
                  <div className="flex items-center gap-2 pt-1">
                    <Label htmlFor="weight" className="shrink-0">
                      Weight (oz)
                    </Label>
                    <Input
                      id="weight"
                      inputMode="decimal"
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={weightOz}
                      onChange={(e) => setWeightOz(e.target.value)}
                      className="h-11 max-w-36 text-lg"
                      required
                    />
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sender" className="text-base">
                    Sender
                  </Label>
                  <Input
                    id="sender"
                    autoFocus
                    autoComplete="off"
                    placeholder="e.g. IRS, Chase, Amazon"
                    value={sender}
                    onChange={(e) => setSender(e.target.value)}
                    className="h-11 text-lg"
                  />
                  <p className="text-xs text-muted-foreground">Enter submits the item.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-base">Carrier</Label>
                  <Select value={carrier} onValueChange={setCarrier}>
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARRIERS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-base">Category</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as MailCategory)}>
                    <SelectTrigger className="h-11 w-full capitalize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c} className="capitalize">
                          {c.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {category === "government" && (
                    <p className="text-xs font-medium text-red-600">
                      Government mail — urgency 3 is applied automatically.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="photo" className="flex items-center gap-1.5 text-base">
                    <Camera className="size-4" /> Exterior photo (optional)
                  </Label>
                  <input
                    id="photo"
                    ref={photoRef}
                    type="file"
                    name="photo"
                    accept="image/*"
                    capture="environment"
                    className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium"
                  />
                </div>
              </div>

              {submitError && (
                <Alert variant="destructive">
                  <TriangleAlert />
                  <AlertTitle>Cannot check in</AlertTitle>
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="submit"
                  size="lg"
                  className="h-14 flex-1 bg-emerald-600 text-lg hover:bg-emerald-700"
                  disabled={pending || !recipientId}
                >
                  {pending ? "Checking in…" : "Check in & print label (Enter)"}
                </Button>
                <Button
                  type="button"
                  variant={acceptableCount === 0 ? "destructive" : "outline"}
                  size="lg"
                  className={`h-14 ${acceptableCount === 0 ? "" : "border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"}`}
                  onClick={() => {
                    setRtsKind(kind);
                    setRtsSender(sender);
                    setRtsOpen(true);
                  }}
                  disabled={pending}
                >
                  <CornerUpLeft /> Return to sender
                </Button>
              </div>
              {acceptableCount === 0 && (
                <p className="text-sm font-medium text-red-600">
                  No 1583-verified recipient on this mailbox — this item cannot be accepted.
                </p>
              )}
            </CardContent>
          </Card>
        </form>
      )}

      {stage === "done" && success && (
        <Card>
          <CardContent className="space-y-4 pt-2">
            <div
              id="print-label"
              className="mx-auto flex w-fit flex-col items-center gap-1 rounded-lg border bg-white p-6 text-black"
            >
              <Barcode value={success.barcode} />
              <p className="font-mono text-2xl font-bold">PMB {success.pmb}</p>
              <p className="text-lg">{success.recipientName}</p>
              <p className="text-sm">{format(new Date(), "MMM d, yyyy h:mm a")}</p>
            </div>
            <style>{`@media print {
              body * { visibility: hidden; }
              #print-label, #print-label * { visibility: visible; }
              #print-label { position: fixed; inset: 0; border: none; display: flex; flex-direction: column; align-items: center; justify-content: center; }
            }`}</style>
            <div className="flex gap-3">
              <Button
                size="lg"
                variant="outline"
                className="h-14 flex-1 text-base"
                onClick={() => window.print()}
              >
                <Printer /> Print label
              </Button>
              <Button
                ref={nextButtonRef}
                size="lg"
                className="h-14 flex-1 text-base"
                onClick={resetForNext}
              >
                Next item (Enter)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={rtsOpen} onOpenChange={setRtsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return to sender</DialogTitle>
            <DialogDescription>
              The item is logged for audit and marked returned — it is never placed in the
              mailbox.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Kind</Label>
              <div className="grid grid-cols-3 gap-2">
                {KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setRtsKind(k.value)}
                    className={`rounded-md border-2 px-2 py-2 text-sm font-medium ${
                      rtsKind === k.value ? "border-red-500 bg-red-50" : "border-border"
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rts-sender">Sender</Label>
              <Input
                id="rts-sender"
                value={rtsSender}
                onChange={(e) => setRtsSender(e.target.value)}
                placeholder="Sender on the envelope"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rts-reason">Reason</Label>
              <Textarea
                id="rts-reason"
                value={rtsReason}
                onChange={(e) => setRtsReason(e.target.value)}
                placeholder="e.g. Addressee not a verified recipient on PMB"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRtsOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReturnToSender}
              disabled={pending || rtsReason.trim().length < 3}
            >
              {pending ? "Recording…" : "Confirm return to sender"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
