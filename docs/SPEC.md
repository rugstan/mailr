# BUILD SPEC — Digital Mailbox Platform ("MailboxOS")
### Claude Code build brief · v1.0 · June 2026
### Drop this file into the repo root as `CLAUDE.md` (or `/docs/SPEC.md` and reference it from CLAUDE.md)

---

## 0. Mission & Context

Build a production multi-tenant digital mailbox (CMRA) platform for a PostalAnnex franchise location, designed to scale to 2,000+ digital mailboxes at one site and license to additional locations later. Customers rent a virtual PMB number at the store's street address; staff photograph, classify, and (with recorded consent) open and scan mail; customers manage everything in a portal. An AI layer classifies every item and extracts bill due dates, amounts, and government deadlines.

**Non-negotiable design principles:**
1. **Compliance is enforced by code.** Mail cannot be checked in for a recipient without a verified Form 1583. Mail cannot be opened without a consent source (per-item request or standing rule). Every staff action is audit-logged append-only.
2. **Autopay or no service.** Card on file required; failed payment → dunning → automatic service suspension. No manual collections.
3. **Multi-tenant from day one.** Every table scoped by `location_id`. Location #2 is a config row, not a fork.
4. **Staff speed is a feature.** Intake must take ≤35 seconds per item. The staff app is keyboard/scanner-first, tablet-friendly.

---

## 1. Tech Stack (fixed — do not substitute)

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router) · TypeScript · Tailwind · shadcn/ui |
| Hosting | Vercel |
| DB / Auth / Storage | Supabase (Postgres 15, RLS, Supabase Auth, Storage buckets, Edge Functions) |
| Billing | Stripe Billing (subscriptions + metered usage) · Stripe Identity (ID verification) |
| AI | Anthropic API (Claude) for vision OCR, classification, extraction |
| Notifications | SendGrid (email) · Twilio (SMS) · Web Push |
| PDF | `pdf-lib` for Form 1583 generation; `react-pdf` viewer |
| Ops automation | n8n (webhook-driven: CRD exports, ID-expiry campaigns, daily reports) |
| Barcode | Code 128 labels via thermal printer; `html5-qrcode` / keyboard-wedge scanner input |

Repo structure:
```
/app
  /(customer)        # customer portal routes
  /(staff)/staff     # staff app routes
  /(admin)/admin     # owner/admin routes
  /api               # route handlers (webhooks, AI pipeline)
/components
/lib                 # supabase clients, stripe, ai, utils
/supabase
  /migrations        # SQL migrations (source of truth for schema)
  /functions         # edge functions
/docs
```

Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_IDENTITY_*`, `ANTHROPIC_API_KEY`, `SENDGRID_API_KEY`, `TWILIO_*`, `APP_URL`, `EASYPOST_API_KEY` (forwarding labels).

---

## 2. Data Model (Postgres — write as Supabase migrations)

### 2.1 Enums

```sql
create type staff_role as enum ('owner','manager','scan_operator','counter');
create type mailbox_type as enum ('physical','digital','hybrid');
create type mailbox_status as enum ('available','active','suspended','closed');
create type sub_status as enum ('trialing','active','past_due','suspended','canceled');
create type recipient_status as enum ('pending_id','pending_1583','verified','expired','rejected');
create type mail_kind as enum ('letter','large_envelope','package');
create type mail_category as enum ('bill','government','legal','financial','check','personal','marketing','package_contents','unknown');
create type mail_status as enum ('received','checked_in','notified','action_pending','opening','scanned','held_for_pickup','out_for_forward','forwarded','shredded','recycled','picked_up','archived','returned_to_sender');
create type action_type as enum ('open_scan','forward','shred','recycle','pickup','hold','check_deposit');
create type action_status as enum ('requested','in_progress','fulfilled','canceled','failed');
create type actor_type as enum ('customer','staff','system','rule');
create type usage_type as enum ('scan_overage','forward_handling','check_deposit','storage_day','extra_recipient','rush_scan','shred');
```

### 2.2 Core tables (all have `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at`)

```sql
-- TENANCY
locations (
  name text, slug text unique, street_address text, city text, state text, zip text,
  timezone text, branding jsonb, stripe_account_id text,          -- Stripe Connect (phase 4)
  cmra_registered boolean default true, postmaster_notified_at timestamptz,
  settings jsonb  -- SLA hours, storage free days, etc.
)

