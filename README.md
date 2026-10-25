<div align="center">

<img src="frontend/public/icon.svg" width="96" alt="Surajlogistic logo: the sun with arrows in every direction" />

# Surajlogistic

**To every direction.**

Full trucks, part loads, parcels and warehousing across India, run from one app:
a public website, an office control tower, a driver app in Hindi and a page for every truck owner who joins.

[Deploy on a server](#deploy-on-a-linux-server) · [What it does](#what-it-does) · [Run it on your computer](#run-it-on-your-computer) · [How it is built](#how-it-is-built) · [Deployment guide](DEPLOY.md) · [Technical reference](docs/TECHNICAL.md)

</div>

<br />

![The Surajlogistic website: tracking right under the navigation bar, "To every direction", and the four services](docs/screenshots/website.jpg)

## Why it exists

Most Indian road freight still moves on phone calls, WhatsApp forwards and paper bilties. Trucks run back empty, parcels go missing between desks, owners of one or two trucks wait weeks to be paid, and customers never know where their goods are.

Surajlogistic puts all of it on **one shipment record**: the booking, the truck it rides on, the driver's delivery with OTP and photo, and the GST invoice are the same record from start to end. Everyone sees their own part of it, live:

- **Customers** book online, even without an account, and follow every step on WhatsApp.
- **The office** sees every truck on a live map, with problems ranked by money at risk.
- **Drivers** get a simple app in Hindi: today's trip, deliveries, OTP, expenses.
- **Truck owners** with one or two trucks join the network, get loads and see exactly what they will be paid.

![Control tower: live map of every truck and lane, KPIs, and what needs attention today](docs/screenshots/control-tower.jpg)

## What it does

### For each person

| Who | What they get |
| --- | --- |
| **Anyone on the website** | Track a shipment by AWB right under the navigation bar. Check a price with GST as they type. Book a pickup **without an account**; the office confirms it and the AWB goes out on WhatsApp. Ask to join as a truck owner, driver, business customer or warehouse staff. |
| **Owner and dispatchers** | Control tower with a live map, KPIs and exceptions. Shipments, trips, fleet and drivers, load board, warehouse, billing, customers, reports. Approve website bookings and join requests. Ask the copilot in English or Hinglish. |
| **Business customers** | Their own shipments only: book one or upload a sheet of hundreds, print labels, download invoices, track everything live. |
| **Drivers** | A phone app, Hindi first: today's trip, share live location, mark out for delivery, deliver with the receiver's OTP, photo and signature, collect cash on delivery, log diesel and tolls with a bill photo. |
| **Truck owners** | Their attached trucks, every trip, the lorry hire for each (advance at loading, balance after delivery) and papers expiring. One tap tells the office a truck is free in another city. |
| **Warehouse staff** | Stock by client and bin, receive and dispatch with stock checks, low-stock warnings. |

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/shipment.jpg" alt="A shipment: status timeline, route map, delivery details, price breakup and print buttons" /></td>
    <td width="50%"><img src="docs/screenshots/copilot.jpg" alt="The copilot answering 'Which trucks are idle near Jaipur?' with a table from live records" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Every shipment: timeline, map, delivery, money, label and consignment note</sub></td>
    <td align="center"><sub>Copilot: plain questions, answers from your live records</sub></td>
  </tr>
</table>

### Everything inside

- **Shipments.** Parcels (courier), part loads (PTL) and full trucks (FTL) with an instant quote: distance, weight, fuel surcharge, cash-on-delivery charge and GST. AWB numbers, a status timeline, delivery only with the receiver's OTP, photo and signature as proof, e-way bill numbers, bulk booking from a spreadsheet.
- **Trucks and trips.** Plan a trip with a capacity check, follow it on the map with a live ETA, see the profit after diesel and tolls. Vehicle papers (insurance, fitness, permit, PUC) and driving licences with expiry alerts.
- **Truck owner network.** Owners of one or two trucks ask to join from the website; once approved, their trucks get trips and they see the hire, advance and balance on their own page.
- **Load board.** Post loads, take bids, accept one; a return-load finder ranks loads near an empty truck by rupees per kilometre so trucks don't drive home empty.
- **Warehouse.** Stock by client and bin, receiving and dispatch, warnings before anything runs out.
- **Billing.** Delivered but unbilled shipments become a GST invoice with financial-year numbering, CGST and SGST or IGST worked out from the states, a UPI QR code, and sent and paid tracking.
- **WhatsApp updates.** Booked, out for delivery, delivered, failed attempt; the receiver can pick a new day from the tracking page.
- **Copilot.** "Jaipur ke paas kaun se truck khali hain?", "Indore se Mumbai 5 ton ka bhada kitna?", delays, cash on delivery, risky parcels, expiring papers, revenue.
- **Printing and downloads.** 4×6 inch parcel labels, consignment notes (bilty) and tax invoices that print or save as PDF; Excel downloads with the logo, frozen headers and filters.
- **Your own systems.** API keys and signed webhooks so a customer's website or ERP can book and track.

<p align="center">
  <img src="docs/screenshots/phones.jpg" width="860" alt="On phones: the driver app in Hindi, the truck owner's page with lorry hire, and a customer's shipments" />
  <br />
  <sub>On phones: the driver app (Hindi), a truck owner's page, a customer's shipments</sub>
</p>

## Deploy on a Linux server

You need a Linux server (Ubuntu or Debian is easiest) with internet access. Docker is installed for you if it is missing.

```bash
git clone <this repository> /opt/surajlogistic
cd /opt/surajlogistic
./deploy/setup.sh
```

The script asks for your company name, your email and a password (or makes one), and your domain name if you have one. It writes `.env` with fresh random secrets, builds everything and starts it. Then open the address it prints and log in.

<details>
<summary><b>Or do it by hand</b></summary>

```bash
cp .env.example .env              # set POSTGRES_PASSWORD, JWT_SECRET, PUBLIC_URL, ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up -d --build      # then open http://SERVER-IP:8080
```

With a domain name and a free HTTPS certificate: point the domain at the server, set `DOMAIN` and `PUBLIC_URL=https://your-domain` in `.env`, and start with `docker compose --profile https up -d --build`.

</details>

**[DEPLOY.md](DEPLOY.md)** has every step: HTTPS, nightly backups and restore, updates, resetting a forgotten password, and what to do if something goes wrong.

| Everyday task | Command |
| --- | --- |
| See what is running | `docker compose ps` |
| Follow the backend log | `docker compose logs -f backend` |
| Back up the database | `./deploy/backup.sh` |
| Update to a new version | `./deploy/backup.sh && git pull && docker compose up -d --build` |
| Reset a forgotten password | `docker compose exec backend npm run cli -- reset-password you@example.com 'NewPassword1'` |

## Run it on your computer

Needs Node.js 20 or newer. There is no database to install: the backend uses an embedded PostgreSQL and loads a demo company.

```bash
npm install
npm run dev:backend     # API on http://localhost:4000
npm run dev:frontend    # website and apps on http://localhost:5173
```

Log in with any demo account below (password `demo1234`). To keep data between restarts, copy `backend/.env.example` to `backend/.env`.

**A demo with no server at all:** `npm run build:demo` writes `frontend/dist-demo/index.html`, one file that runs the whole product in the browser on sample data. Good for showing customers; changes reset on reload.

| Demo login | Opens as |
| --- | --- |
| `admin@surajlogistic.in` | Owner: everything, including team, settings and approvals |
| `ops@surajlogistic.in` | Dispatcher: everything except team and settings |
| `driver@surajlogistic.in` | Driver app (Ramesh, in Hindi) |
| `partner@rathoretrucks.in` | Truck owner with two attached trucks |
| `shipper@shreetextiles.in` | Business customer: only their own shipments |
| `warehouse@surajlogistic.in` | Warehouse staff |
| `9752000101` (mobile) | Someone who asked to join and is still waiting |

All demo companies, people, GSTINs and vehicle numbers are made up. Demo data is off on a real server (`SEED_DEMO=0`).

## How it is built

```mermaid
flowchart LR
  P["Visitors, customers,<br/>drivers, office"] -->|https| C["https (optional)<br/>Caddy, free certificate"]
  C --> F
  P -.->|"http :8080"| F["frontend<br/>nginx + React app"]
  F -->|"/api"| B["backend<br/>Node.js + Fastify"]
  B --> D[("db<br/>PostgreSQL 16")]
```

Three containers, each with one job. Only the frontend faces the internet; the backend and database are reachable only from inside.

```
frontend/   The website and every app screen (React 19, Vite, Tailwind 4).
            Served by nginx in production, which also passes /api to the backend.
backend/    The API (Fastify 5, Drizzle ORM, PostgreSQL), logins and roles, live updates,
            WhatsApp log, webhooks, GPS simulator for demos, admin commands (src/cli.ts).
shared/     The business rules both sides use, so a price or an ETA is the same everywhere:
            pricing, ETA, delivery-risk score, return-load matching, route planning,
            carbon estimate, copilot, demo data.
deploy/     setup.sh, backup.sh, restore.sh and the HTTPS configuration.
docs/       Technical reference and screenshots.
```

| Part | Built with |
| --- | --- |
| Website and apps | React 19, React Router 7, Vite, Tailwind CSS 4, Inter type, an SVG map of India with no map keys or tiles |
| API | Node.js 22, Fastify 5, Zod, JWT logins with roles, Server-Sent Events for live updates |
| Database | PostgreSQL 16 with Drizzle ORM; migrations run on start. Development uses embedded PGlite |
| Serving | nginx (gzip, caching, strict security headers), Caddy for HTTPS, Docker Compose |
| Tests | Vitest: business rules, and the whole API against both embedded and real PostgreSQL |

Every API route, every setting and the design rules are in **[docs/TECHNICAL.md](docs/TECHNICAL.md)**.

## Security

- **Each person sees only their part.** Every query is limited to the company; customers see only their own shipments and invoices; drivers see only their own trip and never what the customer pays or what the trip earns; truck owners see only their own trucks and hire.
- **Logins stay honest.** Roles are re-checked against the database on every request, so a removed login stops at once. Changing a password signs out every other device. Login, booking and tracking are rate limited.
- **Safe by default on a server.** The backend refuses to start with a missing, short or example secret, or without PostgreSQL. Demo data and simulated GPS are off. The backend runs as a normal user and is not exposed to the internet.
- **Careful with data.** Delivery photos and signatures are checked, stored privately and handed out only as signed links that expire. The public tracking page shows no personal details. Owners can export or delete all company data.

## Tests

```bash
npm test             # 25 business-rule tests + 51 API tests on embedded PostgreSQL
npm run typecheck
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/empty_db npm test -w @suraj/backend   # API tests on real PostgreSQL
```

The API tests cover company isolation, every role's limits, the OTP rule, website bookings and join approvals, truck-owner hire, signed photo links, webhooks, rate limits, the production start-up checks and the first-start company setup. GitHub Actions runs the type check, both test suites, both web builds and both Docker builds on every push to `main` and every pull request.

Before this version was released it was also run end to end with Docker Compose: the setup script, every user type opening every page on desktop and phone, the main flows in a real browser, HTTPS, backup and restore.

## Going live: what is ready and what is next

| Part | Today | To connect for real |
| --- | --- | --- |
| Pricing, ETA, delivery risk, matching, routing | Working rule-based engines | Tune rate cards per customer; train ETA and risk on your own history |
| GPS | Driver's phone location (and a simulator for demos) | GPS devices or FASTag trails through ULIP |
| E-way bill | Mock generator | A GST Suvidha Provider (GSP); swap the adapter in `backend/src/integrations` |
| Vehicle and licence checks (VAHAN, Sarathi) | Mock using saved documents | Register on ULIP and swap the adapter |
| WhatsApp and SMS | Every message is written to a log, respecting each company's switches | A WhatsApp Business API provider in `backend/src/lib/notify.ts` |
| Copilot | Answers from live records, works offline | Optional: `ANTHROPIC_API_KEY` for more natural wording |
| Payments | Invoices record UPI, NEFT or cheque payments by hand | A licensed payment gateway |

Before real customers use it: turn on HTTPS, schedule `./deploy/backup.sh` every night and copy backups off the server, confirm the GST treatment with your CA (Settings → Pricing), and confirm the licence of the website photos in `frontend/src/assets/img`.

## Credits

Fonts: Inter, Geist Mono and Anek Devanagari, under the SIL Open Font License, self-hosted in `frontend/src/assets/fonts`. No licence has been chosen for this code yet; add a `LICENSE` file before sharing it outside Suraj Logistic.
