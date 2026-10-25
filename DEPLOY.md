# Putting Surajlogistic on a Linux server

This guide takes a fresh Ubuntu or Debian server (any Linux with Docker works) to a running Surajlogistic with your company, your owner login, HTTPS and nightly backups.

**What runs where**

| Container | What it is | Reachable from outside |
| --- | --- | --- |
| `frontend` | The website and every app screen, served by nginx. It also passes `/api` to the backend | Yes, port 8080 (or 80/443 with HTTPS) |
| `backend` | The API (Node.js) | No, only through the frontend |
| `db` | PostgreSQL 16. Data lives in the Docker volume `surajlogistic_pgdata` and survives updates | No |
| `https` (optional) | Caddy: gets a free certificate for your domain and renews it | Yes, ports 80 and 443 |

**Server size:** 2 CPU, 4 GB RAM and 40 GB disk is plenty to start. The first build needs internet access to download the base images and packages.

---

## 1. Get the code onto the server

Either clone it:

```bash
sudo mkdir -p /opt/surajlogistic && sudo chown $USER /opt/surajlogistic
git clone <your repository URL> /opt/surajlogistic
cd /opt/surajlogistic
```

or upload the zip and unpack it:

```bash
scp surajlogistic.zip you@SERVER-IP:~
ssh you@SERVER-IP
sudo apt-get install -y unzip
unzip surajlogistic.zip -d /opt && cd /opt/surajlogistic
```

## 2. The quick way: one script

```bash
./deploy/setup.sh
```

It installs Docker if it is missing (with your OK), asks for your company name, your email and a password (or makes one), and a domain name if you have one. Then it writes `.env` with fresh random secrets, builds everything and starts it. At the end it prints the address and your login.

That's it. The rest of this guide explains the same steps by hand, HTTPS, backups and updates.

## 3. The same, by hand

### Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER    # then log out and back in, so you can run docker without sudo
docker compose version           # should print a version
```

### Fill in `.env`

```bash
cp .env.example .env
nano .env
```

Set at least these:

| Setting | What to put |
| --- | --- |
| `POSTGRES_PASSWORD` | Output of `openssl rand -hex 24` (letters and numbers only) |
| `JWT_SECRET` | Output of `openssl rand -hex 32` |
| `PUBLIC_URL` | `http://SERVER-IP:8080` for now, or `https://your-domain.in` with HTTPS |
| `COMPANY_NAME` | Your company's name, e.g. `Suraj Logistic` |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Your owner login. Used only on the very first start |

Keep `.env` private (`chmod 600 .env`). Never send it to anyone.

### Start it

```bash
docker compose up -d --build
docker compose ps        # all three should say "healthy" after a minute
```

Open `http://SERVER-IP:8080` and log in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Then, in the app:

1. **Settings → Company:** address, phone, GSTIN, bank and UPI (these print on invoices and consignment notes).
2. **Settings → Pricing and tax:** diesel price and GST rates (confirm the GST treatment with your CA).
3. **Fleet & drivers:** add your trucks and drivers; give drivers an app login.
4. **Customers:** add your business customers; give them a login if they book themselves.
5. **Team & logins:** add dispatchers and warehouse staff.

Truck owners, drivers, customers and warehouse staff can also ask to join from the website (`/join`); you approve them under **Requests**.

If the server has a firewall, open the port: `sudo ufw allow 8080/tcp`.

## 4. HTTPS with your domain

1. At your domain registrar, add a DNS **A record** for your domain (e.g. `surajlogistic.in` or `app.surajlogistic.in`) pointing to the server's IP. Wait until `ping your-domain` shows the server's IP.
2. Open ports 80 and 443: `sudo ufw allow 80/tcp && sudo ufw allow 443/tcp`.
3. In `.env` set:
   ```
   DOMAIN=surajlogistic.in
   PUBLIC_URL=https://surajlogistic.in
   COMPOSE_PROFILES=https
   ```