staff_users (
  location_id uuid references locations, auth_user_id uuid references auth.users,
  full_name text, role staff_role, badge_code text unique, active boolean default true
)

-- CATALOG & BILLING
plans (
  location_id uuid, name text, tier text,            -- 'lite' | 'plus' | 'business' | 'hybrid_addon' | 'physical_s/m/l'
  monthly_price_cents int, annual_price_cents int,
  quotas jsonb,    -- {open_scans: 5, items: 30, recipients: 1, free_storage_days: 5, checks: 0}
  stripe_product_id text, stripe_price_monthly text, stripe_price_annual text,
  active boolean default true
)

customers (
  location_id uuid, auth_user_id uuid unique references auth.users,
  full_name text, email text, phone text,
  stripe_customer_id text unique, status sub_status default 'trialing',
  referral_code text, notification_prefs jsonb default '{}'
)

mailboxes (
  location_id uuid, customer_id uuid references customers,
  pmb_number int, type mailbox_type, status mailbox_status default 'available',
  unique(location_id, pmb_number)
)
-- Seed digital PMB range 201–2400 per location; physical boxes seeded from store's existing numbering.

subscriptions (
  customer_id uuid, plan_id uuid, mailbox_id uuid,
  stripe_subscription_id text unique, status sub_status,
  current_period_start timestamptz, current_period_end timestamptz,
  quota_usage jsonb default '{}'   -- reset by webhook on invoice.paid
)

-- COMPLIANCE (the heart of the system)
recipients (
  customer_id uuid, mailbox_id uuid,
  full_name text, aliases text[] default '{}',       -- grows via staff fuzzy-match confirmations
  business_name text, is_minor boolean default false,
  status recipient_status default 'pending_id',
  id_verified_at timestamptz, id_expires_on date,
  stripe_identity_session_id text
)

form_1583_records (
  recipient_id uuid unique, pdf_url text,             -- generated, filled PS Form 1583
  signed_at timestamptz, signature_ip inet,
  verification_method text,                            -- 'stripe_identity' | 'in_person_witness'
  witness_staff_id uuid, crd_uploaded_at timestamptz, crd_status text,
  terminated_at timestamptz
)

id_documents (
  recipient_id uuid, doc_type text,                    -- 'drivers_license','passport','utility_bill', etc.
  storage_path text,                                   -- private bucket, encrypted
  expires_on date
)

-- MAIL PIPELINE
mail_items (
  location_id uuid, mailbox_id uuid, recipient_id uuid,   -- recipient null until matched
  barcode text unique,                                     -- printed at intake: 'MB-{pmb}-{seq}'
  kind mail_kind, status mail_status default 'received',
  category mail_category default 'unknown', urgency smallint default 0,  -- 0..3
  sender_name text, ai_intake jsonb,                       -- raw extraction from exterior
  exterior_photos text[] ,                                 -- storage paths
  carrier text, weight_oz numeric, dims jsonb,
  received_at timestamptz default now(),
  storage_free_until date,                                 -- packages only
  match_confidence numeric                                  -- name match score
)

mail_events (   -- APPEND-ONLY audit log. No update/delete grants. This is the legal record.
  mail_item_id uuid, event_type text,                      -- 'checked_in','opened','scanned','forwarded','shredded','picked_up','notified','rule_applied', ...
  actor_type actor_type, actor_id uuid,
  consent_source jsonb,                                    -- {type:'action_request',id} | {type:'standing_rule',id} — REQUIRED for 'opened'
  metadata jsonb, created_at timestamptz default now()
)

