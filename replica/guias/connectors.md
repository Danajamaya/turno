# Channel connectors: unified design

Every way a booking can arrive ends in the same pipeline, so adding a
platform or a method never touches the calendar.

```
 Gmail (OAuth, one click) ─┐
 Forwarding address ───────┤→ InboundEmail ─→ parser registry ─┐
                           │                   (platform rules, │
                           │                    then AI)        │
 iCal feed ───────────────┤                                    ├→ normalise ─→ upsert Booking ─→ calendar, CRM, queue
 Supplier API / OCTO ──────┤──────────────────────────────────→ │   (idempotent by channel + external ref)
 Turno marketplace ────────┘──────────────────────────────────→ ┘
                                         low confidence ─→ review queue (G09)
```

## Methods, unified

The guide sees one "Conectar" card per platform and picks how:

1. **Conectar con Gmail** (default): Google OAuth with `gmail.readonly`. We
   only query messages from known platform senders (a Gmail search filter),
   store the message id to never import twice, and poll every few minutes
   plus Gmail push when available. Requires Google's restricted-scope
   verification (CASA) before more than 100 users: start it early.
2. **Reenvío** (no Google access): each company gets an address
   `r-<token>@<inbound domain>`; the guide adds a Gmail filter that forwards
   the platforms' emails. Inbound mail arrives by webhook (Resend, Postmark
   or Cloudflare Email Routing) with a shared secret.
3. **API**: GetYourGuide and Viator via their supplier APIs once certified;
   OCTO for connectivity partners. Until then their emails go through 1 or 2.
4. **iCal**: any platform that exposes a feed.

All four write the same `Booking` row. The email methods share one parser.

## Parsing

- Platform detected by sender domain and headers, never by the guide's word.
- Platform rules (deterministic, tested against real anonymised samples)
  first. They extract: kind (new, change, cancel), external ref, tour name,
  date and time with the tour city's time zone, people, traveller name,
  phone and email when present, amount when present.
- Unknown format or missing fields: AI extraction (Anthropic API) into the
  same schema, with a confidence score. Below the threshold, or if the
  date is in the past or the people count is implausible, the email goes
  to the review queue instead of the calendar.
- Idempotent: `unique (company_id, channel, external_ref)`. A cancel email
  for an unknown ref is kept and applied if the booking shows up later.

## Privacy

Emails contain travellers' personal data. Stored only what a booking needs;
raw email kept 30 days for review, then deleted. Gmail access is read-only,
limited to platform senders, revocable from G08, and Google's Limited Use
policy applies (no ads, no model training, no humans reading except review
with the guide's consent).
