# Turno

Scheduling, time clock and timesheets for hourly teams. Multi-tenant SaaS;
web now, iOS/Android (Expo) next. A clean-room rebuild of the core loop of
Homebase-style tools, planned in `replica/` (recon, architecture, schema,
design system).

Status: the core loop runs on Postgres with passwordless sign-in and Stripe
billing in code. See `replica/build-log.md`, `replica/backend.md` and
`replica/features.csv` (6 of 21 must-haves done, 9 partial).

## Run it

Needs Node 22, pnpm and a Postgres 15+ database. Copy `.env.example` to
`apps/web/.env.local` and set at least `DATABASE_URL`.

```bash
pnpm install
pnpm migrate                   # applies db/migrations
TEST_DATABASE_URL=postgres://.../turno_test pnpm test   # wipes that database
pnpm build
TURNO_DEV_LOGIN=1 pnpm --filter @turno/web start -p 3100
```

Open http://localhost:3100, create a business, add people, put shifts on the
week and publish. Without `RESEND_API_KEY`, emails (including sign-in links)
are written to `apps/web/.data/outbox.jsonl`. `/dev/login` signs in as anyone
and only exists when `TURNO_DEV_LOGIN=1`.

End-to-end check with screenshots (needs Playwright installed globally):

```bash
cd apps/web && NODE_PATH="$(npm root -g)" node e2e/slice.mjs http://localhost:3100 ../../replica/clone-screens
```

## Layout

| path | what |
| --- | --- |
| `apps/web` | Next.js app: manager panel (schedule, team, timesheets) and the employee clock page |
| `packages/core` | time zones, overnight shifts, overtime and pay, clock-in rules; pure and tested |
| `db/migrations` | the Postgres schema with row level security |
| `replica/` | the plan: recon, architecture, `schema.sql`, design tokens and specs |

Design tokens live in `replica/design/tokens.json`; after editing run
`pnpm tokens` to regenerate the CSS and Tailwind preset.

## Turno Guías

A marketplace and CRM for tour guides, built on the same core (plan in
`replica/guias/`):

- **Channels:** each business gets a forwarding address; booking emails from
  GuruWalk, Freetour.com, Strawberry Tours, GetYourGuide, Viator and
  Civitatis land in one calendar, with a review queue for unsure ones.
- **Calendar and guide app:** assign a guide per tour, check people in,
  close with tips; private calendar feed for Google, Apple and Outlook.
- **Equipo:** team chat with channels, direct messages and tour cards.
- **Travellers CRM:** one contact across channels, a daily queue of reminders
  and review requests (email, or WhatsApp from the guide's phone).
- **Marketplace:** public search (`/guias`), guide profile and packages
  (`/g/<slug>`), booking with price and plan commission, verified reviews,
  in Spanish and English.
- **Money:** income per channel for the guide (`/ingresos`), subscriptions
  and commissions for Turno (`/admin`).
- **Growth:** waiting list for full tours, overbooking alerts across platforms,
  card tips by QR, photos, questions from travellers with suggested replies,
  gift cards, price ideas from demand, suggested guide assignment and monthly
  guide pay, a weekly summary email, and an installable app with push.
- **Pro:** payouts to the guide's own Stripe account, deposits and no-show fees,
  receipts, yearly and DAC7 reports, group quotes, discount codes for hotel
  partners, city pages for Google, a booking widget, route maps and live
  group location, rain alerts, swaps between guides, an OCTO API for
  GetYourGuide and Viator, CSV import, platform comparison, guide verification
  and referrals.
- **More:** seasonal prices, packages with what they include, review photos,
  WhatsApp messages in Mensajes with automatic answers, a discount for returning
  travellers, tour scripts and training, optional insurance, tour drafts from
  one sentence, several cities per agency, and a sustainable tourism seal.

Still needs your accounts: Google verification for Gmail, Stripe Connect and
prices, a WhatsApp Business number, an Anthropic key for unknown email
formats, and real sample emails per platform. Feature status:
`replica/guias/features.csv`.

## Next

1. Connect the hosted services with your own accounts: see `replica/backend.md`.
2. Remaining must-haves: kiosk with PIN, breaks, availability and time off,
   shift edit/drag, CSV export, background jobs.
3. Expo app for iOS and Android.