scan_documents (
  mail_item_id uuid unique, page_count int, pdf_path text,
  ocr_text text, search tsvector generated always as (to_tsvector('english', coalesce(ocr_text,''))) stored,
  ai_extraction jsonb                                       -- structured fields (see §5.3)
)

action_requests (
  mail_item_id uuid, customer_id uuid,
  action action_type, status action_status default 'requested',
  rush boolean default false, sla_due_at timestamptz,
  fulfilled_by uuid, fulfilled_at timestamptz, params jsonb  -- forward address, etc.
)

standing_rules (
  customer_id uuid, priority int,
  match jsonb,        -- {category:'government'} | {sender_contains:'PG&E'} | {category:'marketing'}
  action action_type, active boolean default true
)

bill_events (
  customer_id uuid, mail_item_id uuid,
  payee text, amount_cents int, due_date date,
  doc_type text,                     -- 'utility_bill','irs_notice','dmv','invoice', ...
  status text default 'pending',     -- pending | reminded | paid | dismissed
  reminders jsonb default '[]'       -- scheduled reminder timestamps
)

forward_shipments (
  action_request_id uuid unique, to_address jsonb,
  carrier text, service text, postage_cents int, markup_cents int, handling_cents int,
  label_url text, tracking_number text, shipped_at timestamptz
)

usage_records (
  customer_id uuid, subscription_id uuid, type usage_type,
  qty int default 1, unit_cents int, mail_item_id uuid,
  stripe_recorded boolean default false, period date
)

check_deposits (
  mail_item_id uuid, amount_cents int, bank_name text,
  status text default 'received',    -- received | deposited | cleared | returned
  deposit_slip_path text
)

pickup_logs (
  mail_item_id uuid, verified_id_type text, staff_id uuid,
  signature_path text, picked_up_at timestamptz default now()
)

notifications (
  customer_id uuid, mail_item_id uuid, channel text,  -- email | sms | push
  template text, status text, sent_at timestamptz
)

crd_exports (
  location_id uuid, quarter text,            -- '2026-Q3'
  file_path text, certified_at timestamptz, certified_by uuid
)

leads ( email text, phone text, source text, plan_interest text, converted_customer_id uuid )
```

### 2.3 RLS policy strategy

- `customers`: row where `auth_user_id = auth.uid()`. Customer can select own customer/mailbox/mail_items/scan_documents/bill_events/action_requests/standing_rules/usage/notifications; can insert `action_requests` and `standing_rules`; can never select another mailbox's rows.
- `staff_users`: helper function `is_staff(location uuid, min_role staff_role)`. Staff select/insert scoped to their `location_id`. **Only `scan_operator+` may insert `mail_events` of type `opened`/`scanned`.** Counter role may check in and log pickups only.
- `mail_events`: insert-only for all roles; no update/delete policies exist (append-only enforced at the policy level + revoke).
- `id_documents` and `form_1583_records`: customer can read own; staff `manager+` only; storage bucket private with signed URLs (60s expiry).
- Service role (Edge Functions / webhooks) bypasses RLS for pipeline writes — never expose service key client-side.

### 2.4 Key constraint triggers (write as Postgres triggers)

1. **No check-in without compliance:** before insert on `mail_items` with `recipient_id` set → assert recipient `status='verified'` and 1583 not terminated/expired; else raise.
2. **No open without consent:** before insert on `mail_events` where `event_type='opened'` → assert `consent_source` references an `action_requests` row (status requested/in_progress, action=open_scan) for that item **or** an active `standing_rules` row owned by the item's customer whose `match` fits the item; else raise.
3. **Quota counter:** after insert on `mail_events('scanned')` → increment `subscriptions.quota_usage.open_scans`; if over plan quota, insert `usage_records(scan_overage)`.
4. **Storage clock:** nightly cron (pg_cron or n8n) → for packages past `storage_free_until` and not picked up, insert one `usage_records(storage_day)` per day.

---

## 3. Mail Lifecycle State Machine (implement as a single `transitionMailItem()` server action)

```
received → checked_in → notified → action_pending
   action_pending + open_scan → opening → scanned → (archived | shred-after-scan flow)
   action_pending + forward   → out_for_forward → forwarded
   action_pending + pickup    → held_for_pickup → picked_up
   action_pending + shred     → shredded
   action_pending + recycle   → recycled
   checked_in (name mismatch resolution failed) → returned_to_sender
