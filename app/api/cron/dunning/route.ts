import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDunningSweep } from "@/lib/billing";
import { verifyCron } from "../auth";

export const runtime = "nodejs";

/** Daily dunning sweep: overdue notices, late fees, suspensions (lib/billing). */
export async function GET(request: Request) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    // Service role: the sweep spans every customer/subscription — no user session exists in cron.
    const result = await runDunningSweep(createAdminClient());
    return NextResponse.json(result);
  } catch (err) {
    console.error("dunning cron failed", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
