# Architecture: working name "Turno" (a rebuild of Homebase's scheduling and time clock)

The name is a placeholder until `/replica-brand`. Reads `recon.md` (S-IDs,
F-IDs) and `features.csv`. Decisions were made with defaults; the owner asked
not to be asked further questions.

## Stack

| layer | choice | why |
| --- | --- | --- |
| web | Next.js 15 (App Router) + TypeScript | one codebase for the manager web app, the marketing site and the API routes |
| styling | Tailwind, tokens from `/replica-design` | shared token file with the mobile app |
| mobile | Expo (React Native) + Expo Router, one app for employees and managers | iOS + Android from one TypeScript codebase; EAS builds for the stores; camera, location, push, SQLite all first-party |
| kiosk | the same Expo app in a locked "kiosk mode" on a tablet | no third app to maintain; Guided Access / screen pinning keep it locked |
| monorepo | pnpm workspaces + Turborepo: `apps/web`, `apps/mobile`, `packages/core`, `packages/db` | time math, OT rules and validation (zod) shared by web, mobile and server |
| database | Postgres on Supabase | managed, row level security, realtime and storage in one place |
| ORM | Drizzle | typed SQL that stays close to `schema.sql`; migrations in git |
| auth | Own passwordless auth: email link now, SMS code next (changed from Supabase Auth, see `backend.md`) | hourly staff often have no work email; no passwords to reset; no vendor lock-in |
| payments | Stripe Checkout + Billing, per-location quantity | matches the per-location pricing the market expects |
| email | Resend | simple API, good deliverability |
| SMS | Twilio Messaging (OTP is sent by Supabase via Twilio too) | invites and schedule alerts for staff without the app |
| push | Expo Push service | one API for APNs and FCM |
| jobs | Inngest | retries, schedules and idempotency keys without running a worker |
| files | Supabase Storage, private bucket, signed URLs | clock-in photos are personal data |
| hosting | Vercel (web), EAS (mobile builds and OTA updates) | zero ops at zero users |
| errors | Sentry (web + mobile) | crashes on staff phones are otherwise invisible |

One database, one API (Next.js route handlers and server actions), no
microservices.

## Schema

Tables: 22 (see `replica/schema.sql`, also the first migration). Access rules:
Postgres RLS keyed on `company_id`, which every tenant table carries. Helpers
`auth_member_role()`, `auth_member_id()`, `auth_is_manager()`. Managers read and
write their company; employees read company reference data, published shifts,
and only their own availability, time off, time cards and notifications.
Clock punches, publishing and approvals go through server routes with the
service role, because they enforce rules (geofence, early clock-in, OT) the
client must not be able to skip.

Verified on Postgres 16: the schema loads cleanly; overlapping shifts for one
person are rejected (`no_double_booking` exclusion constraint); a second open
time card is rejected (`time_cards_one_open`); an employee cannot see
unpublished shifts; a user from another company sees zero rows.

Key tables: `companies`, `locations`, `profiles`, `members`,
`location_members`, `invites`, `job_roles`, `member_job_roles` (wage in cents),
`schedule_weeks`, `shifts`, `shift_templates`, `availabilities`,
`time_off_requests`, `shift_trades`, `kiosk_devices`, `time_cards`, `breaks`,
`time_card_edits`, `notifications`, `push_tokens`, `subscriptions`,
`stripe_events`.

## API

