#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/red-flower-garden}
CONTAINER_NAME=${CONTAINER_NAME:-red-flower-garden-api}
DATABASE_FILE=${DATABASE_FILE:-/data/red-flower-prod.db}
BACKUP_DIR=${BACKUP_DIR:-$APP_DIR/backups}

mkdir -p "$BACKUP_DIR"

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_file="$BACKUP_DIR/red-flower-prod-$timestamp.db"

docker cp "$CONTAINER_NAME:$DATABASE_FILE" "$backup_file"
chmod 600 "$backup_file"

echo "$backup_file"
