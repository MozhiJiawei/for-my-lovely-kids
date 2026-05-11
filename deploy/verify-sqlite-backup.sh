#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME=${IMAGE_NAME:-red-flower-garden-api:local}
BACKUP_FILE=${1:-}

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: bash deploy/verify-sqlite-backup.sh /path/to/backup.db" >&2
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

backup_dir=$(cd "$(dirname "$BACKUP_FILE")" && pwd)
backup_name=$(basename "$BACKUP_FILE")

integrity_result=$(docker run --rm \
  -v "$backup_dir:/backup:ro" \
  "$IMAGE_NAME" \
  sqlite3 "/backup/$backup_name" "PRAGMA integrity_check;")

if [ "$integrity_result" != "ok" ]; then
  echo "Backup integrity_check failed: $integrity_result" >&2
  exit 1
fi

echo "Backup integrity_check: ok"