4. Start again: `docker compose up -d --build`

Caddy gets the certificate by itself within a minute and renews it. Plain `http://` visitors are sent to `https://`. You can still reach `http://SERVER-IP:8080` directly; close that port in the firewall once HTTPS works if you like.

## 5. Backups

```bash
./deploy/backup.sh                      # saves backups/surajlogistic-DATE.sql.gz, keeps the newest 14
```

Every night at 02:15, with `crontab -e`:

```
15 2 * * * cd /opt/surajlogistic && ./deploy/backup.sh >> backups/backup.log 2>&1
```

Copy the `backups` folder to another machine or cloud storage regularly; a backup on the same disk does not survive a dead disk.

To go back to a backup (everything entered after it is lost; it asks first):

```bash
./deploy/restore.sh backups/surajlogistic-2026-10-25-0215.sql.gz
```

## 6. Updating to a new version

```bash
cd /opt/surajlogistic
./deploy/backup.sh                      # always, before an update
git pull                                # or unpack the new zip over the folder (keep .env and backups/)
docker compose up -d --build
```

Database changes are applied automatically when the backend starts. Your data stays in the volume. Phones pick up the new version on their next visit.

## 7. Everyday commands

| Task | Command |
| --- | --- |
| See what is running | `docker compose ps` |
| Follow the backend log | `docker compose logs -f backend` |
| Restart everything | `docker compose restart` |
| Stop (data is kept) | `docker compose down` |
| Reset a forgotten password | `docker compose exec backend npm run cli -- reset-password owner@example.com 'NewPassword1'` |
| Add another owner login | `docker compose exec backend npm run cli -- create-admin partner@example.com 'Password123' 'Name'` |
| List owner logins | `docker compose exec backend npm run cli -- list-admins` |
| Health check | `curl http://127.0.0.1:8080/api/health` |
| Database shell | `docker compose exec db psql -U suraj -d surajlogistic` |

## 8. Trying it with demo data first

To see the product full of sample data before entering your own, put `SEED_DEMO=1` in `.env` on a test server (or on this one before you start using it for real) and start it. It adds the sample company with logins such as `admin@surajlogistic.in` / `demo1234` and trucks moving on simulated GPS.

Do not leave demo data on a real server: its passwords are public. To start clean, stop and delete the data volume (this erases everything):

```bash
docker compose down -v
```

then set `SEED_DEMO=0` and start again.

## 9. If something goes wrong

| What you see | What to do |
| --- | --- |
| `Set JWT_SECRET in .env` or `Set POSTGRES_PASSWORD in .env` | Fill those in `.env` (step 3) |
| Backend keeps restarting | `docker compose logs --tail=50 backend`. It prints exactly which setting is wrong |
| `There is no company yet` in the backend log | Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` and run `docker compose up -d`, or use `npm run cli -- create-company` |
| Page says "The server is restarting or busy" | The backend is starting; wait a minute. If it stays, check its log |
| Changed `POSTGRES_PASSWORD` after the first start and now it cannot connect | PostgreSQL keeps the password from its first start. Put the old one back in `.env`, or change it inside the database |
| HTTPS certificate not issued | DNS must point to this server and ports 80 and 443 must be open; then `docker compose logs https` |
| Port 8080 already in use | Set `HTTP_PORT=8081` (or any free port) in `.env` and start again |

## 10. Running parts on separate servers

The frontend and backend are separate images, so they can run apart:

- Backend: `docker build -f backend/Dockerfile -t surajlogistic-backend .` and run it with the same settings as in `docker-compose.yml` (`DATABASE_URL`, `JWT_SECRET`, `PUBLIC_URL`, …).
- Frontend: `docker build -f frontend/Dockerfile -t surajlogistic-frontend .` and run it with `BACKEND_URL=http://backend-address:4000` (no slash at the end).

The browser only ever talks to the frontend, which passes `/api` on, so there is nothing else to configure.
