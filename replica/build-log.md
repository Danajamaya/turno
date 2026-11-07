# Build log

| ID | date | status | missing | harder than expected |
| --- | --- | --- | --- | --- |
| shell | 2026-10-30 | done | Supabase data layer (dev JSON store with the same function signatures) | Tailwind preset replaced the spacing scale with index keys; switched to px/4 keys |
| S01/S02 | 2026-10-30 | done | real auth (SMS code / email link), CSV import | Next server pages cannot pass render-function children to client forms |
| S03 | 2026-10-30 | partial | edit, archive, PIN, invite delivery | table overflowed at 390px inside the grid (min-width) |
| S05/S06 | 2026-10-30 | partial | drag, edit, by-role view, templates, time-off/availability conflicts | overnight shifts and DST: covered by core tests |
| S08 | 2026-10-30 | partial | sending notifications (job in replica-backend) | |
| S15/S16 | 2026-10-30 | partial | breaks, geofence, photo, offline queue, native app | |
| S17 | 2026-10-30 | partial | edit punches, audit log, CSV export (S19) | |
| S09, S21 | 2026-10-30 | stub | everything | |

Verified: `pnpm test` (core time/pay/clock, 12 tests), `next build`, and
`apps/web/e2e/slice.mjs` running the whole loop in Chromium (signup, add two
people, missing-contact rejected, create shift, double booking rejected,
publish, employee clocks in and out on a 390px phone, manager approves) with
no console errors and no horizontal scroll at 390px. Screenshots in
`replica/clone-screens/`.

## Backend (2026-10-30)

| area | status | missing | harder than expected |
| --- | --- | --- | --- |
| Postgres data layer | done | seed script | `members.reachable` blocked erasing contact details on account deletion; constraint now allows it for archived people |
| auth | done (email) | SMS codes, Google/Apple | mail scanners can spend one-time links: the link opens a page whose button spends it |
| billing | built, offline-tested | real Stripe test-mode run | |
| email | done | Resend domain setup | |
| jobs | not started | Inngest jobs | |

Verified: `TEST_DATABASE_URL=... pnpm test` (12 core + 9 backend tests),
`next build`, `e2e/slice.mjs` against Postgres including sign-out and sign-in
with the emailed link, `pnpm audit --prod` clean.