All routes under `/api/v1`, JSON, auth by Supabase JWT (bearer from mobile,
cookie on web). Kiosk routes auth by a device token. "mgr" = owner or manager.

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST /companies | create company, first location, owner member, free subscription | signed-in user | name, industry, location {name, address, timezone} | company, location | F01 |
| POST /locations | add a location (checks plan limit) | owner | name, address, timezone, lat, lng | location | F01 |
| PATCH /locations/:id | rules: geofence, OT, breaks, pay period | mgr | partial location | location | F01 |
| GET /members?location= | team list | mgr | filters | members[] | F01 |
| POST /members | add people, send invites | mgr | [{name, phone/email, role, job_roles, wage}] | members[] | F01 |
| POST /members/import | CSV import, row-level errors | mgr | file | {created, errors[]} | F01 |
| PATCH /members/:id | edit role, wage, archive | mgr | partial | member | F01 |
| POST /members/:id/pin | set or reset kiosk PIN | mgr, or self | pin | 204 | F04 |
| POST /invites/:token/accept | link the signed-in user to the member | invitee | token | member | F03 |
| GET /schedule?location=&week= | week with shifts, time off, availability, labor cost | mgr (all), employee (published) | location, week_start | week, shifts[], conflicts[], cost | F02, F03 |
| POST /shifts | create shift(s), returns conflicts as warnings | mgr | shift[] | shifts[], conflicts[] | F02 |
| PATCH /shifts/:id | move, resize, reassign | mgr | partial | shift, conflicts[] | F02 |
| DELETE /shifts/:id | delete | mgr | - | 204 | F02 |
| POST /schedule/copy | copy a previous week or apply a template | mgr | from_week or template_id, to_week | shifts[] | F02 |
| POST /templates | save a week as a template | mgr | week_id, name | template | F02 |
| POST /schedule/publish | publish week, notify affected people only | mgr | week_id, notify {channels, members} | week, notified count | F02, F03 |
| GET /me/shifts?from=&to= | my published shifts | employee | range | shifts[] | F03 |
| GET /open-shifts | open shifts I can take (by job role) | employee | location | shifts[] | F07 |
| POST /open-shifts/:id/claim | claim; manager approval if the location requires it | employee | - | shift or trade | F07 |
| POST /trades | offer my shift to someone or to anyone | employee | shift_id, to_member_id? | trade | F07 |
| POST /trades/:id/accept | colleague accepts | employee | - | trade | F07 |
| POST /trades/:id/decide | approve or deny; on approve reassign the shift | mgr | approve bool | trade, shift | F07 |
| GET /me/availability, PUT /me/availability | read or replace my weekly availability | employee | rows[] | rows[] | F09 |
| POST /availability/:id/decide | approve or deny a change | mgr | approve bool | row | F09 |
| POST /time-off | request time off | employee | start, end, all_day, reason | request | F06 |
| POST /time-off/:id/decide | approve or deny | mgr | approve bool | request | F06 |
| GET /requests?status=pending | inbox of all pending requests | mgr | filters | items[] | F06, F07, F09 |
| POST /clock/in | clock in from phone: geofence, early clock-in, open-card checks | employee | lat, lng, client_punch_id, photo? | time_card | F05 |
| POST /clock/out, /clock/break/start, /clock/break/end | same checks | employee | client_punch_id, lat, lng | time_card | F05 |
| POST /kiosk/pair | pair a tablet to a location | mgr | location_id, name | device token (once) | F04 |
| POST /kiosk/punch | identify by PIN, punch, upload photo; replays offline punches idempotently | kiosk device | pin, action, client_punch_id, at, photo | member name, time_card | F04 |
| GET /timesheets?location=&period= | totals per person: regular, OT, breaks, cost, flags | mgr | location, period | rows[] | F08 |
| GET /me/timesheet?period= | my hours | employee | period | rows[] | F08 |
| PATCH /time-cards/:id | fix punches; writes `time_card_edits` | mgr | fields, reason | time_card | F08 |
| POST /time-cards | add a missing card | mgr | member, in, out, reason | time_card | F08 |
| POST /timesheets/approve | approve all or selected cards in a period | mgr | ids[] or period | count | F08 |
| GET /timesheets/export.csv | payroll CSV (generic, Gusto, ADP column sets) | mgr | period, format | text/csv | F08 |
| GET /dashboard | today: who is in, late, labor vs target | mgr | location | cards | S20 |
| GET /notifications, POST /notifications/read | inbox | anyone | - | items[] | S22 |
| POST /push-tokens | register device for push | anyone | expo_token, platform | 204 | S22 |
| POST /billing/checkout | Stripe Checkout session for a plan | owner | plan, locations | url | F10 |
| POST /billing/portal | Stripe customer portal | owner | - | url | F10 |

Webhooks in: Stripe (`checkout.session.completed`,
`customer.subscription.updated|deleted`, `invoice.payment_failed`), verified by
signature, deduplicated in `stripe_events`. Twilio delivery status (optional).

Webhooks out: none in v1. A CSV export and, later, a payroll provider API
(Gusto Embedded or Check) replace the original's built-in payroll.

Jobs (Inngest):

