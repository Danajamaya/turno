# Recon map: Turno Guías (marketplace + CRM for tour guides)

Scope: a Preply-style marketplace where travellers find and book a guide, plus
the guide's CRM, which pulls bookings from every platform the guide already
sells on into one calendar. Built inside Turno and reusing its core.
For: freelance guides and small tour operators in Spain and Europe, in
Spanish and English. Competes with Viamki (operator software) and TourDash.
Business model: free plan with a higher commission, paid plan with a lower
one (owner's choice: "both").
Date: 2026-11-07

> Source note: new.viamki.com is blocked from this session. This map comes
> from public help centres, API docs, Capterra and reviews found by search.
> Booking email formats per platform are **not known yet**: real samples
> from the owner's guides are needed before writing exact parsers (see
> "Open questions").

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | GuruWalk: how guides are notified | https://support.guruwalk.com/portal/en/kb/articles/how-am-i-notified-when-i-receive-a-booking | email with booking details and traveller phone, plus app notification; email on change and cancel |
| 2 | GuruWalk: guide role for agencies | https://support.guruwalk.com/portal/en/kb/articles/supplier-panel-key-features | owners can give other guides access |
| 3 | TourDash: GuruWalk integration | https://www.tourdash.app/en/solutions/guruwalk-integration | competitor; says GuruWalk has no open API and parses forwarded emails |
| 4 | GetYourGuide partner API spec | https://github.com/getyourguide/partner-api-spec/wiki/Home | supplier endpoints: availability, reserve, book, cancel; optional push availability |
| 5 | GetYourGuide connectivity partners | https://getyourguide.supply/connectivity/connectivity-partners | most suppliers connect through a reservation system |
| 6 | Viator Supplier API | https://docs.viator.com/supplier-api/technical | real-time availability and booking calls; availability notifications |
| 7 | Ventrata: Viator connection | https://support.ventrata.com/en/article/viator-reseller-connection-5aey1r/ | how a connectivity partner plugs in |
| 8 | Viamki on Capterra | https://www.capterra.co.uk/software/1112430/Viamki | tracks GuruWalk and Freetour.com bookings, auto-assigns guides, commissions, reminders, OCTO |
| 9 | Freetour.com help | https://www.freetour.com/help | flexible booking €1/person fee; €2/person no-show fee |
| 10 | Preply commission model | https://help.preply.com/zh-CN/articles/4171383-preply-commission-model | trial lesson 100% commission; 33% down to 18% with hours taught |
| 11 | Preply for tutors | https://preply.com/en/teach | free profile, reviewed before going live, tutor sets own rate |
| 12 | Strawberry Tours on Trustpilot | https://es.trustpilot.com/review/strawberrytours.com | traveller-side complaints |

## Core loop

A guide connects their platforms once and sees every booking from every
platform (and from their own Turno profile) in one calendar; the traveller
gets reminders and is asked for a review after the tour, and the guide gets
paid and sees what each tour earned.

## Two sides

- **Travellers (public):** search guides by city, date, language and
  interest; guide profile like Preply (video, languages, specialities,
  verified reviews, live availability, price); book a tour or a short "trial
  tour"; pay; message; review.
- **Guides and operators (CRM):** unified calendar, channel connections,
  travellers (contacts), messages by WhatsApp and email with preview, an
  automatic message queue, tours and slots, guide assignment (operators),
  earnings and commissions, reviews, profile editor, billing.

## Screens

Reused from Turno: sign-up, sign-in, team, settings, billing, account (see
`../recon.md` S01–S04, S21–S24). New:

| ID | screen | route | purpose | key components | states |
| --- | --- | --- | --- | --- | --- |
| G01 | Marketplace home | /guias | search by city, date, language, interest | search bar, filters, guide cards | empty, results, no results, loading |
| G02 | Guide profile | /guias/:slug | video, bio, languages, tours, reviews, calendar | video, review list, slot picker | no reviews yet, fully booked, filled |
| G03 | Tour page | /guias/:slug/:tour | itinerary, meeting point, price, slots | map, slot picker, price box | sold out, free tour (tip-based), paid |
| G04 | Checkout | /reservar/:slot | people, names, pay or reserve | form, Stripe Payment Element | paid, free reservation, error |
| G05 | Booking confirmed (traveller) | /reserva/:code | details, add to calendar, message guide, cancel | summary, .ics | confirmed, cancelled, past |
| G06 | Unified calendar (guide) | /calendario | every booking from every channel by day/week | calendar, booking chips coloured by channel | empty, filled, conflict |
| G07 | Slot detail / group list | /calendario/:slot | who is coming, from which platform, contact, check-in | list, check-in toggles, notes | before, during, after tour |
| G08 | Channel connections | /canales | Gmail connect, forwarding address, API, iCal | channel cards, status, last sync | not connected, connected, error, needs review |
| G09 | Inbox review | /canales/revisar | emails the parser was unsure about | email preview, extracted fields form | empty, pending |
| G10 | Travellers (CRM) | /viajeros | contacts from every channel, history, tags | table, filters | empty, filled |
| G11 | Traveller detail | /viajeros/:id | bookings, messages, notes, consent | timeline | |
| G12 | Messages | /mensajes | WhatsApp and email threads, templates with preview | thread list, composer, preview | |
| G13 | Automations queue | /mensajes/cola | reminders and review requests queued for today | queue list, approve/skip | empty, pending, sent |
| G14 | Tours | /tours | the guide's tours: description, meeting point, capacity, price model | list, editor | |
| G15 | Availability | /tours/:id/horarios | recurring slots, exceptions, capacity per slot | weekly pattern, calendar | |
| G16 | Earnings | /ingresos | per tour and channel: people, tips declared, fees, payouts | charts, table | |
| G17 | Public profile editor | /perfil | photo, video, bio, languages, specialities, preview | form, live preview | draft, in review, published |
| G18 | Reviews | /resenas | reviews received, reply, request | list | |
| G19 | Guide assignment (operators) | uses Turno S05 | assign guides to slots, like shifts | schedule grid | |
| G20 | Turno earnings (platform admins) | /admin | subscriptions and commissions by month, companies, bookings handled, marketplace sales | stat cards, monthly table | no income yet, filled |

