# Backend

Status 2026-10-30: Postgres data layer, passwordless auth, Stripe billing in
code, email, all tested locally (`apps/web/test/backend.test.ts`, 9 tests on
Postgres 16, and `apps/web/e2e/slice.mjs` in Chromium). Nothing is connected
to a hosted service yet: that needs the owner's accounts and keys.

## Decisions (changes to architecture.md)

- **Auth is our own, not Supabase Auth.** One-time email links (and, next, SMS
  codes) in `auth_tokens`, opaque session cookies in `sessions`, only hashes
  stored. Reason: testable without any vendor account, and the database can
  live on Supabase, Neon or any Postgres. The link opens a page with a button
  that spends the token, so mail scanners cannot use it up.
- **Access rules: both.** Every query in `lib/store.ts` filters by the
  session's company and checks the role, and user requests run as the
  `turno_app` role with `app.user_id` set, so the RLS policies in
  `db/migrations/0001_init.sql` also apply. Punches are written as system
  after their rules are checked, because employees may not insert time cards.
- **One job and wage per person** (`members.job_title`, `wage_cents`) in v1;
  `job_roles` / `member_job_roles` stay in the schema for later.
- **Free plan:** one location, up to 10 people. Paid plans priced per location.

## What the owner has to do (Claude never creates accounts or handles keys)

1. **Supabase** (or Neon): create a project, copy the "Session" pooler
   connection string into `DATABASE_URL`, run `pnpm migrate`. Check daily
   backups are on (Supabase: Database > Backups; Pro plan for point-in-time).
2. **Stripe** (test mode): create products "Esencial" and "Plus" with a
   monthly recurring price each (per location), put the price ids in
   `STRIPE_PRICE_ESSENTIALS` / `STRIPE_PRICE_PLUS`, the test secret key in
   `STRIPE_SECRET_KEY`. Add a webhook endpoint `https://<domain>/api/stripe/webhook`
   for `checkout.session.completed`, `customer.subscription.created|updated|deleted`,
   `invoice.payment_failed`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
   Turn on the Customer Portal (plan changes and cancel).
3. **Resend**: verify the sending domain (SPF, DKIM records), create an API key
   for `RESEND_API_KEY`, set `EMAIL_FROM`.
4. **Twilio** (later, for SMS invites and codes): US numbers need 10DLC brand
   and campaign registration, which takes days to weeks. Start it early.

All variables are listed in `.env.example`.

## Checklist

Auth
- [x] passwordless email sign-in, single use, 15-minute expiry, hashed
- [x] http-only session cookie, `secure` in production, 30 days
- [x] sign out, and sign out everywhere
- [x] roles owner / manager / employee checked in every action and in RLS
- [x] account deletion that deletes (owners must close or hand over the business first; time cards stay as payroll records, contact details erased)
- [ ] SMS sign-in codes (Twilio)
- [ ] Google / Apple sign-in (owner's own developer apps; Apple sign-in is required on iOS if any social login is offered)

Database
- [x] migrations checked in, run by `pnpm migrate`, idempotent
- [x] RLS on every table; tested that a second company gets nothing back
- [x] double booking and double clock-in impossible at the database level, race tested
- [ ] seed script with fake data (e2e creates its own for now)
- [ ] backups confirmed on the hosted database

Payments
- [x] Stripe Checkout for upgrading, Customer Portal for changes and one-click cancel
- [x] webhook signature verified, event ids stored, handlers idempotent (tested with a signed event and its retry)
- [x] subscription state in our database, updated only by webhooks
- [ ] tested against Stripe test mode with real keys

Email and jobs
- [x] transactional email through Resend (outbox file without a key): invite, sign-in link, schedule published
- [ ] jobs (Inngest): late/no-show alerts, forgot to clock out, overtime warning, shift reminders, photo cleanup

Security
- [x] secrets only in env vars; `.env*` ignored; nothing secret reaches client bundles
- [x] input validated with zod on every server action
- [x] authorisation on every read and write, tested with a second company
- [x] rate limits on sign-up, sign-in links (per IP and 5 per person per hour) and invites
- [x] webhooks verify signatures
- [ ] uploads (clock-in photos): not built yet; private bucket when they are
- [x] no user data in URLs or logs (sign-in tokens only in the emailed link)
- [x] dependencies audited: `pnpm audit --prod` reports no known vulnerabilities
- [ ] privacy policy listing processors: hosting, Supabase/Neon, Stripe, Resend, Twilio
- [ ] rate limiter is in memory: move to Postgres or Redis before running more than one server

## Integrations

| integration | API | notes |
| --- | --- | --- |
| Stripe | Checkout, Billing, Customer Portal, webhooks | test mode until /replica-deploy |
| Resend | `POST /emails` | domain verification first |
| Twilio | Messaging | 10DLC registration before US launch |
| Payroll (Gusto Embedded / Check) | partner APIs | needs a partner agreement; CSV export first |
| POS (Square, Toast, Clover) | each POS's public API | after launch |
