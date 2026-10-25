# Surajlogistic: technical reference

The [README](../README.md) explains what Surajlogistic is and how to run it; [DEPLOY.md](../DEPLOY.md) puts it on a server. This page is for whoever changes the code: how it is put together, every API route and who may call it, every setting, and the design rules behind the screens.

## Architecture

```
shared/     Shared domain + AI engines (TypeScript, no dependencies)
            pricing · ETA · RTO risk · return-load matching · route optimiser (2-opt)
            carbon · copilot intents and answers · dashboard/exceptions · demo data
backend/    Fastify 5 API · Drizzle ORM · PostgreSQL (or embedded PGlite) · JWT + roles
            live events over Server-Sent Events · GPS simulator · integration adapters
            src/config.ts (every setting, checked at start) · src/cli.ts (admin commands)
frontend/   React 19 + Vite + Tailwind 4 · website, control tower, ops screens, driver app,
            truck-owner app, tracking · nginx/ (production web server config)
deploy/     setup.sh · backup.sh · restore.sh · Caddyfile (HTTPS)
```

- **One API, many tenants.** Every table has `org_id`; every query filters by it. Tests prove one company cannot see another's data.
- **Same engines everywhere.** The API, the browser demo and the tests all call `@suraj/shared`, so a price or an ETA is the same wherever you see it.
- **Database.** `DATABASE_URL=postgres://…` uses PostgreSQL; `pglite:./folder` or nothing uses embedded Postgres. Migrations live in `backend/drizzle` and run on start. After changing `schema.ts`, run `npm run db:generate`.

## Look and feel

- **Night first.** Near-black ground, white type, one signal blue (`--sign`), yellow only on number plates. Day mode is a white page with the same layout; the choice is remembered per device (`sl_theme`, attribute `data-sl-theme`).
- **Type.** One family everywhere: Inter with optical sizes, so big headings switch to its tighter display cut on their own (close to the type on Tesla's and OpenAI's sites). Headings are sentence case, semibold, tightly spaced; no blocks of capitals. Geist Mono only for codes such as AWB, trip and invoice numbers, which always sit on their own line under the headline. Anek Devanagari fills in Hindi. All self-hosted under the SIL Open Font License in `frontend/src/assets/fonts`.
- **Logo.** The sun (suraj) with arrows leaving it in all eight directions, "to every direction"; the north-east arrow is orange. The arrows take the colour of the text around them, so the mark works on dark and on paper; below 22 px it switches to a heavier version without arrowheads. `components/Brand.tsx` has the mark, the wordmark (Surajlogistic, semibold) and the app icon; `public/icon*.svg|png` are the favicon and home-screen icons. The same mark heads printed labels, consignment notes, invoices and every Excel download.
- **Copilot.** Opens as its own chat window: a greeting and four starting points, then a conversation with tables, links into the app, copy, follow-up suggestions and a "New chat" button.
- **Your profile.** The avatar in the island opens a profile card (role, company, Night/Day, log out). `/profile` lets anyone edit their name and mobile and change their password.
- **Front page.** `/welcome` explains what Surajlogistic is, the four services, a to-scale lineup of the eight truck classes the app prices (drawn in SVG from `components/TruckArt.tsx`), the live network, features, pricing and questions, with tracking under the hero buttons.
- **Dynamic Island navigation.** A floating black pill: the open page sits on a sliding white pill, the rest open from "More"; search, account and live activity expand the island in place. It keeps its full size when you scroll, always shows the Surajlogistic name and the copilot button, and live events flash in it for a few seconds. Office staff also get an "Ask copilot" button at the bottom right.
- **Network map.** India as a field of dots (official boundary, coarse outline in `components/indiaOutline.ts`), lanes as glowing arcs, trucks riding them. No map tiles or keys.
- **Photos.** `frontend/src/assets/img` comes from the Surajlogistic website folder. They look like stock photos; confirm the licence (and any attribution the source requires) before the site goes public.
- **Embedding.** Base styles are unlayered and written as `html body` so the page keeps its look inside hosts that inject their own reset (such as the claude.ai artifact viewer).

## API routes

"Staff" means the owner (admin) and dispatchers (ops). An API key acts as a dispatcher.

