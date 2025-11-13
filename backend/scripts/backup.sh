#!/usr/bin/env bash
set -euo pipefail
# Simple pg_dump backup into /backup with date suffix
STAMP=$(date +"%Y%m%d_%H%M%S")
mkdir -p /backup
pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -h localhost -F c -f "/backup/emsg_${STAMP}.dump"
echo "Backup written to /backup/emsg_${STAMP}.dump"