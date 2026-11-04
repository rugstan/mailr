// Domain types mirroring supabase/migrations/0001_schema.sql.
// Regenerate with `supabase gen types` once the hosted project is provisioned.

export type StaffRole = "owner" | "manager" | "scan_operator" | "counter";
export type MailboxType = "physical" | "digital" | "hybrid";
export type MailboxStatus = "available" | "active" | "suspended" | "closed";
export type SubStatus = "trialing" | "active" | "past_due" | "suspended" | "canceled";
export type RecipientStatus = "pending_id" | "pending_1583" | "verified" | "expired" | "rejected";
export type MailKind = "letter" | "large_envelope" | "package";
export type MailCategory =
  | "bill" | "government" | "legal" | "financial" | "check"
  | "personal" | "marketing" | "package_contents" | "unknown";
export type MailStatus =
  | "received" | "checked_in" | "notified" | "action_pending" | "opening"
  | "scanned" | "held_for_pickup" | "out_for_forward" | "forwarded"
  | "shredded" | "recycled" | "picked_up" | "archived" | "returned_to_sender";
export type ActionType = "open_scan" | "forward" | "shred" | "recycle" | "pickup" | "hold" | "check_deposit";
export type ActionStatus = "requested" | "in_progress" | "fulfilled" | "canceled" | "failed";
export type ActorType = "customer" | "staff" | "system" | "rule";
export type UsageType =
  | "scan_overage" | "forward_handling" | "check_deposit" | "storage_day"
  | "extra_recipient" | "rush_scan" | "shred" | "late_fee";

export interface LocationSettings {
  sla_hours?: number;
  free_storage_days?: number;
  storage_day_cents?: number;
  scan_overage_cents?: number;
  late_fee_cents?: number;
  late_fee_grace_days?: number;
  suspend_after_days?: number;
  dunning_days?: number[];
  forward_markup_pct?: number;
  forward_handling_cents?: number;
  rush_scan_cents?: number;
  check_deposit_cents?: number;
}

export interface Location {
  id: string;
  name: string;
  slug: string;
  street_address: string;
  city: string;
  state: string;
  zip: string;
  timezone: string;
  branding: Record<string, unknown>;
  stripe_account_id: string | null;
  settings: LocationSettings;
  created_at: string;
}

export interface StaffUser {
  id: string;
  location_id: string;
  auth_user_id: string;
  full_name: string;
  role: StaffRole;
  badge_code: string | null;
  active: boolean;
}

export interface Plan {
  id: string;
  location_id: string;
  name: string;
  tier: string;
  mailbox_type: MailboxType;
  monthly_price_cents: number;
  annual_price_cents: number | null;
  quotas: Record<string, number>;
  stripe_product_id: string | null;
  stripe_price_monthly: string | null;
  stripe_price_annual: string | null;
  active: boolean;
}

export interface Customer {
  id: string;
  location_id: string;
  auth_user_id: string | null;
  full_name: string;
  username: string | null;
  email: string;
  phone: string | null;
  stripe_customer_id: string | null;
  status: SubStatus;
  referral_code: string | null;
  notification_prefs: Record<string, unknown>;
  suspended_at: string | null;
  suspension_reason: string | null;
  created_at: string;
}

export type BoxSize = "small" | "medium" | "large";

export interface BoxRental {
  id: string;
  location_id: string;
  box_number: string;
  size: BoxSize;
  renter_first: string;
  renter_last: string;
  business_name: string | null;
  expires_on: string; // ISO date (YYYY-MM-DD)
  phone: string | null;
  email: string | null;
  status: "rented" | "available";
  notes: string | null;
  view_token: string;
  created_at: string;
  updated_at: string;
}

export interface BoxScan {
  id: string;
  location_id: string;
  box_rental_id: string;
  kind: "exterior" | "contents";
  image_paths: string[];
  sender: string | null;
  note: string | null;
  requested_action: "forward" | "hold" | "shred" | "open_scan" | null;
  requested_at: string | null;
  scanned_at: string;
  viewed_at: string | null;
  created_at: string;
}

export interface Mailbox {
  id: string;
  location_id: string;
  customer_id: string | null;
  pmb_number: number;
  type: MailboxType;
  status: MailboxStatus;
  attrs: { size?: string };
}

export interface Subscription {
  id: string;
  customer_id: string;
  plan_id: string;
  mailbox_id: string | null;
  stripe_subscription_id: string | null;
  status: SubStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  quota_usage: Record<string, number>;
  dunning: {
    failed_at?: string;
    notices_sent?: number[];
    late_fee_applied_at?: string;
  };
}

export interface Recipient {
  id: string;
  customer_id: string;
  mailbox_id: string;
  full_name: string;
  aliases: string[];
  business_name: string | null;
  is_minor: boolean;
  status: RecipientStatus;
  id_verified_at: string | null;
  id_expires_on: string | null;
}

export interface MailItem {
  id: string;
  location_id: string;
  mailbox_id: string;
  recipient_id: string | null;
  barcode: string | null;
  kind: MailKind;
  status: MailStatus;
  category: MailCategory;
  urgency: number;
  sender_name: string | null;
  ai_intake: Record<string, unknown> | null;
  exterior_photos: string[];
  carrier: string | null;
  weight_oz: number | null;
  received_at: string;
  storage_free_until: string | null;
  created_at: string;
}

export interface MailEvent {
  id: string;
  mail_item_id: string;
  event_type: string;
  actor_type: ActorType;
  actor_id: string | null;
  consent_source: { type: "action_request" | "standing_rule"; id: string } | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ActionRequest {
  id: string;
  mail_item_id: string;
  customer_id: string;
  action: ActionType;
  status: ActionStatus;
  rush: boolean;
  sla_due_at: string | null;
  fulfilled_by: string | null;
  fulfilled_at: string | null;
  params: Record<string, unknown>;
  created_at: string;
}

export interface StandingRule {
  id: string;
  customer_id: string;
  priority: number;
  match: { category?: MailCategory; sender_contains?: string };
  action: ActionType;
  active: boolean;
}

export interface ScanDocument {
  id: string;
  mail_item_id: string;
  page_count: number | null;
  pdf_path: string;
  ocr_text: string | null;
  ai_extraction: Record<string, unknown> | null;
}

export interface UsageRecord {
  id: string;
  customer_id: string;
  subscription_id: string | null;
  type: UsageType;
  qty: number;
  unit_cents: number;
  mail_item_id: string | null;
  stripe_recorded: boolean;
  period: string;
  created_at: string;
}

export interface BillEvent {
  id: string;
  customer_id: string;
  mail_item_id: string | null;
  payee: string | null;
  amount_cents: number | null;
  due_date: string | null;
  doc_type: string | null;
  status: "pending" | "reminded" | "paid" | "dismissed";
}

export const ROLE_RANK: Record<StaffRole, number> = {
  owner: 4,
  manager: 3,
  scan_operator: 2,
  counter: 1,
};
