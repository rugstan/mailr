"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { defaultSettings, intakeCheckIn, transitionMailItem } from "@/lib/mail";
import { uploadPrivate } from "@/lib/storage";
import type {
  LocationSettings,
  MailboxStatus,
  RecipientStatus,
  SubStatus,
} from "@/lib/types";

export interface IntakeRecipient {
  id: string;
  fullName: string;
  status: RecipientStatus;
  idExpiresOn: string | null;
}

export interface MailboxLookup {
  mailboxId: string;
  pmb: number;
  mailboxStatus: MailboxStatus;
  customerName: string | null;
  customerStatus: SubStatus | null;
  recipients: IntakeRecipient[];
}

export type LookupResult = { mailbox: MailboxLookup } | { error: string };

const pmbSchema = z.coerce.number().int().positive();

export async function lookupMailbox(pmbInput: string): Promise<LookupResult> {
  const staff = await requireStaff("counter");

  const parsed = pmbSchema.safeParse(String(pmbInput ?? "").trim());
  if (!parsed.success) return { error: "Enter a PMB number" };
  const pmb = parsed.data;

  // User-context read: staff RLS allows location-scoped mailbox/customer/recipient reads.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mailboxes")
    .select(
      "id, pmb_number, status, customer:customers(id, full_name, status), recipients(id, full_name, status, id_expires_on)"
    )
    .eq("location_id", staff.location_id)
    .eq("pmb_number", pmb)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: `No mailbox PMB ${pmb}` };

  const row = data as unknown as {
    id: string;
    pmb_number: number;
    status: MailboxStatus;
    customer: { id: string; full_name: string; status: SubStatus } | null;
    recipients: {
      id: string;
      full_name: string;
      status: RecipientStatus;
      id_expires_on: string | null;
    }[];
  };

  return {
    mailbox: {
      mailboxId: row.id,
      pmb: row.pmb_number,
      mailboxStatus: row.status,
      customerName: row.customer?.full_name ?? null,
      customerStatus: row.customer?.status ?? null,
      recipients: (row.recipients ?? []).map((r) => ({
        id: r.id,
        fullName: r.full_name,
        status: r.status,
        idExpiresOn: r.id_expires_on,
      })),
    },
  };
}

const checkInSchema = z.object({
  mailboxId: z.uuid(),
  recipientId: z.uuid(),
  kind: z.enum(["letter", "large_envelope", "package"]),
  sender: z.string().trim().max(200),
  carrier: z.enum(["USPS", "UPS", "FedEx", "Amazon", "DHL", "Other"]),
  category: z.enum([
    "bill",
    "government",
    "legal",
    "financial",
    "check",
    "personal",
    "marketing",
    "package_contents",
    "unknown",
  ]),
  weightOz: z.coerce.number().positive().max(40000).optional(),
});

export interface CheckInSuccess {
  barcode: string;
  itemId: string;
  recipientName: string;
  pmb: number;
}

export type CheckInResult = CheckInSuccess | { error: string };

