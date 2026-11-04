"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { transitionMailItem } from "@/lib/mail";
import { uploadPrivate } from "@/lib/storage";
import type { MailKind, MailStatus, SubStatus } from "@/lib/types";

const RELEASABLE: MailStatus[] = ["notified", "action_pending", "held_for_pickup"];

export interface PickupItemRow {
  id: string;
  barcode: string | null;
  kind: MailKind;
  sender: string | null;
  status: MailStatus;
}

export interface PickupSearchResult {
  customer: {
    id: string;
    name: string;
    status: SubStatus;
    suspensionReason: string | null;
  };
  pmb: number | null;
  items: PickupItemRow[];
}

export type FindForPickupResult = PickupSearchResult | { error: string };

interface CustomerJoin {
  id: string;
  full_name: string;
  status: SubStatus;
  suspension_reason: string | null;
}

export async function findForPickup(query: string): Promise<FindForPickupResult> {
  const staff = await requireStaff("counter");

  const parsed = z.string().trim().min(1).max(40).safeParse(query);
  if (!parsed.success) return { error: "Enter a barcode or PMB number" };
  const input = parsed.data;

  // User-context reads — RLS scopes everything to this staff member's location.
  const supabase = await createClient();

  if (/^MB-/i.test(input)) {
    const { data } = await supabase
      .from("mail_items")
      .select(
        "id, barcode, kind, sender_name, status, mailbox:mailboxes(pmb_number, customer:customers(id, full_name, status, suspension_reason))"
      )
      .eq("location_id", staff.location_id)
      .eq("barcode", input.toUpperCase())
      .maybeSingle();
    const item = data as unknown as {
      id: string;
      barcode: string | null;
      kind: MailKind;
      sender_name: string | null;
      status: MailStatus;
      mailbox: { pmb_number: number; customer: CustomerJoin | null } | null;
    } | null;
    if (!item) return { error: `No item with barcode ${input.toUpperCase()}` };
    if (!item.mailbox?.customer) return { error: "Item's mailbox has no customer on file" };
    if (!RELEASABLE.includes(item.status)) {
      return { error: `Item ${item.barcode} is not releasable (status: ${item.status.replaceAll("_", " ")})` };
    }
    return {
      customer: {
        id: item.mailbox.customer.id,
        name: item.mailbox.customer.full_name,
        status: item.mailbox.customer.status,
        suspensionReason: item.mailbox.customer.suspension_reason,
      },
      pmb: item.mailbox.pmb_number,
      items: [
        {
          id: item.id,
          barcode: item.barcode,
          kind: item.kind,
          sender: item.sender_name,
          status: item.status,
        },
      ],
    };
  }

  const pmbParse = z.coerce.number().int().positive().safeParse(input);
  if (!pmbParse.success) return { error: "Enter a barcode (MB-…) or a PMB number" };

  const { data: mailboxData } = await supabase
    .from("mailboxes")
    .select("id, pmb_number, customer:customers(id, full_name, status, suspension_reason)")
    .eq("location_id", staff.location_id)
    .eq("pmb_number", pmbParse.data)
    .maybeSingle();
  const mailbox = mailboxData as unknown as {
    id: string;
    pmb_number: number;
    customer: CustomerJoin | null;
  } | null;
  if (!mailbox) return { error: `No mailbox PMB ${pmbParse.data}` };
  if (!mailbox.customer) return { error: `Mailbox PMB ${pmbParse.data} has no customer on file` };

  const { data: itemsData } = await supabase
    .from("mail_items")
    .select("id, barcode, kind, sender_name, status")
    .eq("mailbox_id", mailbox.id)
    .in("status", RELEASABLE)
    .order("received_at", { ascending: true });

  return {
    customer: {
      id: mailbox.customer.id,
      name: mailbox.customer.full_name,
      status: mailbox.customer.status,
      suspensionReason: mailbox.customer.suspension_reason,
    },
    pmb: mailbox.pmb_number,
    items: ((itemsData ?? []) as {
      id: string;
      barcode: string | null;
      kind: MailKind;
      sender_name: string | null;
      status: MailStatus;
    }[]).map((i) => ({
      id: i.id,
      barcode: i.barcode,
      kind: i.kind,
      sender: i.sender_name,
      status: i.status,
    })),
  };
}