| job | schedule | does |
| --- | --- | --- |
| notify.schedule-published | on event | push, then SMS fallback to people without the app; dedupe by (week, member, version) |
| alert.late-or-no-show | every 5 min | shift started N min ago and no open card: alert managers once |
| alert.forgot-clock-out | every 15 min | card open > shift end + 2 h, or > 16 h: remind employee, flag for manager |
| alert.approaching-overtime | hourly | weekly minutes near threshold: alert managers |
| reminder.shift-upcoming | every 15 min | push 1 h before a shift |
| timesheets.period-close | daily per location timezone | at period end, flag unapproved cards to managers |
| cleanup.invites | daily | expire old invites |
| cleanup.photos | daily | delete clock-in photos older than the retention setting (default 90 days) |

## The parts that bite

- **Time zones:** store `timestamptz` UTC; every location has an IANA zone;
  weeks, pay periods and "today" are computed in the location's zone with
  `date-fns-tz` in `packages/core`, never the phone's. Overnight shifts belong
  to the day they start. DST nights make a shift 7 or 9 h; compute durations
  from instants, not wall clock.
- **Overtime:** federal weekly 40 h by default; daily OT (California) and
  breaks rules are per-location data (`ot_daily_min`, `break_rules`). Start with
  federal + CA; add states as customers arrive. Pure functions with unit tests.
- **Idempotency:** every punch carries a client-generated `client_punch_id`
  (unique) so an offline kiosk or a double tap replays safely; Stripe events
  are deduped by id; notifications by `dedupe_key`.
- **Races:** double booking is an exclusion constraint; double clock-in is a
  partial unique index; one live trade per shift is a partial unique index;
  two managers editing the same week: last write wins per shift, with Supabase
  Realtime pushing changes to open schedule grids.
- **Offline:** the kiosk and phone keep a SQLite queue of punches with device
  time and replay them; the server trusts device time only within a tolerance
  and flags the card otherwise.
- **Location and photos:** geofence is a check, not proof (GPS can be
  spoofed): store the coordinates and flag outside-fence punches instead of
  hard-blocking by default. Photos and coordinates are personal data: private
  bucket, retention, disclosed in the privacy policy; biometric laws (Illinois
  BIPA) mean no face matching.
- **Multi-tenancy:** RLS on every table plus `company_id` on every row;
  service-role code paths always filter by the caller's company explicitly. A
  test suite runs every route as a member of company A against company B data.
- **Rate limits:** PIN entry is brute-forceable (10 000 combos): lock the
  kiosk member after 5 wrong tries, rate-limit by device. SMS costs money:
  cap invites and alerts per company per day.
- **Deliverability:** SMS needs 10DLC registration in the US before launch;
  emails need SPF/DKIM on the sending domain.
- **Mobile store review:** location in the background is not needed (punch is
  foreground only), which keeps App Store review simple.
- **Deletion / GDPR:** archiving a member keeps time cards (payroll records
  must be kept ~3 years under FLSA) but deletes photos and coordinates on request.

## Build order

1. **Vertical slice** (web only, ugly): sign up, create company and location,
   add an employee, put a shift on the week grid, publish, employee clocks in
   and out on mobile web, manager sees the timesheet.
   Screens S01, S02, S05, S06, S16, S17. Tables companies, locations,
   profiles, members, location_members, schedule_weeks, shifts, time_cards.
   Routes POST /companies, POST /members, GET /schedule, POST /shifts,
   POST /schedule/publish, POST /clock/in|out, GET /timesheets.
2. **Must-haves** (`features.csv`, by area):
   - team: invites by SMS/email, roles, job roles and wages, PIN (S03, S04, S24)
   - scheduling: drag and drop, copy week, templates, conflicts, availability,
     time off, notifications (S05–S10, S15, S22)
   - time clock: Expo app clock in/out and breaks; kiosk mode with PIN (S13–S16)
   - timesheets: edits with audit, approval, OT, CSV export (S17–S19)
   - billing: Stripe plans and limits (S23)
3. **Should-haves:** open shifts, trades, labor cost vs target, geofence,
   kiosk photo, early clock-in and OT alerts, break rules, late alerts,
   time-off rules; native store builds.
4. **Could-haves:** auto-schedule, labor reports; then messaging, hiring,
   onboarding docs as the next slices.
5. **Fixes from `/replica-entrepreneur`:** once it has read Homebase's reviews.
