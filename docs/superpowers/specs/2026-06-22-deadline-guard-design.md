# Deadline Guard — Design Spec

_Date: 2026-06-22 · Feature: Deadline Defense Agent (MVP) · Status: awaiting review_

## Summary

When staff scan a piece of mail for a **Deadline-Guard-enabled** box, an AI reads it,
decides whether it is a time-critical notice from one of three issuers (**IRS**,
**county court / service-of-process**, **CA DMV / FTB**), and if so extracts the
**deadline**, a plain-English **summary**, and a **recommended action**. The renter's
private link shows a live **countdown**; the daily cron **escalates** by email as the
date nears. Sold as a **+$10/mo "Deadline Guard"** add-on (MVP: an owner-set per-box flag).

This is the wedge feature: it extends the scanning loop we already shipped, monetizes the
existing 236 renters at zero CAC, and seeds the "obligation graph" later features build on.

## Goals / Non-goals

**Goals**
- Detect time-critical mail from 3 issuers and surface a deadline the renter can't miss.
- Reuse the existing scan loop, SendGrid notify, and cron-escalation patterns.
- Keep it legally clean: **advisory only**.

**Non-goals (hard lines — do not cross)**
- We **never file** anything with a court/agency and **never pay** a bill (money transmission / UPL).
- We do **not** sell or share the extracted data with third parties (data-broker law).
- Output carries a "not legal or tax advice" disclaimer.

## MVP scope

In: 3-issuer detection, deadline extraction, severity, plain-English summary + recommended
action, renter-view countdown card, email escalation, per-box owner toggle.

Out (fast-follows, separate specs): AI-generated editable **draft response letters**;
**Stripe self-serve** upgrade on the renter link; **SMS/voice** escalation; more issuers;
the cross-store **Sentinel** fraud network.

## Architecture

### 1. Trigger
`addBoxScan` (existing) inserts the scan, then — **only if `box_rentals.deadline_guard = true`** —
runs the AI extraction **inline** and, if time-critical, inserts a `deadlines` row.
- Tradeoff: inline means staff wait ~4–8s on guarded scans (acceptable for a deliberate
  action; shown with a spinner). If/when volume grows, move to a background queue
  (Vercel `waitUntil` / QStash). The daily cron (below) retries any guarded scan with no
  `deadlines` row and `ai_status = 'error'` as a safety net.

### 2. AI extraction pipeline (`lib/deadline-ai.ts`, server-only)
1. **OCR** — Google Cloud Vision `DOCUMENT_TEXT_DETECTION` on the scan image(s) → raw text.
2. **LLM** — send OCR text to OpenRouter (same client pattern as doccy `server/ai.ts`) with a
   strict prompt → JSON, **zod-validated**:
   ```
   { issuer: 'irs'|'court_sop'|'dmv_ftb'|'other',
     time_critical: boolean, due_on: 'YYYY-MM-DD'|null,
     severity: 1|2|3, title: string, summary: string,
     recommended_action: string, confidence: 0..1 }
   ```
3. Low confidence (<0.6) or `issuer='other'` → **no deadline row**, but the scan is tagged
   `ai_status='review'` so staff can see "AI unsure — check this one." Never silently drop.

### 3. Data model (migration 0010)
- `alter table box_rentals add column deadline_guard boolean not null default false;`
- `create table deadlines ( id, location_id, box_rental_id, box_scan_id, issuer text,
  title text, summary text, recommended_action text, due_on date, severity smallint,
  status text default 'open' check in ('open','resolved','dismissed'), confidence numeric,
  ai_raw jsonb, last_escalated_at timestamptz, created_at, updated_at );` + index on
  `(location_id, due_on)`; staff RLS via `is_staff(location_id,'counter')`.
- `alter table box_scans add column ai_status text default 'none';` ('none'|'ok'|'review'|'error')

### 4. Renter view (`/m/[token]`)
Above the mail list, an **"Action needed"** band lists open deadlines: severity-colored card,
issuer label, `Respond by Jul 15 · 23 days left` countdown, the plain-English summary +
recommended action, and a disclaimer line. Uses the existing token-scoped server read.

### 5. Escalation (`/api/cron/deadlines`, new — mirrors `/api/cron/reminders`)
Daily sweep: open deadlines with `due_on` within **T-14 / 7 / 3 / 1 / 0** → email the renter
via SendGrid (`notifyCustomer` pattern) with their link; severity weights the copy; writes
`last_escalated_at` to avoid double-sends. Cron-auth via existing `verifyCron`.

### 6. Monetization toggle
`deadline_guard` boolean on `box_rentals`, toggled from the roster edit dialog (a Switch) +
a small "Guard" badge in the roster row. Only guarded boxes incur AI cost. Real billing
(Stripe) is a fast-follow; for the flagship's 236 it starts as an owner flag.

## Data flow (end to end)
`staff scans (guarded box)` → `addBoxScan` uploads image + inserts scan → inline
`extractDeadline(image)` (OCR→LLM) → if time-critical, insert `deadlines` row →
renter opens link → sees countdown card → daily cron emails escalations until resolved.

## Error handling & confidence
- OCR or LLM throws → catch, set `box_scans.ai_status='error'`, scan still saves; cron retries.
- LLM returns invalid JSON → zod fails → retry once → else `ai_status='review'`.
- Bad/again-low confidence → `review`, surfaced to staff, no false deadline.
- All deadlines are advisory; the renter (a human) still taps the action.

## Security & compliance
- Advisory only; explicit "not legal/tax advice" disclaimer on every deadline.
- No filing, no paying, no data sale. Audit: `deadlines` + escalation timestamps retained.
- Scan images stay private (signed URLs, existing). Provider keys server-only.
- **Data-processing note:** scan text/image is sent to Google Vision + OpenRouter. Fine for
  the flagship's own renters; add a processor disclosure + opt-in before selling to other
  operators (tracked as a scale-time item, not an MVP blocker).

## Dependencies / env keys (needed before build)
- `OPENROUTER_API_KEY` (+ `AI_CLASSIFIER_MODEL`, e.g. a current strong text model).
- Google Vision: `GOOGLE_VISION_API_KEY` **or** service-account JSON via
  `GOOGLE_APPLICATION_CREDENTIALS`.
- Both exist in the `doccy` project's `.env` — **rotate them** before reuse (per project notes)
  and add to `mailboxos/.env.local` (+ Vercel envs for prod).

## Testing
- Unit: deadline-extraction parsing (mock OCR text → expected `due_on`/issuer); cron date math.
- RLS: a renter token can read only its box's deadlines; staff scoped to location.
- Manual E2E: scan sample IRS / court / DMV notices on a guarded box → deadline card on the
  renter link → trigger the cron → confirm escalation email.

## Open decisions — resolved
- **AI approach:** OCR (Google Vision) → text LLM (OpenRouter). ✓ (chosen)
- **MVP scope:** detect + deadline + escalate; drafts/Stripe/voice deferred. ✓ (chosen)
- **Issuers:** IRS, county court (service-of-process), CA DMV/FTB. ✓
