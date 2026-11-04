import { headers } from "next/headers";
import { getStaff } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ratelimit";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_RANK } from "@/lib/types";
import { buildCrdCsv, currentQuarter, type CrdRow } from "../crd";

interface ExportRecipient {
  id: string;
  full_name: string;
  business_name: string | null;
  status: string;
  id_verified_at: string | null;
  id_expires_on: string | null;
  mailbox: { pmb_number: number; location_id: string } | null;
  customer: { full_name: string; email: string } | null;
}

export async function GET(): Promise<Response> {
  // This GET has a side effect (crd_exports audit row), so refuse cross-site
  // invocations — a hostile page embedding this URL must not fire an export
  // from a logged-in manager's browser. Same-origin navigations/fetches send
  // "same-origin" or "none"; non-browser clients omit the header entirely.
  const secFetchSite = (await headers()).get("sec-fetch-site");
  if (secFetchSite === "cross-site") {
    return Response.json({ error: "Cross-site requests are not allowed" }, { status: 403 });
  }

  // Manual staff check — this is a route handler, not a server action.
  const staff = await getStaff();
  if (!staff || ROLE_RANK[staff.role] < ROLE_RANK.manager) {
    return Response.json({ error: "Forbidden: manager role required" }, { status: 403 });
  }

  // Compliance exports are rare; throttle per staff account (fail-closed).
  if (!(await checkRateLimit(`crdexport:${staff.id}`, 10, 3600, true))) {
    return Response.json({ error: "Too many export requests — try again later" }, { status: 429 });
  }

  // Admin client: the CRD export is a cross-customer compliance read for the
  // manager's own location (authz checked above).
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("recipients")
    .select(
      "id, full_name, business_name, status, id_verified_at, id_expires_on, mailbox:mailboxes!inner(pmb_number, location_id), customer:customers(full_name, email)"
    )
    .eq("mailbox.location_id", staff.location_id)
    .order("created_at", { ascending: true });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  const recipients = (data ?? []) as unknown as ExportRecipient[];

  const ids = recipients.map((r) => r.id);
  const formsById = new Map<string, { signed_at: string | null; terminated_at: string | null }>();
  if (ids.length > 0) {
    const { data: forms } = await admin
      .from("form_1583_records")
      .select("recipient_id, signed_at, terminated_at")
      .in("recipient_id", ids);
    for (const f of (forms ?? []) as {
      recipient_id: string;
      signed_at: string | null;
      terminated_at: string | null;
    }[]) {
      formsById.set(f.recipient_id, { signed_at: f.signed_at, terminated_at: f.terminated_at });
    }
  }

  const rows: CrdRow[] = recipients.map((r) => {
    const form = formsById.get(r.id);
    return {
      pmb: r.mailbox?.pmb_number ?? null,
      recipient_name: r.full_name,
      business_name: r.business_name,
      customer_name: r.customer?.full_name ?? null,
      customer_email: r.customer?.email ?? null,
      recipient_status: r.status,
      id_verified_at: r.id_verified_at,
      id_expires_on: r.id_expires_on,
      form_1583_signed_at: form?.signed_at ?? null,
      form_1583_terminated_at: form?.terminated_at ?? null,
    };
  });

  const quarter = currentQuarter(new Date());
  await admin.from("crd_exports").insert({
    location_id: staff.location_id,
    quarter,
  });

  return new Response(buildCrdCsv(rows), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="crd-${quarter}.csv"`,
    },
  });
}
