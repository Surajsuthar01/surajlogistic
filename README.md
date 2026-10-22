# SurajLogistic

One platform for Indian logistics: **trucking (TMS), courier/parcel, a freight load board with return-load matching, and warehousing** — on one shipment record, with an AI control tower and a copilot that answers in English or Hinglish.

Built to run Suraj Logistic's own operations first, then to sell as SaaS to other transporters and 3PLs (multi-tenant from day one).

| Screen | What it does |
| --- | --- |
| Control tower | Live network map of trucks and lanes, KPIs, exceptions ranked by money at risk, revenue, live activity |
| Shipments | Book Courier / PTL / FTL with an instant dynamic quote, AWB numbers, status timeline, OTP proof of delivery, e-way bill |
| Trips | Plan a trip (truck + driver + shipments with a capacity check), live GPS, live ETA, profit after diesel and tolls |
| Fleet & drivers | Vehicles, documents (insurance, fitness, permit, PUC) with expiry alerts, VAHAN check, drivers and licence expiry |
| Load board | Post loads, bid, accept; return-load finder ranks loads near an empty truck by ₹ per km |
| Warehouse | SKUs per client, bins, receive/dispatch with stock checks, low-stock alerts |
| Billing | Delivered-but-unbilled shipments per customer → GST invoice with FY numbering, sent/paid tracking |
| Driver app | Mobile, Hindi first: today's trip, share location, out-for-delivery, OTP delivery, COD to collect |
| Tracking page | Public, no login, no personal data; English/Hindi |
| Suraj Copilot | "Jaipur ke paas kaun se truck khali hain?", "Indore se Mumbai 5 ton ka bhada kitna?", delays, COD, risky parcels, expiring documents, revenue |

## Run it

### 1. Quickest: no install of Postgres (embedded database)

Needs Node.js 20 or newer.

```bash
npm install
npm run dev:api     # API on http://localhost:4000, embedded Postgres in memory, demo data loaded
npm run dev:web     # web app on http://localhost:5173 (talks to the API through a proxy)
```

To keep data between restarts, create `apps/api/.env` with `DATABASE_URL=pglite:./.data` (see `.env.example`).

### 2. Docker (Postgres + API + web)

```bash
cp .env.example .env    # set JWT_SECRET and POSTGRES_PASSWORD
docker compose up --build
```

Open http://localhost:8080.

### 3. Demo in one HTML file (no server at all)

```bash
npm run build:demo      # → apps/web/dist-demo/index.html
```

Open the file in a browser. Everything runs on sample data in the browser — good for showing customers. Changes reset on reload.

### Demo logins (password `demo1234`)

| Email | Role |
| --- | --- |
| admin@surajlogistic.in | Owner / admin |
| ops@surajlogistic.in | Dispatcher |
| driver@surajlogistic.in | Driver (opens the driver app) |
| warehouse@surajlogistic.in | Warehouse staff |
| shipper@shreetextiles.in | Customer (sees only their own shipments) |

All demo companies, people, GSTINs and vehicle numbers are made up.

## How it is built

```
packages/core   Shared domain + AI engines (TypeScript, no dependencies)
                pricing · ETA · RTO risk · return-load matching · route optimiser (2-opt)
                carbon · copilot intents and answers · dashboard/exceptions · demo data
apps/api        Fastify 5 API · Drizzle ORM · PostgreSQL (or embedded PGlite) · JWT + roles
                live events over Server-Sent Events · GPS simulator · integration adapters
apps/web        React 19 + Vite + Tailwind 4 · control tower, ops screens, driver app, tracking
```

- **One API, many tenants.** Every table has `org_id`; every query filters by it. Tests prove one company cannot see another's data.
- **Same engines everywhere.** The API, the browser demo and the tests all call `@suraj/core`, so a price or an ETA is the same wherever you see it.
- **Database.** `DATABASE_URL=postgres://…` uses PostgreSQL; `pglite:./folder` or nothing uses embedded Postgres. Migrations live in `apps/api/drizzle` and run on start. After changing `schema.ts`, run `npm run db:generate`.

### Main API routes

| Method | Path | Who |
| --- | --- | --- |
| POST | `/api/auth/register`, `/api/auth/login` | anyone |
| GET | `/api/me` | logged in |
| POST | `/api/quotes` | logged in |
| GET/POST | `/api/shipments` | staff, customer (own) |
| GET | `/api/shipments/:id` | staff, customer (own) |
| POST | `/api/shipments/:id/status` | staff, driver (own trip) — DELIVERED needs the OTP |
| POST | `/api/shipments/:id/ewaybill` | staff |
| GET | `/api/track/:awb` | public |
| GET/POST/PATCH | `/api/vehicles`, `/api/drivers` | staff |
| POST | `/api/vehicles/:id/verify` | staff (VAHAN via ULIP, mock) |
| GET/POST | `/api/trips`; POST `/api/trips/:id/start`, `/ping`, `/complete` | staff, driver (own trip) |
| POST | `/api/routes/optimize` | staff |
| GET/POST | `/api/loads`; POST `/api/loads/:id/bids`, `/accept` | staff |
| GET | `/api/vehicles/:id/return-loads` | staff |
| GET/POST | `/api/facilities`, `/api/inventory`; POST `/api/inventory/:id/move` | staff, warehouse |
| GET/POST/PATCH | `/api/customers`, `/api/invoices`; GET `/api/billing/unbilled` | staff |
| GET | `/api/driver/me` | driver |
| GET | `/api/dashboard`; POST `/api/copilot` | staff |
| GET | `/api/stream?token=` | logged in (Server-Sent Events) |
| PATCH | `/api/org/settings` | admin (diesel price, GST rates, modules) |

## Tests

```bash
npm test                 # 25 engine tests + 18 API tests on embedded Postgres
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/empty_db npm test -w @suraj/api   # same API tests on real PostgreSQL
npm run typecheck
```

CI (`.github/workflows/ci.yml`) runs typecheck, both test suites (embedded and real PostgreSQL 16), both web builds and both Docker builds.

## What is real and what is a stand-in

| Part | Today | To go live |
| --- | --- | --- |
| Pricing, ETA, RTO risk, matching, routing, carbon | Working rules-based engines | Tune rate cards per customer; train ETA/RTO models on your own history |
| GPS | Driver phone location + a simulator for demos | GPS devices or FASTag trails via ULIP; turn `SIMULATE=0` |
| E-way bill | Mock generator (12-digit number, validity 1 day per 200 km) | Contract a GST Suvidha Provider (GSP) and swap the adapter in `apps/api/src/integrations` |
| VAHAN / Sarathi checks | Mock using saved documents | Register on ULIP (goulip.in), sign the NDA, swap the adapter |
| WhatsApp / SMS | Messages logged to an outbox | A WhatsApp Business API provider |
| Copilot | Deterministic answers from live data, works offline | Optional: set `ANTHROPIC_API_KEY` to have Claude rewrite answers (numbers still come from your data) |
| Payments, finance | Not built | Licensed payment gateway and NBFC partners only |

## Before real customers use it

- Set a strong `JWT_SECRET` (32+ characters) and a real Postgres with backups.
- Put the API behind HTTPS; set `CORS_ORIGIN` and `PUBLIC_URL`.
- Run with `TZ=Asia/Kolkata` (the Docker images do).
- DPDP Act: add consent text at signup, data export/delete, breach response — full duties apply from May 2027.
- Confirm the GST rate and forward/reverse-charge treatment for your registration with a CA (Settings → Pricing).
- Add rate limiting on login, and move the event bus to Redis before running more than one API instance.
