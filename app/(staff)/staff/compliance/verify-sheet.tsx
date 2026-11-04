"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { rejectRecipient, verifyRecipient } from "./actions";

const DOC1_TYPES = [
  { value: "drivers_license", label: "Driver's license" },
  { value: "passport", label: "Passport" },
  { value: "state_id", label: "State ID" },
  { value: "other", label: "Other" },
];

const DOC2_TYPES = [
  { value: "utility_bill", label: "Utility bill" },
  { value: "lease", label: "Lease" },
  { value: "insurance_policy", label: "Insurance policy" },
  { value: "vehicle_registration", label: "Vehicle registration" },
  { value: "other", label: "Other" },
];

export interface VerifySheetRecipient {
  id: string;
  fullName: string;
  customerName: string | null;
  pmb: number | null;
}

export function VerifySheet({ recipient }: { recipient: VerifySheetRecipient }) {
  const [open, setOpen] = useState(false);
  const [doc1Type, setDoc1Type] = useState("drivers_license");
  const [doc2Type, setDoc2Type] = useState("utility_bill");
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("recipientId", recipient.id);
    fd.set("doc1Type", doc1Type);
    fd.set("doc2Type", doc2Type);
    startTransition(async () => {
      const result = await verifyRecipient(fd);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(`${recipient.fullName} verified — mail can now be accepted`);
      setOpen(false);
      router.refresh();
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectRecipient({
        recipientId: recipient.id,
        reason: rejectReason,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(`${recipient.fullName} rejected — customer notified`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <ShieldCheck /> Verify
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Verify {recipient.fullName}</SheetTitle>
          <SheetDescription>
            {recipient.customerName ?? "Unknown customer"}
            {recipient.pmb != null ? ` · PMB ${recipient.pmb}` : ""}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleVerify} className="space-y-5 px-4 pb-6">
          <Alert className="border-brand/25 bg-brand/5 text-foreground [&>svg]:text-brand-emphasis">
            <ShieldCheck />
            <AlertTitle>Verify both IDs in person per USPS rules</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              One photo ID plus one document tying the recipient to an address. You are the
              1583 witness of record.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>ID document 1 — photo ID</Label>
            <Select value={doc1Type} onValueChange={setDoc1Type}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC1_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              name="doc1"
              type="file"
              accept="image/*,application/pdf"
              required
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium"
            />
          </div>

          <div className="space-y-2">
            <Label>ID document 2 — address document</Label>
            <Select value={doc2Type} onValueChange={setDoc2Type}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC2_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              name="doc2"
              type="file"
              accept="image/*,application/pdf"
              required
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`expires-${recipient.id}`}>Photo ID expires on</Label>
            <Input
              id={`expires-${recipient.id}`}
              name="idExpiresOn"
              type="date"
              required
              className="max-w-48"
            />
          </div>

          <div className="space-y-2">
            <Label>Witnessed Form 1583 PDF (optional)</Label>
            <input
              name="form1583"
              type="file"
              accept="application/pdf"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium"
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Could not complete</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={pending}>
            {pending ? "Saving…" : "Mark verified"}
          </Button>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor={`reject-${recipient.id}`} className="text-red-600">
              Reject verification
            </Label>
            <Textarea
              id={`reject-${recipient.id}`}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason shared with the customer, e.g. ID name does not match"
            />
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={handleReject}
              disabled={pending || rejectReason.trim().length < 3}
            >
              {pending ? "Working…" : "Reject & notify customer"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
