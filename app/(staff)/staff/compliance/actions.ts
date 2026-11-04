"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { notifyCustomer } from "@/lib/notify";
import { uploadPrivate } from "@/lib/storage";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ComplianceResult = { success: true } | { error: string };

const MAX_DOC_BYTES = 10 * 1024 * 1024;

function isAllowedDoc(file: File): boolean {
  return file.type === "application/pdf" || file.type.startsWith("image/");
}

function extFor(file: File): string {
  if (file.type === "application/pdf") return "pdf";
  const sub = file.type.split("/")[1]?.split("+")[0];
  return sub || "bin";
}

async function uploadComplianceDoc(
  admin: SupabaseClient,
  locationId: string,
  recipientId: string,
  file: File
): Promise<string> {
  const path = `${locationId}/${recipientId}/${crypto.randomUUID()}.${extFor(file)}`;
  await uploadPrivate(admin, "compliance", path, await file.arrayBuffer(), file.type);
  return path;
}

const verifySchema = z.object({
  recipientId: z.uuid(),
  doc1Type: z.enum(["drivers_license", "passport", "state_id", "other"]),
  doc2Type: z.enum(["utility_bill", "lease", "insurance_policy", "vehicle_registration", "other"]),
  idExpiresOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the photo ID expiration date"),
});

export async function verifyRecipient(formData: FormData): Promise<ComplianceResult> {
  const staff = await requireStaff("manager");

  const parsed = verifySchema.safeParse({
    recipientId: formData.get("recipientId"),
    doc1Type: formData.get("doc1Type"),
    doc2Type: formData.get("doc2Type"),
    idExpiresOn: formData.get("idExpiresOn"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const input = parsed.data;

  if (input.idExpiresOn < new Date().toISOString().slice(0, 10)) {
    return { error: "Photo ID is already expired — it cannot be accepted" };
  }

  const doc1 = formData.get("doc1");
  const doc2 = formData.get("doc2");
  if (!(doc1 instanceof File) || doc1.size === 0) return { error: "Attach ID document 1" };
  if (!(doc2 instanceof File) || doc2.size === 0) return { error: "Attach ID document 2" };
  for (const [label, file] of [
    ["ID document 1", doc1],
    ["ID document 2", doc2],
  ] as const) {
    if (!isAllowedDoc(file)) return { error: `${label} must be an image or PDF` };
    if (file.size > MAX_DOC_BYTES) return { error: `${label} must be 10MB or less` };
  }
  const form1583 = formData.get("form1583");
  if (form1583 instanceof File && form1583.size > 0) {
    if (form1583.type !== "application/pdf") return { error: "Form 1583 must be a PDF" };
    if (form1583.size > MAX_DOC_BYTES) return { error: "Form 1583 must be 10MB or less" };
  }

  // Admin read with join: confirm the recipient's mailbox is at this manager's location.
  const admin = createAdminClient();
  const { data: recipientData } = await admin
    .from("recipients")
    .select("id, full_name, customer_id, mailbox:mailboxes(id, location_id)")
    .eq("id", input.recipientId)
    .maybeSingle();
  const recipient = recipientData as unknown as {
    id: string;
    full_name: string;
    customer_id: string;
    mailbox: { id: string; location_id: string } | null;
  } | null;
  if (!recipient || recipient.mailbox?.location_id !== staff.location_id) {
    return { error: "Recipient not found at your location" };
  }

  try {
    const path1 = await uploadComplianceDoc(admin, staff.location_id, recipient.id, doc1);
    const path2 = await uploadComplianceDoc(admin, staff.location_id, recipient.id, doc2);
    let pdfPath: string | null = null;
    if (form1583 instanceof File && form1583.size > 0) {
      pdfPath = await uploadComplianceDoc(admin, staff.location_id, recipient.id, form1583);
    }

    // Admin writes: ID documents and 1583 records are written server-side only.
    const { error: docsErr } = await admin.from("id_documents").insert([
      {
        recipient_id: recipient.id,
        doc_type: input.doc1Type,
        storage_path: path1,
        expires_on: input.idExpiresOn,
      },
      {
        recipient_id: recipient.id,
        doc_type: input.doc2Type,
        storage_path: path2,
      },
    ]);
    if (docsErr) throw new Error(docsErr.message);

    const record: Record<string, unknown> = {
      recipient_id: recipient.id,
      verification_method: "in_person_witness",
      witness_staff_id: staff.id,
      signed_at: new Date().toISOString(),
    };
    if (pdfPath) record.pdf_path = pdfPath;
    const { error: f1583Err } = await admin
      .from("form_1583_records")
      .upsert(record, { onConflict: "recipient_id" });
    if (f1583Err) throw new Error(f1583Err.message);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Verification failed" };
  }

  // User-context update — the manager RLS policy allows recipient updates.
  const supabase = await createClient();
  const { error: updErr } = await supabase
    .from("recipients")
    .update({
      status: "verified",
      id_verified_at: new Date().toISOString(),
      id_expires_on: input.idExpiresOn,
    })
    .eq("id", recipient.id);
  if (updErr) return { error: updErr.message };

  revalidatePath("/staff/compliance");
  revalidatePath("/staff");
  return { success: true };
}

const rejectSchema = z.object({
  recipientId: z.uuid(),
  reason: z.string().trim().min(3, "Give a short reason").max(500),
});

export async function rejectRecipient(input: {
  recipientId: string;
  reason: string;
}): Promise<ComplianceResult> {
  const staff = await requireStaff("manager");

  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  // User-context read (RLS-scoped) + explicit location check via the mailbox join.
  const supabase = await createClient();
  const { data: recipientData } = await supabase
    .from("recipients")
    .select("id, full_name, customer_id, mailbox:mailboxes(location_id)")
    .eq("id", parsed.data.recipientId)
    .maybeSingle();
  const recipient = recipientData as unknown as {
    id: string;
    full_name: string;
    customer_id: string;
    mailbox: { location_id: string } | null;
  } | null;
  if (!recipient || recipient.mailbox?.location_id !== staff.location_id) {
    return { error: "Recipient not found at your location" };
  }

  const { error: updErr } = await supabase
    .from("recipients")
    .update({ status: "rejected" })
    .eq("id", recipient.id);
  if (updErr) return { error: updErr.message };

  // Admin client: notifications are recorded server-side.
  const admin = createAdminClient();
  await notifyCustomer(admin, {
    customerId: recipient.customer_id,
    template: "recipient_rejected",
    subject: `Recipient verification rejected — ${recipient.full_name}`,
    body: `We could not verify ${recipient.full_name} for USPS Form 1583: ${parsed.data.reason}. Mail cannot be accepted for this recipient. Please visit the store with two acceptable IDs to try again.`,
  });

  revalidatePath("/staff/compliance");
  return { success: true };
}