export async function checkInItem(formData: FormData): Promise<CheckInResult> {
  const staff = await requireStaff("counter");

  const parsed = checkInSchema.safeParse({
    mailboxId: formData.get("mailboxId"),
    recipientId: formData.get("recipientId"),
    kind: formData.get("kind"),
    sender: formData.get("sender") ?? "",
    carrier: formData.get("carrier"),
    category: formData.get("category"),
    weightOz: formData.get("weightOz") || undefined,
  });
  if (!parsed.success) return { error: "Invalid intake data — check the form fields" };
  const input = parsed.data;
  if (input.kind === "package" && input.weightOz == null) {
    return { error: "Weight (oz) is required for packages" };
  }

  // Authz: the mailbox must be at this staff member's location, and the
  // recipient must belong to that mailbox (user-context reads, RLS-scoped).
  const supabase = await createClient();
  const { data: mailbox } = await supabase
    .from("mailboxes")
    .select("id, pmb_number, location_id")
    .eq("id", input.mailboxId)
    .eq("location_id", staff.location_id)
    .maybeSingle();
  if (!mailbox) return { error: "Mailbox not found at your location" };

  const { data: recipient } = await supabase
    .from("recipients")
    .select("id, full_name")
    .eq("id", input.recipientId)
    .eq("mailbox_id", input.mailboxId)
    .maybeSingle();
  if (!recipient) return { error: "Recipient does not belong to this mailbox" };

  const { data: locationRow } = await supabase
    .from("locations")
    .select("settings")
    .eq("id", staff.location_id)
    .single();
  const settings = defaultSettings((locationRow?.settings ?? null) as LocationSettings | null);

  // Admin client: storage is server-mediated and the mail pipeline writes
  // (barcode RPC + status transitions) run with the service role.
  const admin = createAdminClient();

  const photoPaths: string[] = [];
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (!photo.type.startsWith("image/")) return { error: "Exterior photo must be an image" };
    if (photo.size > 10 * 1024 * 1024) return { error: "Exterior photo must be 10MB or less" };
    const ext = photo.type.split("/")[1]?.split("+")[0] || "jpg";
    const path = `${staff.location_id}/${mailbox.id}/${crypto.randomUUID()}.${ext}`;
    try {
      await uploadPrivate(admin, "mail-photos", path, await photo.arrayBuffer(), photo.type);
      photoPaths.push(path);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Photo upload failed" };
    }
  }

  try {
    const result = await intakeCheckIn(admin, {
      locationId: staff.location_id,
      staffId: staff.id,
      mailboxId: mailbox.id,
      pmbNumber: mailbox.pmb_number,
      recipientId: recipient.id,
      kind: input.kind,
      senderName: input.sender || null,
      carrier: input.carrier,
      weightOz: input.kind === "package" ? input.weightOz : null,
      category: input.category,
      photoPaths,
      freeStorageDays: settings.free_storage_days,
    });
    revalidatePath("/staff");
    return {
      barcode: result.barcode,
      itemId: result.item.id,
      recipientName: recipient.full_name,
      pmb: mailbox.pmb_number,
    };
  } catch (err) {
    // COMPLIANCE: trigger messages are returned verbatim so staff see the exact rule.
    return { error: err instanceof Error ? err.message : "Check-in failed" };
  }
}

const rtsSchema = z.object({
  mailboxId: z.uuid(),
  kind: z.enum(["letter", "large_envelope", "package"]),
  sender: z.string().trim().max(200),
  reason: z.string().trim().min(3, "Give a short reason").max(500),
});

export type ReturnToSenderResult = { ok: true } | { error: string };

export async function returnToSender(formData: FormData): Promise<ReturnToSenderResult> {
  const staff = await requireStaff("counter");

  const parsed = rtsSchema.safeParse({
    mailboxId: formData.get("mailboxId"),
    kind: formData.get("kind"),
    sender: formData.get("sender") ?? "",
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const input = parsed.data;

  const supabase = await createClient();
  const { data: mailbox } = await supabase
    .from("mailboxes")
    .select("id")
    .eq("id", input.mailboxId)
    .eq("location_id", staff.location_id)
    .maybeSingle();
  if (!mailbox) return { error: "Mailbox not found at your location" };

  // Admin client: mail pipeline writes (item insert + audited transitions).
  const admin = createAdminClient();
  const { data: item, error: insErr } = await admin
    .from("mail_items")
    .insert({
      location_id: staff.location_id,
      mailbox_id: mailbox.id,
      kind: input.kind,
      status: "received",
      sender_name: input.sender || null,
    })
    .select("id")
    .single();
  if (insErr || !item) return { error: insErr?.message ?? "Could not record the item" };

  try {
    await transitionMailItem(admin, {
      itemId: item.id,
      to: "checked_in",
      eventType: "checked_in",
      actorType: "staff",
      actorId: staff.id,
    });
    await transitionMailItem(admin, {
      itemId: item.id,
      to: "returned_to_sender",
      eventType: "returned_to_sender",
      actorType: "staff",
      actorId: staff.id,
      metadata: { reason: input.reason },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Return to sender failed" };
  }

  revalidatePath("/staff");
  return { ok: true };
}
