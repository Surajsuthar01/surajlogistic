#!/usr/bin/env bash
# Saves the whole Surajlogistic database to backups/surajlogistic-DATE.sql.gz and keeps the newest 14.
# Run it by hand, or every night from cron:
#   15 2 * * *  cd /opt/surajlogistic && ./deploy/backup.sh >> backups/backup.log 2>&1
# Copy the backups folder to another machine or cloud storage now and then.
set -euo pipefail
cd "$(dirname "$0")/.."
SUDO=""; docker info >/dev/null 2>&1 || SUDO="sudo"
mkdir -p backups
f="backups/surajlogistic-$(date +%Y-%m-%d-%H%M).sql.gz"
$SUDO docker compose exec -T db pg_dump -U suraj -d surajlogistic --clean --if-exists --no-owner | gzip > "$f.part"
mv "$f.part" "$f"
ls -1t backups/surajlogistic-*.sql.gz | tail -n +15 | xargs -r rm --
echo "Saved $f ($(du -h "$f" | cut -f1))"