Day-7 no action → reminder notification. Day-30 → plan default policy (hold | auto-archive prompt).
```
Every transition writes a `mail_events` row. Illegal transitions throw. SLA timers: exterior notify ≤4 business hours after `received`; `open_scan` requested before 14:00 fulfilled same business day, else next morning; rush = 2 hours.

---

## 4. Screens & Routes

### 4.1 Customer portal `(customer)`
| Route | Purpose |
|---|---|
| `/onboarding` | 6-step wizard: account → choose plan (+ annual toggle) → Stripe checkout (card required) → add recipients → Stripe Identity verification per recipient → Form 1583 review & e-sign (pdf-lib fills the official PS Form 1583 template, signature pad, IP + timestamp) → **address issued screen** ("Your new address: 123 Main St, PMB 412…") with copy button & "how to update your address everywhere" checklist |
| `/inbox` | Mail list: thumbnail of envelope, sender, category chip, urgency badge, status, action buttons. Filters by category/status. Empty state sells standing rules. |
| `/item/[id]` | Full item: photo carousel, scanned PDF viewer, AI summary line, extracted fields, action panel (Open & Scan / Forward / Pickup / Shred / Deposit Check), event timeline (the customer-visible slice of the audit log) |
| `/bills` | **Bill Inbox** — the differentiator: unified list of extracted bills/notices with payee, amount, due date, days-left bar; mark paid/dismiss; calendar feed (ICS) |
| `/rules` | Standing rules builder: "When [category/sender] → [action]" with priority ordering; preview of which recent items would have matched |
| `/billing` | Plan, quota usage meters, invoices, payment method, annual upgrade |
| `/search` | Full-text search over `scan_documents.search` + AI answer box ("What was my PG&E bill in March?") |
| `/settings` | Recipients management (add = new ID verify + 1583 flow), notification prefs per category, forwarding addresses book |

### 4.2 Staff app `(staff)/staff` — tablet-first, scanner-first
| Route | Purpose |
|---|---|
| `/staff/intake` | **The 35-second screen.** Flow: scan/enter PMB or let AI read it → camera capture exterior (front/back) → AI returns recipient guess + match score → big green CONFIRM (or alias-confirm / RETURN TO SENDER red path) → kind toggle (letter/large/package; package adds weight) → print barcode → next. Running session counter ("47 items, avg 28s"). |
| `/staff/queue` | Two SLA queues: **Scan queue** (open_scan requests sorted by sla_due, rush pinned) and **Action queue** (forwards, shreds, deposits). Scan flow: scan item barcode → consent check banner (shows the consent source — request or rule) → sheet-feed scan upload → auto-OCR → confirm page count → done (item transitions, customer notified). |
| `/staff/pickup` | Scan barcode or search PMB → verify photo ID type dropdown → signature pad → picked_up |
| `/staff/compliance` | 1583 registry: recipients by status, expiring IDs (60-day window), CRD quarter checklist + "Generate CRD export" button, terminated boxes |
| `/staff/customers` | Lookup, suspend/reactivate, notes |

### 4.3 Admin `(admin)/admin`
KPI dashboard (active boxes, MRR, ARPU, churn, occupancy vs 500/2000 capacity, SLA hit rate, items/day, labor minutes/item), plan & pricing editor, à-la-carte price config, CRD status across locations, exports. Phase 4 adds location onboarding (new tenant wizard) and cross-location rollups.

---

## 5. AI Pipeline (Anthropic API — implement in `/lib/ai` + Edge Functions)

### 5.1 Intake exterior analysis — `POST /api/ai/intake`
Input: exterior photo(s). Model call (vision) with system prompt:

> You are a mail intake classifier for a CMRA. From the envelope image(s), return ONLY JSON: `{recipient_name_raw, recipient_business_raw, sender_name, sender_type: 'government'|'utility'|'bank'|'legal'|'marketing'|'personal'|'unknown', category_guess: <mail_category>, is_government: bool, urgency: 0-3, pmb_number_if_visible, confidence: 0-1}`. IRS, court, DMV, state tax agencies, USCIS ⇒ is_government=true, urgency 3.

Then server-side: fuzzy match `recipient_name_raw` against `recipients.full_name ∪ aliases` for that mailbox using `pg_trgm` similarity ≥ 0.45 auto-match, 0.30–0.45 staff confirm, < 0.30 reject path. Confirmed variants append to `aliases`.

### 5.2 Standing-rule evaluation — runs on `checked_in`
Match rules by priority; first hit auto-creates an `action_requests` row with `consent_source = {type:'standing_rule', id}` semantics (the trigger in §2.4 validates this at open time). Marketing + auto-shred rule = item skips the human queue entirely except the physical shred batch.

### 5.3 Content extraction — after scan upload, `POST /api/ai/extract`
Input: scanned PDF pages (vision). Return ONLY JSON:
```json
{ "category": "...", "summary_one_line": "...",
  "payee": null, "amount_cents": null, "due_date": null,
  "account_last4": null, "doc_type": null,
  "deadline_date": null, "deadline_description": null,
  "action_required": false, "is_check": false, "check_amount_cents": null,
  "confidence": 0.0 }
