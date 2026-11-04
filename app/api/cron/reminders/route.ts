import { NextResponse } from "next/server";
import { addDays, differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCustomer } from "@/lib/notify";
import { formatCents } from "@/lib/money";
import { verifyCron } from "../auth";

export const runtime = "nodejs";

const BILL_REMINDER_DAYS = [14, 7, 2, 0];
const ID_EXPIRY_DAYS = [60, 30, 7];

/**
 * Daily reminder sweeps:
 *  (a) day-7 nudge for mail still awaiting a customer decision,
 *  (b) bill reminders at T-14 / T-7 / T-2 / due day,
 *  (c) ID-expiry notices at 60 / 30 / 7 days out.
 * Date math uses the server (UTC) calendar day.
 */
export async function GET(request: Request) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    // Service role: reminder sweeps span every customer — no user session exists in cron.
    const admin = createAdminClient();
    const now = new Date();

    // ── (a) Day-7 nudge: mail waiting on a decision for over a week ──────────
    let day7Reminders = 0;
    const sevenDaysAgo = subDays(now, 7).toISOString();
    const { data: staleItems, error: staleErr } = await admin
      .from("mail_items")
      .select("id, mailbox:mailboxes!inner(customer_id)")
      .in("status", ["notified", "action_pending"])
      .lt("received_at", sevenDaysAgo)
      .limit(500); // bounded per run; the daily cron drains any backlog
    if (staleErr) throw new Error(staleErr.message);

    const staleList = (staleItems ?? []) as unknown as {
      id: string;
      mailbox: { customer_id: string | null } | null;
    }[];
    if (staleList.length > 0) {
      // One reminder per item, ever: skip items already nudged.
      const { data: sent, error: sentErr } = await admin
        .from("notifications")
        .select("mail_item_id")
        .eq("template", "day7_reminder")
        .in("mail_item_id", staleList.map((i) => i.id));
      if (sentErr) throw new Error(sentErr.message);
      const alreadyNudged = new Set((sent ?? []).map((n) => n.mail_item_id as string));

      for (const item of staleList) {
        if (alreadyNudged.has(item.id)) continue;
        const customerId = item.mailbox?.customer_id;
        if (!customerId) continue;
        await notifyCustomer(admin, {
          customerId,
          mailItemId: item.id,
          template: "day7_reminder",
          subject: "You have mail waiting for a decision",
          body: "A mail item has been waiting in your mailbox for 7 days. Sign in to choose what happens to it — open & scan, forward, pick up, or shred.",
        });
        day7Reminders++;
      }
    }

    // ── (b) Bill reminders at T-14 / T-7 / T-2 / due day ─────────────────────
    let billReminders = 0;
    const dueDates = BILL_REMINDER_DAYS.map((d) => format(addDays(now, d), "yyyy-MM-dd"));
    const { data: bills, error: billErr } = await admin
      .from("bill_events")
      .select("id, customer_id, payee, amount_cents, due_date, status, reminders")
      .in("status", ["pending", "reminded"])
      .in("due_date", dueDates);
    if (billErr) throw new Error(billErr.message);

    for (const bill of bills ?? []) {
      if (!bill.due_date) continue;
      const days = differenceInCalendarDays(parseISO(bill.due_date), now);
      if (!BILL_REMINDER_DAYS.includes(days)) continue;
      const reminders: { sent_at?: string; t_days?: number }[] = Array.isArray(bill.reminders)
        ? bill.reminders
        : [];
      if (reminders.some((r) => r?.t_days === days)) continue; // already sent this tier

      const dueLabel = format(parseISO(bill.due_date), "MMM d");
      await notifyCustomer(admin, {
        customerId: bill.customer_id,
        template: `bill_reminder_t${days}`,
        subject: `${bill.payee ?? "Your"} bill due ${dueLabel} — ${formatCents(bill.amount_cents)}`,
        body: `Reminder: ${bill.payee ?? "a bill"} for ${formatCents(bill.amount_cents)} is due ${
          days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`
        } (${dueLabel}). View the scanned document in your Bill Inbox.`,
        channels: days === 2 ? ["email", "sms"] : ["email"], // SMS at T-2 per the notification matrix
      });
      const { error: updErr } = await admin
        .from("bill_events")
        .update({
          status: "reminded",
          reminders: [...reminders, { sent_at: now.toISOString(), t_days: days }],
        })
        .eq("id", bill.id);
      if (updErr) console.error("bill reminder update failed", updErr);
      billReminders++;
    }

    // ── (c) ID expiry notices at 60 / 30 / 7 days out ────────────────────────
    let idExpiryNotices = 0;
    const expiryDates = ID_EXPIRY_DAYS.map((d) => format(addDays(now, d), "yyyy-MM-dd"));
    const { data: expiring, error: expErr } = await admin
      .from("recipients")
      .select("id, customer_id, full_name, id_expires_on")
      .eq("status", "verified")
      .in("id_expires_on", expiryDates);
    if (expErr) throw new Error(expErr.message);

    for (const recipient of expiring ?? []) {
      if (!recipient.id_expires_on) continue;
      const days = differenceInCalendarDays(parseISO(recipient.id_expires_on), now);
      await notifyCustomer(admin, {
        customerId: recipient.customer_id,
        template: "id_expiring",
        subject: `ID on file expires in ${days} day${days === 1 ? "" : "s"}`,
        body: `The photo ID on file for ${recipient.full_name} expires on ${format(
          parseISO(recipient.id_expires_on),
          "MMM d, yyyy"
        )}. Re-verification is needed to keep receiving mail — update the ID in your portal or in store before it expires.`,
      });
      idExpiryNotices++;
    }

    return NextResponse.json({ day7Reminders, billReminders, idExpiryNotices });
  } catch (err) {
    console.error("reminders cron failed", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
