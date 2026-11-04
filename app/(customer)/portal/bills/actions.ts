"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  billId: z.uuid(),
  status: z.enum(["paid", "dismissed"]),
});

export async function setBillStatus(
  billId: string,
  status: "paid" | "dismissed"
): Promise<{ error?: string; success?: boolean }> {
  // 1. Validate input.
  const parsed = schema.safeParse({ billId, status });
  if (!parsed.success) return { error: "Invalid request." };

  // 2. Authz.
  const customer = await requireCustomer();

  // 3. Verify ownership by reading through the user-context client first.
  const supabase = await createClient();
  const { data: bill } = await supabase
    .from("bill_events")
    .select("id")
    .eq("id", parsed.data.billId)
    .eq("customer_id", customer.id)
    .maybeSingle();
  if (!bill) return { error: "Bill not found." };

  // 4. Update via the user client — the grant is column-limited to status and
  //    RLS restricts the row to the owner.
  const { error } = await supabase
    .from("bill_events")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.billId)
    .eq("customer_id", customer.id);
  if (error) {
    console.error("bill status update failed", error);
    return { error: "Could not update the bill. Please try again." };
  }

  revalidatePath("/portal/bills");
  return { success: true };
}
