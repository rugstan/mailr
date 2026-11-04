"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/ratelimit";

export type RenterActionResult = { ok: true } | { error: string };

const schema = z.object({
  token: z.uuid(),
  scan_id: z.uuid(),
  action: z.enum(["forward", "hold", "shred", "open_scan"]),
});

/**
 * Renter requests an action on a scanned mail piece. Authorized purely by the
 * per-box view_token (the bearer link) — resolved server-side via the service
 * role, rate-limited, and scoped so a token can only touch its own box's scans.
 */
export async function requestMailAction(input: unknown): Promise<RenterActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`mailaction:${ip}`, 40, 900, true))) {
    return { error: "Too many requests — please wait a few minutes." };
  }

  const admin = createAdminClient();
  const { data: box } = await admin
    .from("box_rentals")
    .select("id")
    .eq("view_token", parsed.data.token)
    .maybeSingle();
  if (!box) return { error: "This link is no longer valid." };

  const { data: scan } = await admin
    .from("box_scans")
    .select("id, box_rental_id")
    .eq("id", parsed.data.scan_id)
    .maybeSingle();
  if (!scan || (scan as { box_rental_id: string }).box_rental_id !== (box as { id: string }).id) {
    return { error: "That item wasn't found." };
  }

  const { error } = await admin
    .from("box_scans")
    .update({ requested_action: parsed.data.action, requested_at: new Date().toISOString() })
    .eq("id", parsed.data.scan_id);
  if (error) {
    console.error("requestMailAction failed", error);
    return { error: "Could not submit your request." };
  }
  revalidatePath(`/m/${parsed.data.token}`);
  return { ok: true };
}
