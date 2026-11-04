# MailboxOS

Multi-tenant digital mailbox (CMRA) platform. Full build spec: `docs/SPEC.md`.

## Decisions that supersede the spec
- **All-online model**: public catalog sells digital mailboxes only (~500 active
  boxes/location target, capacity seeded to 2,400). Physical plans exist in the
  schema but are `active=false` (legacy in-store renters get migrated, not deleted).
- **B2B model is SaaS licensing, not franchising**: each operator location is a
  `locations` row. No franchise-specific code. Stripe Connect per location is
  Phase 4 (column already exists).
- AI doc-scanning integration comes from the PAIDR codebase (separate repo) —
  `/api/ai/*` endpoints are stubs until then.

## Architecture rules (do not violate)
- Migrations in `supabase/migrations/` are the schema source of truth.
- `mail_events` is append-only — no update/delete anywhere, ever.
- All mail status changes go through `transitionMailItem()` (lib/mail.ts);
  DB triggers enforce the state machine, 1583 verification, and open-consent.
- Server actions: zod-validate input → `requireCustomer()`/`requireStaff(role)` →
  user-context Supabase client by default; `createAdminClient()` only where RLS
  intentionally blocks, after an explicit authz check.
- Storage buckets are private; client access only via 60s signed URLs.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`/`STRIPE_SECRET_KEY` client-side.

## Commands
- `npm run dev` / `npm run build`
- `./scripts/db-test.sh` — applies all migrations to a throwaway local Postgres
  (mocked Supabase auth/storage) and runs the RLS/compliance assertion suite.
  Run after ANY migration change.
