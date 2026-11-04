"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CircleCheck, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { MailStatusBadge, SubStatusBadge } from "@/components/status-badge";
import { SignaturePad } from "@/components/signature-pad";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  completePickup,
  findForPickup,
  type PickupSearchResult,
} from "./actions";

const ID_TYPES = [
  { value: "drivers_license", label: "Driver's license" },
  { value: "passport", label: "Passport" },
  { value: "state_id", label: "State ID" },
  { value: "military_id", label: "Military ID" },
  { value: "other_photo_id", label: "Other photo ID" },
];

export function PickupClient() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<PickupSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [idType, setIdType] = useState("drivers_license");
  const [signature, setSignature] = useState<string | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ released: number; customerName: string } | null>(
    null
  );
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!result && !success) searchRef.current?.focus();
  }, [result, success]);

  function reset() {
    setQuery("");
    setResult(null);
    setSearchError(null);
    setSelected(new Set());
    setIdType("drivers_license");
    setSignature(null);
    setReleaseError(null);
    setSuccess(null);
  }

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = query.trim();
    if (!value || pending) return;
    setSearchError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await findForPickup(value);
      if ("error" in res) {
        setResult(null);
        setSearchError(res.error);
        searchRef.current?.select();
        return;
      }
      setResult(res);
      setSelected(new Set(res.items.map((i) => i.id)));
      setReleaseError(null);
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleComplete() {
    if (!result || selected.size === 0 || !signature || pending) return;
    setReleaseError(null);
    startTransition(async () => {
      const res = await completePickup({
        itemIds: Array.from(selected),
        idType,
        signatureDataUrl: signature,
      });
      if ("error" in res) {
        setReleaseError(res.error);
        return;
      }
      toast.success(`${res.released} item${res.released === 1 ? "" : "s"} released`);
      setSuccess(res);
      setResult(null);
    });
  }

  const suspended =
    result?.customer.status === "suspended" || result?.customer.status === "canceled";

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          ref={searchRef}
          autoFocus
          autoComplete="off"
          placeholder="Scan barcode (MB-…) or type PMB"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-14 font-mono !text-2xl"
        />
        <Button type="submit" size="lg" className="h-14" disabled={pending || !query.trim()}>
          <Search /> {pending ? "Searching…" : "Find"}
        </Button>
      </form>

      {searchError && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>{searchError}</AlertTitle>
        </Alert>
      )}

      {success && (
        <Card className="border-emerald-300 bg-emerald-50">
          <CardContent className="flex items-center gap-3 pt-2">
            <CircleCheck className="size-10 text-emerald-600" />
            <div>
              <p className="text-xl font-semibold text-emerald-900">
                {success.released} item{success.released === 1 ? "" : "s"} released to{" "}
                {success.customerName}
              </p>
              <Button variant="outline" size="sm" className="mt-2" onClick={reset}>
                New pickup
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-3 text-xl">
              {result.customer.name}
              {result.pmb != null && (
                <span className="font-mono text-base text-muted-foreground">
                  PMB {result.pmb}
                </span>
              )}
              <SubStatusBadge status={result.customer.status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {suspended && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>
                  SUSPENDED — collect balance before release; release is blocked by the system
                </AlertTitle>
                {result.customer.suspensionReason && (
                  <AlertDescription>
                    Reason: {result.customer.suspensionReason}
                  </AlertDescription>
                )}
              </Alert>
            )}

            <div className="space-y-2">
              <Label className="text-base">Items to release ({selected.size} selected)</Label>
              {result.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing is waiting for pickup on this mailbox.
                </p>
              ) : (
                <div className="divide-y rounded-md border">
                  {result.items.map((item) => (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-accent/40"
                    >
                      <Checkbox
                        checked={selected.has(item.id)}
                        onCheckedChange={() => toggle(item.id)}
                      />
                      <span className="w-44 shrink-0 font-mono text-sm">
                        {item.barcode ?? "no barcode"}
                      </span>
                      <span className="w-32 shrink-0 capitalize">
                        {item.kind.replaceAll("_", " ")}
                      </span>
                      <span className="flex-1 truncate text-muted-foreground">
                        {item.sender ?? "Unknown sender"}
                      </span>
                      <MailStatusBadge status={item.status} />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-base">Verified photo ID</Label>
                <Select value={idType} onValueChange={setIdType}>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ID_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Check the ID in person before releasing mail.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-base">Customer signature</Label>
                <SignaturePad onChange={setSignature} />
              </div>
            </div>

            {releaseError && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>Release blocked</AlertTitle>
                <AlertDescription>{releaseError}</AlertDescription>
              </Alert>
            )}

            <Button
              size="lg"
              className="h-14 w-full bg-emerald-600 text-lg hover:bg-emerald-700"
              onClick={handleComplete}
              disabled={pending || selected.size === 0 || !signature}
            >
              {pending
                ? "Releasing…"
                : `Release ${selected.size} item${selected.size === 1 ? "" : "s"}`}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
