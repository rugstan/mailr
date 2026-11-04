"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { FileUp, Flame, Info, PackageCheck, Recycle, Send } from "lucide-react";
import { toast } from "sonner";
import { ActionStatusBadge, MailStatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCents } from "@/lib/money";
import type { ActionStatus, ActionType, MailKind, MailStatus } from "@/lib/types";
import {
  fulfillDestroy,
  fulfillForward,
  fulfillPickupRequest,
  fulfillScan,
  startScanRequest,
} from "./actions";

export interface QueueRow {
  id: string;
  action: ActionType;
  label: string;
  status: ActionStatus;
  rush: boolean;
  slaDueAt: string | null;
  requestedAt: string;
  params: Record<string, unknown>;
  itemId: string | null;
  itemStatus: MailStatus | null;
  barcode: string | null;
  kind: MailKind | null;
  sender: string | null;
  pmb: number | null;
  customerName: string | null;
}

export interface QueueSettings {
  forwardMarkupPct: number;
  forwardHandlingCents: number;
}

const ADDRESS_KEYS = [
  "name",
  "attention",
  "company",
  "street",
  "street1",
  "street2",
  "address",
  "address1",
  "address2",
  "line1",
  "line2",
  "city",
  "state",
  "zip",
  "postal_code",
  "country",
];

function SlaCell({ slaDueAt }: { slaDueAt: string | null }) {
  if (!slaDueAt) return <span className="text-muted-foreground">—</span>;
  const due = new Date(slaDueAt);
  const past = due.getTime() < Date.now();
  return (
    <span className={past ? "font-semibold text-red-600" : ""}>
      {formatDistanceToNow(due, { addSuffix: true })}
    </span>
  );
}

