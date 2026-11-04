import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface NotifyOptions {
  customerId: string;
  mailItemId?: string | null;
  template: string;
  subject: string;
  body: string;
  /** Defaults to ["email"]. SMS only fires when Twilio is configured. */
  channels?: ("email" | "sms")[];
}

/**
 * Records a notification row per channel and delivers via SendGrid / Twilio
 * when configured. Missing provider keys degrade to a logged, queued row —
 * never a thrown error (notifications must not break the mail pipeline).
 */
export async function notifyCustomer(admin: SupabaseClient, opts: NotifyOptions): Promise<void> {
  const channels = opts.channels ?? ["email"];
  const { data: customer } = await admin
    .from("customers")
    .select("id, email, phone, full_name, notification_prefs")
    .eq("id", opts.customerId)
    .maybeSingle();
  if (!customer) return;

  for (const channel of channels) {
    let status = "queued";
    try {
      if (channel === "email" && customer.email) {
        status = (await sendEmail(customer.email, opts.subject, opts.body)) ? "sent" : "skipped";
      } else if (channel === "sms" && customer.phone) {
        status = (await sendSms(customer.phone, opts.body)) ? "sent" : "skipped";
      } else {
        status = "skipped";
      }
    } catch (err) {
      console.error(`notify ${channel} failed`, err);
      status = "failed";
    }
    await admin.from("notifications").insert({
      customer_id: opts.customerId,
      mail_item_id: opts.mailItemId ?? null,
      channel,
      template: opts.template,
      status,
      payload: { subject: opts.subject },
      sent_at: status === "sent" ? new Date().toISOString() : null,
    });
  }
}

async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  const key = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL;
  if (!key || !from) return false;
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from, name: process.env.SENDGRID_FROM_NAME ?? "MailboxOS" },
      subject,
      content: [{ type: "text/plain", value: body }],
    }),
  });
  if (!res.ok) throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
  return true;
}

async function sendSms(to: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return false;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
  return true;
}
