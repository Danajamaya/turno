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

## Guides, first milestone (2026-11-07)

| ID | status | missing | harder than expected |
| --- | --- | --- | --- |
| channels core | done | Gmail OAuth, AI extraction, APIs | the reader took "10:30" + "3 personas" as 30 people, read words like CANCELLED as booking refs, and trusted `guruwalk.com.evil.io` as GuruWalk; all three fixed and tested |
| G06 calendar | partial | month view, calendar feed | |
| G08/G09 channels and review | partial | Gmail button is a placeholder until Google approves | the review confirmation vanished with its card; now shown on the page |
| G16 income | partial | per-tour breakdown | money showed as "EUR 55.00"; now "55,00 €" with the company's currency |
| G20 platform earnings | partial | commissions arrive with marketplace sales | |
| marketplace (G01–G05) | not started | | |

Verified: 20 core tests (booking email reader included), 16 integration
tests on Postgres (7 new for guides: idempotent import, early cancellation,
review queue, tenant isolation, net income with platform fees and tips,
admin-only earnings, Stripe invoice retry), `next build`, and
`e2e/guides.mjs` in Chromium.

## Design, chat, guide app, sync, marketplace (2026-11-07)

| area | status | missing | harder than expected |
| --- | --- | --- | --- |
| redesign (owner's CRM style) + Inicio | done | dark mode | month KPIs compared a partial month with a whole one; now same days of last month |
| Equipo (team chat) | done | push, files, AI agent | RLS select policy could not see a row being inserted (INSERT … RETURNING); team channels checked inline |
| guide app | done | offline queue, native app | "closed" showed as soon as everyone was checked in; closing now means recording tips |
| calendar sync (.ics) | done | | lines folded at 75 octets per RFC 5545 |
| profile, packages, public booking | done | Stripe Connect online payment, reviews | the Agencia plan was charged Pro's commission; own commission column added |
| Planes | done | real Stripe prices | |

Verified: 20 core + 26 integration tests (guide app, feeds, marketplace incl.
a two-traveller race for the last places), `next build`, and e2e/slice,
e2e/guides, e2e/chat, e2e/finish in Chromium.

## Travellers CRM, messages, reviews, search, English (2026-11-07)

| area | status | missing | harder than expected |
| --- | --- | --- | --- |
| G10/G11 Viajeros | done | tags, consent editing | the same person arrives from several platforms; matched by email, then phone |
| G12/G13 Mensajes and daily queue | partial | WhatsApp Business API (sends through the guide's own WhatsApp for now) | a reminder must not be queued twice when the page is opened again; unique per booking and kind |
| G18 verified reviews | done | guide reply on the page | only the hash of the review link is stored; a link works once |
| G01 search | partial | date filter | "Malaga" must find "Málaga" without a Postgres extension |
| public pages in English | done | guide CRM in English | the booking language now carries through to reminders and review requests |

Verified: 20 core + 31 integration tests, `tsc`, `next build`, and e2e/slice,
e2e/guides, e2e/chat, e2e/finish, e2e/crm in Chromium. e2e/chat now uses
unique texts so it can run again on the same database.

## Ten growth features (2026-11-07)

| feature | status | missing | harder than expected |
| --- | --- | --- | --- |
| 1 waitlist | done | SMS notice | a group of 3 must not be told about 2 free places; first person whose group fits |
| 2 overbooking alert | done | closing on the other platforms (no API) | closed departures also had to block Turno's own booking check, not just the list |
| 3 card tips by QR | partial | Stripe keys; Connect for direct payouts | closing a tour overwrote card tips with the cash amount; tips are now re-split as cash + card |
| 4 photos | done | cropping | trusting the browser's type label would let an SVG through; bytes are checked |
| 5 traveller questions | done | WhatsApp channel | the reply link is rotated on every answer so old emails can't be replayed |
| 6 gift cards | partial | Stripe keys | without payments a pending card was stored before the error; now checked first |
| 7 demand ideas | done | seasonality | |
| 8 guide assignment and pay | done | contracts, payslips | |
| 9 weekly summary | done | WhatsApp delivery | two overlapping runs would both send; the company is claimed first |
| 10 installable app and push | partial | VAPID keys; store apps | `next start` is production, so the tip page needed LINK_SECRET; without it the QR is hidden instead of the page failing |

Verified: 25 core + 42 integration tests (11 new for these features),
`tsc`, `next build`, e2e/slice, guides, finish, crm, chat and the new
e2e/growth in Chromium, and an axe-core WCAG 2.1 AA audit of 96 page and
width combinations (manager, guide and public) with no violations.