```
If `category in (bill, government)` and `due_date|deadline_date` present → insert `bill_events` with reminder schedule [due−14d, due−7d, due−2d, due day]. n8n consumes and sends. If `is_check` → prompt customer with Deposit Check action.

### 5.4 Search answers — `/search` calls Claude with top-k matching `ocr_text` chunks (Postgres FTS first, no vector DB needed in v1) and answers with citations to item IDs.

Cost guard: cache extractions by `mail_item_id`; never re-run on the same document; batch low-urgency classification.

---

## 6. Stripe Configuration

- Products/Prices: one product per plan tier, monthly + annual prices; **metered price** `scan_overage` ($1.50) attached as secondary subscription item; à-la-carte one-offs (forwarding, check deposit, storage days, rush) billed via `invoiceItems` added to the next invoice (simpler than metered for irregular charges).
- Checkout in onboarding: `mode=subscription`, card required, no trial without card.
- **Webhooks** (`/api/webhooks/stripe`): `checkout.session.completed` → activate subscription + assign PMB; `invoice.paid` → reset `quota_usage`, flush pending `usage_records` to invoice items for next cycle; `invoice.payment_failed` → status `past_due`, email+SMS dunning day 0/3/7; day 10 unresolved → `suspended` (portal read-only banner, intake holds mail but pauses scans); `customer.subscription.deleted` → closure flow (30-day mail forwarding notice, 1583 termination date set, CRD update).
- **Stripe Identity**: verification session created per recipient during onboarding; webhook `identity.verification_session.verified` → recipient `status='pending_1583'` → unlocks 1583 e-sign step → `verified`.

---

## 7. Notifications Matrix (SendGrid templates + Twilio)

| Trigger | Default channels |
|---|---|
| Mail checked in | push + email (envelope image inline) |
| Government/urgency 3 | push + SMS + email |
| Scan ready | push + email |
| Bill reminder (T−14/7/2/0) | email; SMS at T−2 |
| Package free-storage ending tomorrow | email + SMS |
| Payment failed / suspension warning | email + SMS |
| ID expiring in 60/30/7 days | email |
Per-category overrides live in `customers.notification_prefs`.

---

## 8. Build Phases (run as sequential Claude Code milestones; each ends with passing acceptance checks)

**M1 — Foundation (days 1–4).** Scaffold Next.js + Supabase; write ALL migrations from §2; RLS policies + the two compliance triggers; seed location, plans, PMB range 201–2400; auth (customer + staff roles); shadcn layout shells for all three apps.
✓ Accept: migrations apply clean; a customer user cannot select another customer's rows (write a test); trigger blocks `opened` event without consent_source.

**M2 — Onboarding & Billing (days 4–9).** Full onboarding wizard incl. Stripe Checkout, Stripe Identity, pdf-lib 1583 generation + e-sign + storage; PMB assignment; address-issued screen; webhook suite incl. dunning/suspension.
✓ Accept: end-to-end signup on Stripe test mode yields verified recipient, signed 1583 PDF in private bucket, active mailbox; failed-payment simulation suspends on schedule.

**M3 — Staff Intake (days 9–13).** Intake screen with camera capture → `/api/ai/intake` → fuzzy match UX (confirm/alias/reject) → barcode print → item `checked_in` → notification fires. Return-to-sender path. Session speed counter.
✓ Accept: 10-item batch processed; mismatched name is blocked from check-in; alias confirm persists.

**M4 — Customer Inbox & Actions (days 13–17).** Inbox, item detail, action requests with SLA stamps, standing rules builder + evaluation on check-in, day-7/30 jobs (n8n or pg_cron).
✓ Accept: rule "marketing → shred" auto-creates request; SLA due dates computed in location timezone.

**M5 — Scan Workflow & AI Extraction (days 17–22).** Staff scan queue, consent banner, PDF upload → OCR/extraction → `scan_documents` + `bill_events` + Bill Inbox UI + reminder sends + quota/overage metering.
✓ Accept: scanning an IRS notice creates urgency-3 item, deadline extracted, reminder scheduled; 6th scan on Lite plan creates `scan_overage` usage record that appears on next test invoice.

**M6 — Forwarding, Packages, Pickup, Checks (days 22–27).** EasyPost rate-shop + label purchase, markup math, tracking; package storage-day billing; pickup screen with signature; check-deposit flow.
✓ Accept: forward request → label → invoiceItem totals postage+35%+$3; storage cron bills day 6+.

**M7 — Compliance Ops & Search (days 27–31).** Compliance dashboard, CRD quarterly export (CSV/format per current USPS spec — keep the formatter isolated in `/lib/crd.ts` for easy spec updates), ID-expiry campaigns, FTS search + AI answers, customer-visible event timeline.
✓ Accept: CRD export includes every active + terminated recipient with dates; expired-ID recipient blocks new check-ins.

**M8 — Admin Analytics & Hardening (days 31–35).** KPI dashboard, pricing editor, audit log viewer, rate limiting, error monitoring (Sentry), load test intake at 2,000 items/day, backup/retention policy jobs, polish pass on portal.
✓ Accept: dashboard reconciles MRR with Stripe; p95 intake API < 800ms.

Phase 4 / post-launch (multi-tenant onboarding wizard, Stripe Connect per location, white-label theming, iOS/Android wrappers) is deliberately out of v1 scope — the schema already supports it.

---

## 9. Operating Targets the Software Must Surface (these become dashboard tiles)

Occupancy vs capacity (target ≥80% of 500 by month 4; capacity slider to 2,400) · paying ratio (target ≥95% — suspended boxes excluded from "paying") · net adds/week vs the 125–150/month plan · intake seconds/item (≤35) · scan SLA hit rate (≥97%) · churn (≤2.5%/mo) · ARPU blended ($19 floor) · à-la-carte attach (≥15% of sub revenue) · labor minutes per item trending down as auto-shred rules grow.

---

## 10. Out of Scope v1 (do not build yet)
Native apps, bill *payment* execution (reminders only — payments are a phase-2 partnership), vector search, multi-language portal, lockers/IoT, iPostal1 host integration (operationally separate), white-label theming engine.

— End of spec. Build M1 first; do not skip migration tests.
