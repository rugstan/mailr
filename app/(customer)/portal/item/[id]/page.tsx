import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { z } from "zod";
import { ExternalLink, FileText, History, Mail, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBadge, MailStatusBadge } from "@/components/status-badge";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedUrl, signedUrls } from "@/lib/storage";
import { formatCents } from "@/lib/money";
import type { ActionRequest, MailEvent, MailItem, MailKind, ScanDocument } from "@/lib/types";
import { ActionPanel, type PanelRequest } from "./action-panel";

export const metadata: Metadata = { title: "Mail item" };

interface Extraction {
  summary_one_line?: string;
  payee?: string;
  amount_cents?: number;
  due_date?: string;
  doc_type?: string;
}

const KIND_ICONS: Record<MailKind, typeof Mail> = {
  letter: Mail,
  large_envelope: FileText,
  package: Package,
};

function humanizeEvent(eventType: string): string {
  const text = eventType.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default async function MailItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  await requireCustomer();
  const supabase = await createClient();

  // RLS-scoped read proves ownership; anything else 404s.
  const { data: itemRow } = await supabase.from("mail_items").select("*").eq("id", id).maybeSingle();
  if (!itemRow) notFound();
  const item = itemRow as MailItem;

  const [{ data: scanRow }, { data: requestRows }, { data: eventRows }] = await Promise.all([
    supabase.from("scan_documents").select("*").eq("mail_item_id", id).maybeSingle(),
    supabase
      .from("action_requests")
      .select("*")
      .eq("mail_item_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("mail_events").select("*").eq("mail_item_id", id).order("created_at", { ascending: true }),
  ]);

  const scan = scanRow as ScanDocument | null;
  const requests = (requestRows ?? []) as ActionRequest[];
  const events = (eventRows ?? []) as MailEvent[];
  const open = requests.find((r) => r.status === "requested" || r.status === "in_progress") ?? null;
  const openRequest: PanelRequest | null = open
    ? { id: open.id, action: open.action, status: open.status, rush: open.rush, sla_due_at: open.sla_due_at }
    : null;

  // Signed URLs (60s). Admin client justified — ownership proven by the
  // RLS-scoped reads above; storage buckets are private by design.
  let photoUrls: string[] = [];
  let scanUrl: string | null = null;
  if (item.exterior_photos.length > 0 || scan) {
    try {
      const admin = createAdminClient();
      if (item.exterior_photos.length > 0) {
        photoUrls = await signedUrls(admin, "mail-photos", item.exterior_photos, 60);
      }
      if (scan) {
        scanUrl = await signedUrl(admin, "scans", scan.pdf_path, 60);
      }
    } catch (err) {
      console.error("signed url generation failed", err);
    }
  }

  const extraction = (scan?.ai_extraction ?? null) as Extraction | null;
  const KindIcon = KIND_ICONS[item.kind] ?? Mail;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Back to inbox
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{item.sender_name ?? "Unknown sender"}</h1>
          {item.urgency >= 3 ? <Badge variant="destructive">URGENT</Badge> : null}
          <CategoryBadge category={item.category} />
          <MailStatusBadge status={item.status} />
        </div>
        <p className="mt-1 text-muted-foreground">
          {item.kind.replaceAll("_", " ")} · received {format(new Date(item.received_at), "MMMM d, yyyy")}
          {item.barcode ? ` · ${item.barcode}` : ""}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          {/* Photos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Exterior photos</CardTitle>
            </CardHeader>
            <CardContent>
              {photoUrls.length > 0 ? (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {photoUrls.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt={`Exterior photo ${i + 1}`}
                      className="h-56 w-auto shrink-0 rounded-lg border object-cover"
                    />
                  ))}
                </div>
              ) : (
                <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground">
                  <KindIcon className="size-8" />
                  <p className="text-sm">No photos available</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scan */}
          {scan ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Scanned contents</CardTitle>
                {scan.page_count ? (
                  <CardDescription>
                    {scan.page_count} page{scan.page_count === 1 ? "" : "s"}
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                {extraction?.summary_one_line ? (
                  <p className="rounded-md bg-muted/60 p-3 text-sm">{extraction.summary_one_line}</p>
                ) : null}
                {extraction && (extraction.payee || extraction.amount_cents != null || extraction.due_date || extraction.doc_type) ? (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                    {extraction.payee ? (
                      <div>
                        <dt className="text-muted-foreground">Payee</dt>
                        <dd className="font-medium">{extraction.payee}</dd>
                      </div>
                    ) : null}
                    {extraction.amount_cents != null ? (
                      <div>
                        <dt className="text-muted-foreground">Amount</dt>
                        <dd className="font-medium">{formatCents(extraction.amount_cents)}</dd>
                      </div>
                    ) : null}
                    {extraction.due_date ? (
                      <div>
                        <dt className="text-muted-foreground">Due date</dt>
                        <dd className="font-medium">{format(new Date(extraction.due_date), "MMM d, yyyy")}</dd>
                      </div>
                    ) : null}
                    {extraction.doc_type ? (
                      <div>
                        <dt className="text-muted-foreground">Document</dt>
                        <dd className="font-medium capitalize">{extraction.doc_type.replaceAll("_", " ")}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
                {scanUrl ? (
                  <Button asChild>
                    <a href={scanUrl} target="_blank" rel="noreferrer">
                      <ExternalLink />
                      View scanned PDF
                    </a>
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">Scan link unavailable — refresh to try again.</p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Action panel */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
              <CardDescription>Tell us what to do with this item.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionPanel itemId={item.id} status={item.status} openRequest={openRequest} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" />
            Timeline
          </CardTitle>
          <CardDescription>The audit trail for this item — every step, permanently recorded.</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events recorded yet.</p>
          ) : (
            <ol className="relative space-y-5 border-l pl-5">
              {events.map((event) => (
                <li key={event.id} className="relative">
                  <span className="absolute -left-[26px] top-1.5 size-2.5 rounded-full border-2 border-background bg-brand" />
                  <p className="text-sm font-medium">{humanizeEvent(event.event_type)}</p>
                  <p className="text-xs text-muted-foreground">
                    by {event.actor_type} · {format(new Date(event.created_at), "MMM d, h:mm a")}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
