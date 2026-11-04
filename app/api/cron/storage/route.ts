import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { flushPendingUsage, runStorageSweep } from "@/lib/billing";
import { stripeConfigured } from "@/lib/stripe";
import { verifyCron } from "../auth";

export const runtime = "nodejs";

/**
 * Nightly storage billing: charge a storage_day for every package past its
 * free window, then flush all unbilled usage records to Stripe invoice items.
 */
export async function GET(request: Request) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    // Service role: sweeps every customer's packages/usage — no user session exists in cron.
    const admin = createAdminClient();
    const storageDaysBilled = await runStorageSweep(admin);

    let customersFlushed = 0;
    if (stripeConfigured()) {
      const { data: pending, error } = await admin
        .from("usage_records")
        .select("customer_id")
        .eq("stripe_recorded", false);
      if (error) throw new Error(error.message);
      const customerIds = [...new Set((pending ?? []).map((r) => r.customer_id as string))];
      for (const customerId of customerIds) {
        const flushed = await flushPendingUsage(admin, customerId);
        if (flushed > 0) customersFlushed++;
      }
    }

    return NextResponse.json({ storageDaysBilled, customersFlushed });
  } catch (err) {
    console.error("storage cron failed", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
