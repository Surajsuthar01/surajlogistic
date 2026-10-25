#!/usr/bin/env bash
# Surajlogistic: first-time setup on a Linux server.
#
#   ./deploy/setup.sh          asks a few questions, writes .env with fresh secrets,
#                              then builds and starts everything with docker compose
#   ./deploy/setup.sh --yes    no questions: takes the answers from environment variables
#                              (COMPANY_NAME, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PHONE,
#                               COMPANY_CITY, DOMAIN, HTTP_PORT, SEED_DEMO), for scripted installs
#
# Run it again later and it keeps your existing .env and simply rebuilds and restarts.
set -euo pipefail
cd "$(dirname "$0")/.."

YES=0
[[ "${1:-}" == "--yes" || "${1:-}" == "-y" ]] && YES=1

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ask() { # ask "Question" default -> answer
  local q="$1" def="${2:-}" a=""
  if [[ $YES == 1 ]]; then printf '%s' "$def"; return; fi
  if [[ -n "$def" ]]; then read -r -p "$q [$def]: " a </dev/tty; else read -r -p "$q: " a </dev/tty; fi
  printf '%s' "${a:-$def}"
}
# Values go into .env in single quotes, so Docker Compose takes them literally (a $ stays a $).
q() { printf "'%s'" "$1"; }
envget() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | sed -e "s/^'//" -e "s/'$//"; }
noquote() { [[ "$1" != *"'"* ]] || { echo "Please do not use the ' character in $2."; exit 1; }; }
secret() { if command -v openssl >/dev/null 2>&1; then openssl rand -hex "${1:-32}"; else head -c "${1:-32}" /dev/urandom | od -An -tx1 | tr -d ' \n'; fi; }

# ---- Docker ----
if ! command -v docker >/dev/null 2>&1; then
  say "Docker is not installed."
  if [[ $YES == 1 ]] || [[ "$(ask 'Install Docker now with the official script from get.docker.com? (y/n)' y)" =~ ^[Yy] ]]; then
    curl -fsSL https://get.docker.com | sh
  else
    echo "Install Docker first: https://docs.docker.com/engine/install/  then run this again."; exit 1
  fi
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "This Docker has no 'docker compose'. Install the compose plugin: https://docs.docker.com/compose/install/linux/"; exit 1
fi
SUDO=""
if ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then SUDO="sudo"; else
    echo "Cannot talk to Docker. Start it (sudo systemctl start docker) or run this script with sudo."; exit 1
  fi
fi

# ---- .env ----
if [[ -f .env ]]; then
  say "Found .env from an earlier setup: keeping it."
