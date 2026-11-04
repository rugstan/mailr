"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Forward,
  Hand,
  LoaderCircle,
  Recycle,
  ScanLine,
  Scissors,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ActionStatusBadge } from "@/components/status-badge";
import type { ActionStatus, ActionType, MailStatus } from "@/lib/types";
import { cancelRequest, requestAction } from "./actions";

const ACTION_LABELS: Record<ActionType, string> = {
  open_scan: "Open & Scan",
  forward: "Forward",
  shred: "Shred",
  recycle: "Recycle",
  pickup: "Hold for Pickup",
  hold: "Hold",
  check_deposit: "Deposit Check",
};

export interface PanelRequest {
  id: string;
  action: ActionType;
  status: ActionStatus;
  rush: boolean;
  sla_due_at: string | null;
}

interface ActionPanelProps {
  itemId: string;
  status: MailStatus;
  openRequest: PanelRequest | null;
}

const ACTIONABLE: MailStatus[] = ["checked_in", "notified", "action_pending"];

type RequestableAction = "open_scan" | "forward" | "pickup" | "shred" | "recycle";

export function ActionPanel({ itemId, status, openRequest }: ActionPanelProps) {
  const [rush, setRush] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(action: RequestableAction, params?: { name: string; street: string; city: string; state: string; zip: string }) {
    setPendingAction(action);
    startTransition(async () => {
      const result = await requestAction(itemId, action, rush, params);
      setPendingAction(null);
      if (result.error) {
        toast.error(result.error);
      } else {
        setForwardOpen(false);
        toast.success(`${ACTION_LABELS[action]} requested`);
      }
    });
  }

  function cancel(requestId: string) {
    setPendingAction("cancel");
    startTransition(async () => {
      const result = await cancelRequest(requestId);
      setPendingAction(null);
      if (result.error) toast.error(result.error);
      else toast.success("Request canceled");
    });
  }

  function handleForwardSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    submit("forward", {
      name: String(fd.get("name") ?? ""),
      street: String(fd.get("street") ?? ""),
      city: String(fd.get("city") ?? ""),
      state: String(fd.get("state") ?? ""),
      zip: String(fd.get("zip") ?? ""),
    });
  }

  if (openRequest) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-medium">{ACTION_LABELS[openRequest.action]}</p>
          <ActionStatusBadge status={openRequest.status} />
        </div>
        <div className="space-y-1.5 text-sm text-muted-foreground">
          {openRequest.rush ? (
            <Badge className="bg-amber-100 text-amber-800">
              <Zap className="size-3" /> Rush
            </Badge>
          ) : null}
          {openRequest.sla_due_at ? (
            <p>
              Due {formatDistanceToNow(new Date(openRequest.sla_due_at), { addSuffix: true })}
            </p>
          ) : null}
          <p>We&apos;ll notify you the moment it&apos;s done.</p>
        </div>
        {openRequest.status === "requested" ? (
          <>
            <Separator />
            <Button
              variant="outline"
              className="w-full"
              disabled={isPending}
              onClick={() => cancel(openRequest.id)}
            >
              {isPending && pendingAction === "cancel" ? <LoaderCircle className="animate-spin" /> : null}
              Cancel request
            </Button>
          </>
        ) : null}
      </div>
    );
  }

  if (!ACTIONABLE.includes(status)) {
    return (
      <p className="text-sm text-muted-foreground">
        No actions are available for this item — it has already been processed.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
        <Label htmlFor="rush" className="flex items-center gap-2 text-sm font-normal">
          <Zap className="size-4 text-amber-500" />
          Rush (2-hour SLA)
        </Label>
        <Switch id="rush" checked={rush} onCheckedChange={setRush} />
      </div>

      <div className="grid gap-2">
        <Button className="w-full justify-start" disabled={isPending} onClick={() => submit("open_scan")}>
          {isPending && pendingAction === "open_scan" ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <ScanLine />
          )}
          Open &amp; Scan
        </Button>

        <Dialog open={forwardOpen} onOpenChange={setForwardOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full justify-start" disabled={isPending}>
              <Forward />
              Forward
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Forward this item</DialogTitle>
              <DialogDescription>
                We&apos;ll rate-shop postage and ship it with tracking. Postage plus handling is added to your
                next invoice.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleForwardSubmit} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="fwd-name">Recipient name</Label>
                <Input id="fwd-name" name="name" required placeholder="Jane Doe" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fwd-street">Street address</Label>
                <Input id="fwd-street" name="street" required placeholder="500 Oak Ave, Apt 2" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1 space-y-2">
                  <Label htmlFor="fwd-city">City</Label>
                  <Input id="fwd-city" name="city" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fwd-state">State</Label>
                  <Input id="fwd-state" name="state" required maxLength={20} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fwd-zip">ZIP</Label>
                  <Input id="fwd-zip" name="zip" required />
                </div>
              </div>
              <DialogFooter className="pt-2">
                <Button type="submit" disabled={isPending}>
                  {isPending && pendingAction === "forward" ? <LoaderCircle className="animate-spin" /> : null}
                  Request forwarding
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Button variant="outline" className="w-full justify-start" disabled={isPending} onClick={() => submit("pickup")}>
          {isPending && pendingAction === "pickup" ? <LoaderCircle className="animate-spin" /> : <Hand />}
          Hold for Pickup
        </Button>
        <Button variant="outline" className="w-full justify-start" disabled={isPending} onClick={() => submit("shred")}>
          {isPending && pendingAction === "shred" ? <LoaderCircle className="animate-spin" /> : <Scissors />}
          Shred
        </Button>
        <Button variant="outline" className="w-full justify-start" disabled={isPending} onClick={() => submit("recycle")}>
          {isPending && pendingAction === "recycle" ? <LoaderCircle className="animate-spin" /> : <Recycle />}
          Recycle
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Open &amp; Scan records your consent for this item, as required by USPS rules.
      </p>
    </div>
  );
}
