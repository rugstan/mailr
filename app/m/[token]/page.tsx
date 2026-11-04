import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/ratelimit";
import { signedUrl } from "@/lib/storage";
import type { BoxRental, BoxScan } from "@/lib/types";
import { RenterMailView, type RenterScan } from "./renter-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your mailbox", robots: { index: false, follow: false } };

const TOKEN_RE = /^[0-9a-f-]{36}$/i;

export default async function RenterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();

  // Unauthenticated bearer-token page: throttle lookups and signed-URL minting
  // per IP before touching the database (fail-closed, like the action path).
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`renterview:${ip}`, 120, 900, true))) {
    return (
      <main className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">
        Too many requests — please try again in a few minutes.
      </main>
    );
  }

  const admin = createAdminClient();
  const { data: boxRow } = await admin
    .from("box_rentals")
    .select("id, location_id, box_number, renter_first, renter_last, business_name")
    .eq("view_token", token)
    .maybeSingle();
  const box = boxRow as Pick<
    BoxRental,
    "id" | "location_id" | "box_number" | "renter_first" | "renter_last" | "business_name"
  > | null;
  if (!box) notFound();

  const [{ data: locRow }, { data: scanRows }] = await Promise.all([
    admin.from("locations").select("name, street_address, city, state, zip").eq("id", box.location_id).maybeSingle(),
    admin.from("box_scans").select("*").eq("box_rental_id", box.id).order("scanned_at", { ascending: false }),
  ]);
  const location = locRow as { name: string; street_address: string; city: string; state: string; zip: string } | null;
  const scans = (scanRows ?? []) as BoxScan[];

  const withUrls: RenterScan[] = await Promise.all(
    scans.map(async (s) => ({
      id: s.id,
      kind: s.kind,
      sender: s.sender,
      note: s.note,
      scanned_at: s.scanned_at,
      requested_action: s.requested_action,
      urls: (
        await Promise.all(s.image_paths.map((p) => signedUrl(admin, "mail-photos", p, 600)))
      ).filter((u): u is string => Boolean(u)),
    })),
  );

  return (
    <RenterMailView
      token={token}
      box={{
        box_number: box.box_number,
        renter: `${box.renter_first} ${box.renter_last}`.trim(),
        business: box.business_name,
      }}
      location={location}
      scans={withUrls}
    />
  );
}
