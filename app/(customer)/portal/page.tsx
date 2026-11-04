import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { FileText, Inbox, Mail, Package, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryBadge, MailStatusBadge } from "@/components/status-badge";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedUrl } from "@/lib/storage";
import type { MailCategory, MailItem, MailKind, MailStatus } from "@/lib/types";
import { InboxFilters } from "./inbox-filters";

export const metadata: Metadata = { title: "Inbox" };

const MAIL_STATUSES = [
  "received", "checked_in", "notified", "action_pending", "opening", "scanned",
  "held_for_pickup", "out_for_forward", "forwarded", "shredded", "recycled",
  "picked_up", "archived", "returned_to_sender",
] as const;

const MAIL_CATEGORIES = [
  "bill", "government", "legal", "financial", "check", "personal", "marketing",
  "package_contents", "unknown",
] as const;

const KIND_ICONS: Record<MailKind, typeof Mail> = {
  letter: Mail,
  large_envelope: FileText,
  package: Package,
};

function KindFallback({ kind }: { kind: MailKind }) {
  const Icon = KIND_ICONS[kind] ?? Mail;
  return (
    <div className="flex h-16 w-12 items-center justify-center rounded border bg-muted">
      <Icon className="size-5 text-muted-foreground" />
    </div>
  );
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const status = MAIL_STATUSES.includes(sp.status as (typeof MAIL_STATUSES)[number])
    ? (sp.status as MailStatus)
    : undefined;
  const category = MAIL_CATEGORIES.includes(sp.category as (typeof MAIL_CATEGORIES)[number])
    ? (sp.category as MailCategory)
    : undefined;

  await requireCustomer();
  const supabase = await createClient();

  // RLS scopes this to the customer's own mailboxes.
  let query = supabase.from("mail_items").select("*").order("received_at", { ascending: false }).limit(100);
  if (status) query = query.eq("status", status);
  if (category) query = query.eq("category", category);
  const { data: itemRows } = await query;
  const items = (itemRows ?? []) as MailItem[];

  // Thumbnails: 60s signed URLs. Admin client justified — the items above were
  // returned by the RLS-scoped read (ownership proven); buckets are private.
  const thumbs = new Map<string, string>();
  if (items.some((i) => i.exterior_photos.length > 0)) {
    try {
      const admin = createAdminClient();
      for (const item of items) {
        if (item.exterior_photos.length > 0) {
          const url = await signedUrl(admin, "mail-photos", item.exterior_photos[0], 60);
          if (url) thumbs.set(item.id, url);
        }
      }
    } catch (err) {
      console.error("thumbnail signing failed", err);
    }
  }

  const filtered = Boolean(status || category);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Inbox</h1>
          <p className="text-muted-foreground">Everything that has arrived in your mailbox.</p>
        </div>
        <InboxFilters status={status} category={category} statuses={MAIL_STATUSES} categories={MAIL_CATEGORIES} />
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            {filtered ? (
              <>
                <Inbox className="size-10 text-muted-foreground" />
                <h2 className="font-semibold">No mail matches these filters</h2>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Try clearing the filters to see everything in your mailbox.
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/portal">Clear filters</Link>
                </Button>
              </>
            ) : (
              <>
                <SlidersHorizontal className="size-10 text-muted-foreground" />
                <h2 className="font-semibold">Your mailbox is empty — for now</h2>
                <p className="max-w-md text-sm text-muted-foreground">
                  While you wait for your first item, set up standing rules so your mail handles itself: shred
                  marketing automatically, open &amp; scan every bill, and more.
                </p>
                <Button asChild size="sm">
                  <Link href="/portal/rules">Create a standing rule</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden py-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Item</TableHead>
                  <TableHead>Sender</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} className="relative">
                    <TableCell className="py-2">
                      <Link href={`/portal/item/${item.id}`} className="absolute inset-0" aria-label="View item" />
                      {thumbs.has(item.id) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbs.get(item.id)}
                          alt="Mail exterior"
                          className="h-16 w-12 rounded border object-cover"
                        />
                      ) : (
                        <KindFallback kind={item.kind} />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {item.sender_name ?? "Unknown sender"}
                      {item.urgency >= 3 ? <Badge variant="destructive" className="ml-2">URGENT</Badge> : null}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {item.kind.replaceAll("_", " ")}
                    </TableCell>
                    <TableCell>
                      <CategoryBadge category={item.category} />
                    </TableCell>
                    <TableCell>
                      <MailStatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {format(new Date(item.received_at), "MMM d")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {items.map((item) => (
              <Link key={item.id} href={`/portal/item/${item.id}`} className="block">
                <Card className="py-3 transition-colors hover:bg-accent/50">
                  <CardContent className="flex items-center gap-3 px-3">
                    {thumbs.has(item.id) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbs.get(item.id)}
                        alt="Mail exterior"
                        className="h-16 w-12 shrink-0 rounded border object-cover"
                      />
                    ) : (
                      <KindFallback kind={item.kind} />
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate font-medium">
                        {item.sender_name ?? "Unknown sender"}
                        {item.urgency >= 3 ? (
                          <Badge variant="destructive" className="ml-2">URGENT</Badge>
                        ) : null}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <CategoryBadge category={item.category} />
                        <MailStatusBadge status={item.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(item.received_at), "MMM d")} · {item.kind.replaceAll("_", " ")}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
