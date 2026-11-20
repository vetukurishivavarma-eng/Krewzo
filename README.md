# Krewzo — hyperlocal daily-wage labour marketplace

Two apps, one backend, one shared rulebook.

```
krewzo/
├── shared/            pricing matrix, skill tiers, trade icons, colour-pin tokens, booking state machine, Haversine
├── backend/           Express REST + Socket.io, SQLite (node:sqlite, zero native deps)
│   ├── src/db.js          schema
│   ├── src/service.js     bookings, escrow ledger, geo-dispatch, handshake verify, passbook, NBFC credit score
│   ├── src/handshake.js   signed 3-mode handshake tokens (QR / colour-pin / OTP)
│   ├── src/whatsapp.js    WhatsApp bridge for workers without the app
│   ├── src/app.js         routes, sockets, GST invoice
│   ├── src/seed.js        5 verified workers + demo customer
│   └── test/loop.test.js  full-loop test over real HTTP + sockets
├── krewzo-partner/    worker app (React + Vite + Tailwind), port 5174
├── krewzo-customer/   customer app (React + Vite + Tailwind + Leaflet), port 5173
└── scripts/dev.mjs    runs all three
```

## Run

Needs Node 22.13+.

```bash
npm install
npm run dev        # backend :4000, customer :5173, partner :5174
npm test           # backend full-loop tests
```

The database seeds itself on first start (`backend/data/krewzo.db`). All PINs are `1234`.

| Who | Phone | Notes |
|---|---|---|
| Customer | 9999999999 | |
| Ramu | 9000000001 | Tier 1, helper/loading, Telugu |
| Lakshmi | 9000000002 | Tier 1, cleaning/garden, Telugu |
| Suresh | 9000000003 | Tier 2, mason/painter, Telugu |
| Imran | 9000000004 | Tier 3, electrician/plumber, Hindi |
| Venkatesh | 9000000005 | Tier 3, carpenter/painter, English |

**Demo loop:** open the customer app and the partner app (logged in as Ramu) side by side → book a *General Helper* → Ramu's phone rings → ACCEPT → *I have arrived* → customer's START sheet pops → worker taps the colour + 2 digits (or scans the QR) → timer runs → customer taps *show finish code* → worker verifies → escrow unlocks, worker sees the payout screen, customer sees the receipt.

Camera scanning needs HTTPS or `localhost`. To test on phones over LAN, serve through an HTTPS tunnel (e.g. `cloudflared tunnel --url http://localhost:5174`).

## Booking state machine

```
SEARCHING ─accept→ ASSIGNED ─arrive→ ARRIVED ─START handshake→ IN_PROGRESS ─END handshake→ COMPLETED ─auto→ PAID_OUT
    │                  │ └─worker "can't come"→ SEARCHING (re-dispatched)
    └──── cancel ──────┴→ CANCELLED (escrow REFUNDED)
```
Verifying START while still ASSIGNED records ARRIVED first, because the worker has to be at the door to scan the code. COMPLETED → PAID_OUT runs in the same DB transaction as the escrow release.

## Schema (SQLite)

- **users**: id, phone, name, pin_hash, account_type (PERSONAL|BUSINESS), gstin, business_name, addresses (JSON `[{label,lat,lng,address}]`)
- **workers**: id, phone, name, pin_hash, photo_url, kyc_verified, skill_tier, trade_tags (JSON), is_online, lat, lng, rating, rating_count, total_earnings, upi_id, language
- **booking_groups**: one checkout = one group (B2B crews). id, customer_id, account_type, gstin, business_name, worker_count, amount_total, payer_upi, payment_ref
- **bookings**: one **ticket per worker**: id, group_id, customer_id, worker_id, skill_tier, trade_tag, worker_count, booking_mode, scheduled_at, duration, lat, lng, address, addons, base_wage, addons_total, platform_fee, gst_amount, insurance_fee, worker_payout, escrow_total, start_handshake (JSON), end_handshake (JSON), handshake_fails, status, customer_rating, timestamps per state
- **escrow_ledger**: id, booking_id, amount_held, worker_payout, platform_fee (fee + GST + insurance), status (HELD|RELEASED_UPI|REFUNDED), tx_ref
- **job_offers**: booking_id, worker_id, status (OFFERED|SKIPPED|ACCEPTED|EXPIRED|RELEASED), distance_km. Prevents re-offering skipped jobs and feeds the credit score.

## Pricing (`shared/index.js`)

Wage = tier rate × (hours / 2): ₹299 / ₹399 / ₹599 per 2 h. Add-ons: toolkit ₹50 and ladder ₹100, paid to the worker. Platform fee = 10% of wage (min ₹29), plus 18% GST on the fee only. Insurance ₹19 per worker (optional). The worker always gets 100% of wage + add-ons.

## API (all under `/api`)

| Method | Path | Who |
|---|---|---|
| POST | /auth/customer, /auth/worker | phone + 4-digit PIN (new worker → registers, KYC pending) |
| POST | /bookings | customer: create + simulated UPI → escrow HELD → SEARCHING → dispatch |
| GET | /bookings, /groups/:id, /groups/:id/invoice | customer |
| POST | /bookings/:id/cancel, /rate | customer |
| GET | /workers/me/home, /workers/me/passbook | worker |
| PATCH | /workers/me `{is_online, lat, lng, language}` | worker |
| POST | /bookings/:id/accept, /skip, /release, /arrive | worker |
| POST | /bookings/:id/verify-handshake `{method: QR\|COLOR_PIN\|OTP, payload}` | worker |
| GET | /workers/:id/credit-passbook | NBFC (`x-api-key: $NBFC_API_KEY`) or the worker |
| POST | /admin/workers/:id/kyc | ops (`x-admin-key: $ADMIN_KEY`) |
| GET/POST | /webhooks/whatsapp | Meta Cloud API (or `{from, text}` relay) |

Socket events: `job:offer`, `job:taken`, `booking:update`, `worker:location`.

## WhatsApp bridge

Workers text `1` (on duty), `2` (off), `ACCEPT`, `SKIP`, `ARRIVED`, `OTP 1234` (or just the 4 digits), `4` (earnings), or share a 📍 location. Replies come back in the worker's language. Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, and `WHATSAPP_APP_SECRET` (to check signatures). Without them, outgoing messages are logged and the webhook replies inline.

## Env

`PORT`, `KREWZO_DB`, `KREWZO_SECRET` (generated and stored in the DB if unset), `NBFC_API_KEY`, `ADMIN_KEY`, the WhatsApp vars above, and `VITE_HELPLINE` (the partner app's SOS number, which **must** be set before launch).
