import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ActionStatus, MailCategory, MailStatus, RecipientStatus, SubStatus } from "@/lib/types";

const MAIL_STATUS_STYLES: Record<MailStatus, string> = {
  received: "bg-slate-100 text-slate-700",
  checked_in: "bg-blue-100 text-blue-700",
  notified: "bg-blue-100 text-blue-700",
  action_pending: "bg-amber-100 text-amber-800",
  opening: "bg-violet-100 text-violet-700",
  scanned: "bg-emerald-100 text-emerald-700",
  held_for_pickup: "bg-cyan-100 text-cyan-700",
  out_for_forward: "bg-indigo-100 text-indigo-700",
  forwarded: "bg-emerald-100 text-emerald-700",
  shredded: "bg-zinc-200 text-zinc-600",
  recycled: "bg-zinc-200 text-zinc-600",
  picked_up: "bg-emerald-100 text-emerald-700",
  archived: "bg-zinc-100 text-zinc-500",
  returned_to_sender: "bg-red-100 text-red-700",
};

const SUB_STATUS_STYLES: Record<SubStatus, string> = {
  trialing: "bg-blue-100 text-blue-700",
  active: "bg-emerald-100 text-emerald-700",
  past_due: "bg-amber-100 text-amber-800",
  suspended: "bg-red-100 text-red-700",
  canceled: "bg-zinc-200 text-zinc-600",
};

const RECIPIENT_STATUS_STYLES: Record<RecipientStatus, string> = {
  pending_id: "bg-amber-100 text-amber-800",
  pending_1583: "bg-amber-100 text-amber-800",
  verified: "bg-emerald-100 text-emerald-700",
  expired: "bg-red-100 text-red-700",
  rejected: "bg-red-100 text-red-700",
};

const ACTION_STATUS_STYLES: Record<ActionStatus, string> = {
  requested: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-700",
  fulfilled: "bg-emerald-100 text-emerald-700",
  canceled: "bg-zinc-200 text-zinc-600",
  failed: "bg-red-100 text-red-700",
};

const CATEGORY_STYLES: Partial<Record<MailCategory, string>> = {
  government: "bg-red-100 text-red-700",
  legal: "bg-violet-100 text-violet-700",
  bill: "bg-amber-100 text-amber-800",
  financial: "bg-blue-100 text-blue-700",
  check: "bg-emerald-100 text-emerald-700",
  marketing: "bg-zinc-100 text-zinc-500",
};

function pretty(value: string): string {
  return value.replaceAll("_", " ");
}

export function MailStatusBadge({ status }: { status: MailStatus }) {
  return <Badge className={cn("capitalize", MAIL_STATUS_STYLES[status])}>{pretty(status)}</Badge>;
}

export function SubStatusBadge({ status }: { status: SubStatus }) {
  return <Badge className={cn("capitalize", SUB_STATUS_STYLES[status])}>{pretty(status)}</Badge>;
}

export function RecipientStatusBadge({ status }: { status: RecipientStatus }) {
  return (
    <Badge className={cn("capitalize", RECIPIENT_STATUS_STYLES[status])}>{pretty(status)}</Badge>
  );
}

export function ActionStatusBadge({ status }: { status: ActionStatus }) {
  return <Badge className={cn("capitalize", ACTION_STATUS_STYLES[status])}>{pretty(status)}</Badge>;
}

export function CategoryBadge({ category }: { category: MailCategory }) {
  return (
    <Badge variant="outline" className={cn("capitalize", CATEGORY_STYLES[category])}>
      {pretty(category)}
    </Badge>
  );
}