| Method | Path | Who |
| --- | --- | --- |
| POST | `/api/auth/register`, `/api/auth/login` (email or mobile) | anyone, rate limited |
| POST | `/api/public/quote`, `/api/public/bookings` | anyone, rate limited (bookings start as REQUESTED) |
| POST | `/api/join` | anyone, rate limited |
| GET | `/api/requests/summary` | staff |
| GET | `/api/join-requests?status=`; POST `/api/join-requests/:id/approve`, `/reject` `{note}` | admin |
| GET | `/api/partner/me`; POST `/api/partner/vehicles/:id/free` `{city}` | truck owner |
| POST | `/api/trips/:id/hire` `{hireAmount?, hireAdvance?, settled?}` | staff |
| GET | `/api/health` | anyone; 503 when the database is down (used by Docker) |
| GET | `/api/me` | logged in |
| PATCH | `/api/me` `{name?, phone?, lang?}`; POST `/api/me/password` `{current, next}` | logged in (not with an API key); password changes are rate limited |
| GET/POST/PATCH/DELETE | `/api/users` | admin |
| POST | `/api/quotes` | logged in |
| GET/POST | `/api/shipments` (list returns `counts` per tab) | staff, customer (own) |
| POST | `/api/shipments/bulk` `{dryRun, customerId, rows}` (up to 500 rows) | staff, customer (own) |
| GET | `/api/shipments/:id` | staff, customer (own), driver (own trip) |
| POST | `/api/shipments/:id/status` | staff; driver (own trip: pickup, out for delivery, delivered, failed attempt; never cancel or return); customer (cancel own before pickup). DELIVERED needs the OTP |
| POST | `/api/shipments/:id/pod` `{photo, signature}` | staff, driver (own trip), after delivery |
| POST | `/api/shipments/:id/ewaybill` | staff |
| GET | `/api/track/:awb`; POST `/api/track/:awb/reschedule` | public (reschedule needs the last 4 digits of the receiver's mobile) |
| GET | `/api/search?q=` | logged in (customers see only their own) |
| GET | `/api/reports?from=&to=` | staff |
| GET/POST/PATCH | `/api/vehicles`, `/api/vehicles/:id`, `/api/drivers` | staff |
| POST | `/api/vehicles/:id/verify`, `/api/drivers/:id/verify` | staff (VAHAN / Sarathi via ULIP, mock) |
| GET/POST | `/api/trips`; POST `/api/trips/:id/start`, `/ping`, `/complete`, `/expenses` | staff, driver (own trip) |
| POST | `/api/routes/optimize` | staff |
| GET/POST | `/api/loads`; POST `/api/loads/:id/bids`, `/accept` | staff |
| GET | `/api/vehicles/:id/return-loads` | staff |
| GET/POST | `/api/facilities`, `/api/inventory`; POST `/api/inventory/:id/move` | staff, warehouse |
| GET/POST/PATCH | `/api/customers` (`?stats=1`), `/api/customers/:id` | staff |
| GET/POST/PATCH | `/api/invoices`; GET `/api/billing/unbilled` | staff; customers read their own sent invoices |
| GET | `/api/notifications` (WhatsApp/SMS log) | staff |
| GET | `/api/driver/me` | driver (no freight, hire, profit or prices in any driver answer) |
| GET | `/api/dashboard`; POST `/api/copilot` | staff |
| GET | `/api/stream?token=` | logged in (Server-Sent Events) |
| PATCH | `/api/org/settings`; GET `/api/org/export`; DELETE `/api/org` `{confirm: "<company name>"}` | admin |
| GET/POST/DELETE | `/api/api-keys`, `/api/webhooks`; POST `/api/webhooks/:id/test` | admin (not with an API key) |
| GET | `/api/files/:id?exp=&sig=` | anyone holding a signed link (expires in an hour) |

**Your own systems.** Send `x-api-key: sl_live_…` instead of a login token. Webhooks POST JSON `{id, type, at, data}` for `shipment.created`, `shipment.status`, `trip.status` and `invoice.updated`, with `x-suraj-timestamp` and `x-suraj-signature: sha256=HMAC(secret, "<timestamp>.<body>")`. Only public `https://` addresses are accepted; a hook that fails 20 times in a row is switched off.

**Photos.** Delivery photos, signatures and fuel bills are checked (JPEG, PNG or WebP, real image bytes, under 1.5 MB), stored in the `files` table and only ever handed out as signed links that expire.

## Settings

| Variable | Default | What it does |
| --- | --- | --- |
| `NODE_ENV` | development | `production` (set by the Docker image) turns on the start-up checks below and the production defaults |
| `DATABASE_URL` | embedded, in memory | `postgres://…`, or `pglite:./folder` to keep embedded data. Must be PostgreSQL in production |
| `JWT_SECRET` | dev value | 32+ characters, not the example value, in production; also signs photo links |
| `PUBLIC_URL` | `http://localhost:5173` | Base of tracking links in WhatsApp messages |
| `CORS_ORIGIN` | any (production: `PUBLIC_URL`) | Comma list of allowed web origins |
| `COMPANY_NAME`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_PHONE`, `COMPANY_PHONE`, `COMPANY_CITY`, `COMPANY_ADDRESS`, `COMPANY_GSTIN` | none | First start of an empty database: creates the company and its owner login. Ignored once a company exists |
| `TRUST_PROXY` | off | Number of reverse-proxy hops (or proxy IPs) to trust for the client address; Docker sets `1` for nginx |
| `PUBLIC_ORG_SLUG` | first company | Which company the public website books for and people join |
| `ALLOW_COMPANY_SIGNUP` | off | `1` lets anyone create a new company from `/api/auth/register` |
| `SEED_DEMO`, `SIMULATE`, `SIM_INTERVAL_MS` | on in development, off in production; `SIMULATE` follows `SEED_DEMO`; 15000 | Demo company and moving trucks on simulated GPS |
| `WEBHOOK_ALLOW_PRIVATE` | off | `1` allows `http://` and private addresses for webhooks; local testing only |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | none | Optional copilot wording |

Limits: 10 login tries per address and account every 15 minutes, 5 signups per address per hour, 120 tracking lookups per address per minute, 5 reschedule tries per hour, 60 website price checks a minute, 10 website bookings and 20 join requests per address per hour. They are kept in memory, so with more than one API instance move them to Redis.
