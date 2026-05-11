#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/red-flower-garden}
CONTAINER_NAME=${CONTAINER_NAME:-red-flower-garden-api}
IMAGE_NAME=${IMAGE_NAME:-red-flower-garden-api:local}
DATA_VOLUME=${DATA_VOLUME:-red-flower-data}
HOST_PORT=${HOST_PORT:-3000}
DATABASE_FILE=${DATABASE_FILE:-/data/red-flower-prod.db}
BACKUP_FILE=${1:-}

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: bash deploy/restore-sqlite.sh /path/to/backup.db" >&2
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

cd "$APP_DIR"

backup_dir=$(cd "$(dirname "$BACKUP_FILE")" && pwd)
backup_name=$(basename "$BACKUP_FILE")

docker stop "$CONTAINER_NAME" >/dev/null
docker run --rm \
  -v "$DATA_VOLUME:/data" \
  -v "$backup_dir:/backup:ro" \
  "$IMAGE_NAME" \
  sh -c "cp '/backup/$backup_name' '$DATABASE_FILE' && chmod 600 '$DATABASE_FILE'"
docker start "$CONTAINER_NAME" >/dev/null

for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$HOST_PORT/health" >/dev/null; then
    echo "Restored $BACKUP_FILE"
    exit 0
  fi

  sleep 1
done

docker logs --tail 80 "$CONTAINER_NAME" 2>&1 || true
echo "API did not become healthy after restore" >&2
exit 1
