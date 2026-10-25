#!/usr/bin/env bash
# Puts a backup made by deploy/backup.sh back into the database. Everything entered after
# that backup is lost, so it asks first.
#   ./deploy/restore.sh backups/surajlogistic-2026-10-25-0215.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."
file="${1:-}"
[[ -f "$file" ]] || { echo "Usage: ./deploy/restore.sh backups/surajlogistic-DATE.sql.gz"; exit 1; }
SUDO=""; docker info >/dev/null 2>&1 || SUDO="sudo"
if [[ "${2:-}" != "--yes" ]]; then
  read -r -p "Replace ALL current data with $file? Type yes to continue: " a </dev/tty
  [[ "$a" == "yes" ]] || { echo "Nothing changed."; exit 1; }
fi
$SUDO docker compose stop backend
gunzip -c "$file" | $SUDO docker compose exec -T db psql -U suraj -d surajlogistic -v ON_ERROR_STOP=1 -q >/dev/null
$SUDO docker compose start backend
echo "Restored $file. The backend is starting again."
