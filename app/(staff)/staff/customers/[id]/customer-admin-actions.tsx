"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reactivateCustomer, suspendCustomer } from "./actions";

export function CustomerAdminActions({
  customerId,
  customerName,
  isSuspended,
}: {
  customerId: string;
  customerName: string;
  isSuspended: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSuspend() {
    startTransition(async () => {
      const result = await suspendCustomer({ customerId, reason });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Customer suspended — service paused, mail held");
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  function handleReactivate() {
    startTransition(async () => {
      const result = await reactivateCustomer(customerId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Customer reactivated");
      router.refresh();
    });
  }

  if (isSuspended) {
    return (
      <Button onClick={handleReactivate} disabled={pending}>
        <RotateCcw /> {pending ? "Restoring…" : "Reactivate service"}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Ban /> Suspend service
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend {customerName}</DialogTitle>
          <DialogDescription>
            Suspension pauses scans, pickups, and forwarding. Incoming mail is still accepted
            and held. The customer is notified by email and SMS.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="suspend-reason">Reason</Label>
          <Textarea
            id="suspend-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Chargeback on May invoice"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSuspend}
            disabled={pending || reason.trim().length < 3}
          >
            {pending ? "Suspending…" : "Suspend customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