## Money flow (owner's ask, 2026-11-07)

Traveller → sale → booking → calendar, with time and price at each step:

- **Sold on Turno:** traveller pays the price (Stripe Connect) → Turno keeps
  the plan's commission (free plan higher, paid plan lower) → the guide gets
  the rest after the tour. Commission lands in `platform_ledger`.
- **Sold on another platform:** the booking arrives by email or API with time,
  people and, when the platform sends it, price; that platform's fee per
  person is set by the guide; tips are added when closing the tour. Turno
  takes no commission on these: it earns the guide's subscription.
- **Guide sees** income per channel and month (G16). **Turno sees** its own
  subscriptions and commissions (G20).

## Flows

```
F11 Guide connects GuruWalk (no API)
    G08 -> "Conectar con Gmail" (one click, OAuth)  or  copy forwarding address + filter
    -> next GuruWalk email -> parsed -> G06 shows the booking
    edge: email format unknown (-> G09 review), duplicate email, cancellation email, change email

F12 Guide connects GetYourGuide / Viator
    G08 -> API: requires Turno to be a certified connectivity partner (OCTO);
    until then, email forwarding works the same as F11

F13 Traveller books a guide on Turno
    G01 -> G02 -> G03 -> G04 -> G05
    happy path clicks: ~6
    edge: slot fills while paying, time zone of traveller vs tour city, free tour (no payment)

F14 Day of the tour
    G13 reminder sent the day before -> G07 check-in at the meeting point -> after: review request queued

F15 Operator assigns guides
    G06 -> Turno schedule (S05) -> guide sees it in Turno's employee app (S15)

F16 Guide gets paid (Turno bookings)
    traveller pays -> Stripe Connect holds -> after the tour, payout minus commission -> G16
```

## Components

New on top of `../design/components.md`: guide card, rating stars with
count, video player with poster, language chips, channel badge (one colour
per platform), booking chip (calendar), slot picker, check-in toggle,
message composer with preview, template picker, consent badge.

## Inferred data model (new entities)

```
GuideProfile   member_id, slug, headline, bio (es/en), languages[], specialities[], city,
               video_url, photo_path, status (draft|in_review|published), rating_avg, rating_count
Tour           company_id, guide_member_id?, title (es/en), description, meeting_point, lat, lng,
               duration_min, capacity, price_model (free_tip|fixed|per_group), price_cents, currency
TourSlot       tour_id, start_at, end_at, capacity, assigned_member_id, status (open|full|cancelled)
Channel        company_id, kind (turno|guruwalk|freetour|strawberry|getyourguide|viator|civitatis|other),
               method (gmail_oauth|forward|api|ical|manual), status, last_sync_at, settings jsonb
InboundEmail   company_id, channel_id?, message_id (unique), from, subject, received_at,
               raw_path, parser, confidence, status (parsed|needs_review|ignored|failed)
Booking        company_id, slot_id?, channel_kind, external_ref, status (confirmed|cancelled|changed|no_show|attended),
               people, traveller_id, starts_at, tour_name_raw, amount_cents?, source_email_id?
               unique (company_id, channel_kind, external_ref)
Traveller      company_id, name, email?, phone?, language?, country?, consent_marketing, first_seen_channel
Message        company_id, traveller_id, channel (whatsapp|email), direction, body, status, scheduled_for
Review         booking_id, rating 1-5, text, reply, verified (true only for Turno bookings)
Payout         company_id, stripe_transfer_id, amount_cents, fee_cents, period
evidence: sources 1–11; confidence: high for Booking/Channel/InboundEmail (how competitors work),
medium for marketplace entities (Preply pattern), guess for Payout details.
```

## Feature matrix

See `features.csv` in this folder.

## Out of scope (cannot or should not be cloned)

- **Logging into GuruWalk, Freetour or Strawberry with the guide's password
  from our servers.** Against their terms, breaks with every redesign, can get
  the guide's account closed, collides with 2FA, and makes us liable for
  stored passwords. The browser extension (guide's own browser, guide's own
  session) is kept as a later, optional channel.
- Their traveller networks, reviews and content: we import a guide's own
  bookings, never their listings or reviews.
- Certified API access to GetYourGuide and Viator is a partnership, not code:
  apply as an OCTO connectivity partner; email covers them meanwhile.

## Size

New screens 19, flows 6, entities 10. Hard parts:

1. Parsing booking emails from six platforms in two languages reliably, with
   cancellations and changes, idempotently, and a review queue for the rest.
2. Gmail OAuth with the restricted `gmail.readonly` scope: Google requires a
   security assessment (CASA) before public use. Weeks, and a fee.
3. EU marketplace rules: Stripe Connect payouts, VAT on commissions, DAC7
   reporting of guide income, GDPR for traveller data imported from emails.

Size: L. First milestone (unified calendar with the email channel) is M.

## Open questions for the owner

1. Forward 3–5 real booking emails per platform (new booking, change,
   cancellation), in Spanish and English, with personal data blurred or not
   (they stay private in the repo's test fixtures only if anonymised).
2. Commission and plan prices for "both" (e.g. free plan 15–20%, paid plan
   €X/month with 5–8%).
3. Brand name: "Turno Guías" or its own name and domain.