export function QueueClient({
  scanRows,
  otherRows,
  settings,
}: {
  scanRows: QueueRow[];
  otherRows: QueueRow[];
  settings: QueueSettings;
}) {
  const [active, setActive] = useState<QueueRow | null>(null);
  const router = useRouter();

  function closeAndRefresh() {
    setActive(null);
    router.refresh();
  }

  return (
    <>
      <Tabs defaultValue="scan">
        <TabsList>
          <TabsTrigger value="scan">Scan queue ({scanRows.length})</TabsTrigger>
          <TabsTrigger value="other">Other actions ({otherRows.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="scan">
          <QueueTable rows={scanRows} onFulfill={setActive} empty="No open scan requests. Nice." />
        </TabsContent>
        <TabsContent value="other">
          <QueueTable
            rows={otherRows}
            onFulfill={setActive}
            empty="No forwards, shreds, or pickups waiting."
          />
        </TabsContent>
      </Tabs>

      <Sheet open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle>{active.label}</SheetTitle>
                <SheetDescription>
                  <span className="font-mono">{active.barcode ?? "no barcode"}</span> · PMB{" "}
                  {active.pmb ?? "—"} · {active.customerName ?? "Unknown customer"}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {active.rush && <Badge variant="destructive">RUSH</Badge>}
                  <ActionStatusBadge status={active.status} />
                  {active.itemStatus && <MailStatusBadge status={active.itemStatus} />}
                  <span className="text-muted-foreground">
                    SLA <SlaCell slaDueAt={active.slaDueAt} />
                  </span>
                </div>
                {active.action === "open_scan" && (
                  <ScanFlow row={active} onDone={closeAndRefresh} />
                )}
                {active.action === "forward" && (
                  <ForwardFlow row={active} settings={settings} onDone={closeAndRefresh} />
                )}
                {(active.action === "shred" || active.action === "recycle") && (
                  <DestroyFlow row={active} onDone={closeAndRefresh} />
                )}
                {(active.action === "pickup" ||
                  active.action === "hold" ||
                  active.action === "check_deposit") && (
                  <PickupFlow row={active} onDone={closeAndRefresh} />
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function QueueTable({
  rows,
  onFulfill,
  empty,
}: {
  rows: QueueRow[];
  onFulfill: (row: QueueRow) => void;
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="rounded-md border p-8 text-center text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Barcode</TableHead>
            <TableHead>PMB</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>SLA due</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono">{row.barcode ?? "—"}</TableCell>
              <TableCell className="tabular-nums">{row.pmb ?? "—"}</TableCell>
              <TableCell>{row.customerName ?? "—"}</TableCell>
              <TableCell>
                <span className="flex items-center gap-2">
                  {row.label}
                  {row.rush && <Badge variant="destructive">RUSH</Badge>}
                </span>
              </TableCell>
              <TableCell>
                <SlaCell slaDueAt={row.slaDueAt} />
              </TableCell>
              <TableCell>
                <ActionStatusBadge status={row.status} />
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" onClick={() => onFulfill(row)}>
                  Fulfill
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ConsentBanner({ row }: { row: QueueRow }) {
  const standingRuleId = row.params?.standing_rule_id;
  return (
    <Alert className="border-brand/25 bg-brand/5 text-foreground [&>svg]:text-brand-emphasis">
      <Info />
      <AlertTitle>Consent on file</AlertTitle>
      <AlertDescription className="text-muted-foreground">
        Customer request {row.id.slice(0, 8)} · requested{" "}
        {format(new Date(row.requestedAt), "MMM d, yyyy h:mm a")}
        {standingRuleId ? " · (auto-created by standing rule)" : ""}
      </AlertDescription>
    </Alert>
  );
}

function ScanFlow({ row, onDone }: { row: QueueRow; onDone: () => void }) {
  const [started, setStarted] = useState(row.status === "in_progress");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleStart() {
    startTransition(async () => {
      const result = await startScanRequest(row.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setStarted(true);
      toast.success("Marked in progress");
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("requestId", row.id);
    startTransition(async () => {
      const result = await fulfillScan(fd);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Scan uploaded — customer notified");
      onDone();
    });
  }

  return (
    <div className="space-y-4">
      <ConsentBanner row={row} />
      {!started ? (
        <Button className="w-full" size="lg" onClick={handleStart} disabled={pending}>
          {pending ? "Starting…" : "Start (mark in progress)"}
        </Button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="scan-pdf" className="flex items-center gap-1.5">
              <FileUp className="size-4" /> Scanned PDF
            </Label>
            <input
              id="scan-pdf"
              name="pdf"
              type="file"
              accept="application/pdf"
              required
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium"
            />
            <p className="text-xs text-muted-foreground">PDF, max 50MB.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="scan-pages">Page count</Label>
            <Input
              id="scan-pages"
              name="pageCount"
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              required
              className="max-w-32"
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Scan blocked</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={pending}>
            {pending ? "Uploading…" : "Complete scan & notify customer"}
          </Button>
        </form>
      )}
    </div>
  );
}

function ForwardFlow({
  row,
  settings,
  onDone,
}: {
  row: QueueRow;
  settings: QueueSettings;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [postage, setPostage] = useState("");
  const [pending, startTransition] = useTransition();

  const destinationEntries = useMemo(() => {
    const params = row.params ?? {};
    const known = ADDRESS_KEYS.filter(
      (k) => params[k] != null && String(params[k]).trim() !== ""
    ).map((k) => [k, String(params[k])] as const);
    if (known.length > 0) return known;
    return Object.entries(params)
      .filter(([k, v]) => k !== "standing_rule_id" && v != null && typeof v !== "object")
      .map(([k, v]) => [k, String(v)] as const);
  }, [row.params]);

  const postageCents = Number.parseInt(postage, 10) || 0;
  const markup = Math.round((postageCents * settings.forwardMarkupPct) / 100);
  const total = postageCents + markup + settings.forwardHandlingCents;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("requestId", row.id);
    startTransition(async () => {
      const result = await fulfillForward(fd);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Forward recorded — customer notified");
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        <p className="mb-1 flex items-center gap-1.5 font-medium">
          <Send className="size-4" /> Ship to
        </p>
        {destinationEntries.length === 0 ? (
          <p className="text-muted-foreground">No destination on the request.</p>
        ) : (
          <dl className="space-y-0.5">
            {destinationEntries.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-24 shrink-0 capitalize text-muted-foreground">
                  {k.replaceAll("_", " ")}
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Carrier</Label>
          <Select name="carrier" defaultValue="USPS">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["USPS", "UPS", "FedEx", "DHL", "Other"].map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fwd-service">Service</Label>
          <Input id="fwd-service" name="service" placeholder="Priority Mail" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fwd-postage">Postage (cents)</Label>
          <Input
            id="fwd-postage"
            name="postageCents"
            type="number"
            inputMode="numeric"
            min={0}
            required
            value={postage}
            onChange={(e) => setPostage(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fwd-tracking">Tracking number</Label>
          <Input id="fwd-tracking" name="trackingNumber" placeholder="9400 1000 …" />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Customer is billed {formatCents(postageCents)} postage + {formatCents(markup)} markup (
        {settings.forwardMarkupPct}%) + {formatCents(settings.forwardHandlingCents)} handling ={" "}
        <span className="font-medium text-foreground">{formatCents(total)}</span>
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Forward blocked</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? "Recording…" : "Mark shipped & bill customer"}
      </Button>
    </form>
  );
}

function DestroyFlow({ row, onDone }: { row: QueueRow; onDone: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const mode = row.action === "shred" ? "shred" : "recycle";

  function handleConfirm() {
    startTransition(async () => {
      const result = await fulfillDestroy(row.id, mode);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Item ${mode === "shred" ? "shredded" : "recycled"} — customer notified`);
      setConfirmOpen(false);
      onDone();
    });
  }

  return (
    <div className="space-y-4">
      <ConsentBanner row={row} />
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" className="w-full" size="lg">
            {mode === "shred" ? <Flame /> : <Recycle />}
            {mode === "shred" ? "Shred this item" : "Recycle this item"}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === "shred" ? "Confirm shred" : "Confirm recycle"}
            </DialogTitle>
            <DialogDescription>
              This destroys mail — consent is the customer&apos;s request (
              {row.id.slice(0, 8)}). Item {row.barcode ?? ""} cannot be recovered afterwards.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirm} disabled={pending}>
              {pending ? "Working…" : mode === "shred" ? "Shred it" : "Recycle it"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PickupFlow({ row, onDone }: { row: QueueRow; onDone: () => void }) {
  const [pending, startTransition] = useTransition();

  function handleReady() {
    startTransition(async () => {
      const result = await fulfillPickupRequest(row.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Item held at counter — customer notified");
      onDone();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Move the physical item to the pickup shelf, then mark it ready. The customer is
        notified to come in with photo ID. Release happens on the Pickup screen.
      </p>
      <Button className="w-full" size="lg" onClick={handleReady} disabled={pending}>
        <PackageCheck />
        {pending ? "Marking…" : "Mark ready for pickup"}
      </Button>
    </div>
  );
}