else
  say "A few questions about your company (press Enter to keep the value in brackets)."
  COMPANY_NAME_A="$(ask 'Company name' "${COMPANY_NAME:-Suraj Logistic}")"
  ADMIN_NAME_A="$(ask 'Your name (the owner login)' "${ADMIN_NAME:-Owner}")"
  ADMIN_EMAIL_A=""
  while [[ ! "$ADMIN_EMAIL_A" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; do
    ADMIN_EMAIL_A="$(ask 'Your email (you log in with it)' "${ADMIN_EMAIL:-}")"
    [[ $YES == 1 && ! "$ADMIN_EMAIL_A" =~ @ ]] && { echo "Set ADMIN_EMAIL for --yes mode."; exit 1; }
  done
  GENERATED_PW=0
  ADMIN_PASSWORD_A="$(ask 'Password for that login (8+ characters, empty = make one for me)' "${ADMIN_PASSWORD:-}")"
  if [[ -z "$ADMIN_PASSWORD_A" ]]; then ADMIN_PASSWORD_A="$(secret 6)"; GENERATED_PW=1; fi
  if (( ${#ADMIN_PASSWORD_A} < 8 )); then echo "The password must have at least 8 characters."; exit 1; fi
  noquote "$ADMIN_PASSWORD_A" "the password"
  ADMIN_PHONE_A="$(ask 'Your mobile number (optional)' "${ADMIN_PHONE:-}")"
  COMPANY_CITY_A="$(ask 'City of your office (optional)' "${COMPANY_CITY:-}")"
  DOMAIN_A="$(ask 'Domain name for HTTPS, e.g. surajlogistic.in (empty = use the server IP for now)' "${DOMAIN:-}")"
  DOMAIN_A="${DOMAIN_A#http://}"; DOMAIN_A="${DOMAIN_A#https://}"; DOMAIN_A="${DOMAIN_A%%/*}"
  for v in "$COMPANY_NAME_A" "$ADMIN_NAME_A" "$ADMIN_PHONE_A" "$COMPANY_CITY_A"; do noquote "$v" "names"; done
  HTTP_PORT_A="${HTTP_PORT:-8080}"
  if [[ -n "$DOMAIN_A" ]]; then
    PUBLIC_URL_A="https://$DOMAIN_A"; PROFILES="https"
  else
    IP="$(hostname -I 2>/dev/null | awk '{print $1}')"; IP="${IP:-localhost}"
    PUBLIC_URL_A="http://$IP:$HTTP_PORT_A"; PROFILES=""
  fi
  umask 077
  cat > .env <<ENV
# Written by deploy/setup.sh on $(date '+%Y-%m-%d %H:%M'). Keep this file private.
POSTGRES_PASSWORD=$(secret 24)
JWT_SECRET=$(secret 32)
PUBLIC_URL=$PUBLIC_URL_A
HTTP_PORT=$HTTP_PORT_A
DOMAIN=$DOMAIN_A
COMPOSE_PROFILES=$PROFILES
COMPANY_NAME=$(q "$COMPANY_NAME_A")
COMPANY_PHONE=$(q "$ADMIN_PHONE_A")
COMPANY_CITY=$(q "$COMPANY_CITY_A")
COMPANY_ADDRESS=
COMPANY_GSTIN=
ADMIN_NAME=$(q "$ADMIN_NAME_A")
ADMIN_EMAIL=$(q "$ADMIN_EMAIL_A")
ADMIN_PASSWORD=$(q "$ADMIN_PASSWORD_A")
ADMIN_PHONE=$(q "$ADMIN_PHONE_A")
SEED_DEMO=${SEED_DEMO:-0}
SIMULATE=
ALLOW_COMPANY_SIGNUP=
PUBLIC_ORG_SLUG=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-5-5
ENV
  umask 022
  say "Saved your settings in .env (private to this user)."
fi

PUBLIC_URL="$(envget PUBLIC_URL)"; HTTP_PORT="$(envget HTTP_PORT)"; DOMAIN="$(envget DOMAIN)"
ADMIN_EMAIL="$(envget ADMIN_EMAIL)"; ADMIN_PASSWORD="$(envget ADMIN_PASSWORD)"

# ---- Build and start ----
say "Building and starting Surajlogistic. The first build takes a few minutes."
$SUDO docker compose up -d --build

say "Waiting for it to answer..."
PORT="${HTTP_PORT:-8080}"
for i in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then OK=1; break; fi
  sleep 2
done
if [[ "${OK:-0}" != 1 ]]; then
  echo "It did not answer within 3 minutes. See what happened with:  $SUDO docker compose logs --tail=80 backend"
  exit 1
fi

say "Surajlogistic is running."
echo "  Open:      ${PUBLIC_URL}"
[[ -n "${DOMAIN:-}" ]] && echo "             (until DNS for ${DOMAIN} points here, use http://SERVER-IP:${PORT})"
echo "  Log in:    ${ADMIN_EMAIL:-the ADMIN_EMAIL in .env}"
if [[ "${GENERATED_PW:-0}" == 1 ]]; then echo "  Password:  ${ADMIN_PASSWORD}   (write it down; change it in the app under Your profile)"; fi
echo
echo "  Logs:      $SUDO docker compose logs -f backend"
echo "  Backup:    ./deploy/backup.sh"
echo "  Update:    put the new code here, then  $SUDO docker compose up -d --build"
