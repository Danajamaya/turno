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

## Next

1. Connect the hosted services with your own accounts: see `replica/backend.md`.
2. Remaining must-haves: kiosk with PIN, breaks, availability and time off,
   shift edit/drag, CSV export, background jobs.
3. Expo app for iOS and Android.