const completeSchema = z.object({
  itemIds: z.array(z.uuid()).min(1, "Select at least one item").max(100),
  idType: z.enum(["drivers_license", "passport", "state_id", "military_id", "other_photo_id"]),
  signatureDataUrl: z
    .string()
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "Signature is required"),
});

export type CompletePickupResult =
  | { released: number; customerName: string }
  | { error: string };

export async function completePickup(input: {
  itemIds: string[];
  idType: string;
  signatureDataUrl: string;
}): Promise<CompletePickupResult> {
  const staff = await requireStaff("counter");

  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid pickup data" };
  }
  const { itemIds, idType, signatureDataUrl } = parsed.data;

  const base64 = signatureDataUrl.slice("data:image/png;base64,".length);
  const signature = Buffer.from(base64, "base64");
  if (signature.byteLength === 0) return { error: "Signature is required" };
  if (signature.byteLength > 2 * 1024 * 1024) {
    return { error: "Signature image is too large (max 2MB)" };
  }

  // Admin read: verify every item belongs to this staff member's location
  // before any release write.
  const admin = createAdminClient();
  const { data: itemsData } = await admin
    .from("mail_items")
    .select(
      "id, status, barcode, location_id, mailbox_id, mailbox:mailboxes(customer:customers(id, full_name))"
    )
    .in("id", itemIds);
  const items = (itemsData ?? []) as unknown as {
    id: string;
    status: MailStatus;
    barcode: string | null;
    location_id: string;
    mailbox_id: string;
    mailbox: { customer: { id: string; full_name: string } | null } | null;
  }[];
  if (items.length !== itemIds.length) return { error: "Some items could not be found" };
  for (const item of items) {
    if (item.location_id !== staff.location_id) {
      return { error: "An item belongs to another location" };
    }
    if (!RELEASABLE.includes(item.status)) {
      return {
        error: `Item ${item.barcode ?? item.id} is not releasable (status: ${item.status.replaceAll("_", " ")})`,
      };
    }
  }

  // Storage is server-mediated (private signatures bucket) → admin client.
  const signaturePath = `${staff.location_id}/${items[0].mailbox_id}/${crypto.randomUUID()}.png`;
  try {
    await uploadPrivate(admin, "signatures", signaturePath, signature, "image/png");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Signature upload failed" };
  }

  const supabase = await createClient();
  let released = 0;
  for (const item of items) {
    // USER-context insert FIRST: the suspension gate trigger runs here and
    // blocks the release of mail for suspended/canceled customers.
    const { error: logErr } = await supabase.from("pickup_logs").insert({
      mail_item_id: item.id,
      verified_id_type: idType,
      staff_id: staff.id,
      signature_path: signaturePath,
    });
    if (logErr) {
      return {
        error: logErr.message.includes("PAYMENT REQUIRED")
          ? logErr.message
          : `Pickup blocked: ${logErr.message}`,
      };
    }

    // Admin client: mail pipeline transitions are server-mediated.
    try {
      if (item.status === "notified" || item.status === "action_pending") {
        await transitionMailItem(admin, {
          itemId: item.id,
          to: "held_for_pickup",
          eventType: "held_for_pickup",
          actorType: "staff",
          actorId: staff.id,
        });
      }
      await transitionMailItem(admin, {
        itemId: item.id,
        to: "picked_up",
        eventType: "picked_up",
        actorType: "staff",
        actorId: staff.id,
        metadata: { verified_id_type: idType },
      });
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : `Release failed for ${item.barcode ?? item.id}`,
      };
    }
    released++;
  }

  // Fulfill any open pickup requests for the released items (user context).
  await supabase
    .from("action_requests")
    .update({
      status: "fulfilled",
      fulfilled_by: staff.id,
      fulfilled_at: new Date().toISOString(),
    })
    .in("mail_item_id", itemIds)
    .eq("action", "pickup")
    .in("status", ["requested", "in_progress"]);

  revalidatePath("/staff/pickup");
  revalidatePath("/staff/queue");
  revalidatePath("/staff");
  return {
    released,
    customerName: items[0].mailbox?.customer?.full_name ?? "customer",
  };
}
