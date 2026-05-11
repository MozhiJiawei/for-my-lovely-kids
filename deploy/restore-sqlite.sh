#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/red-flower-garden}
CONTAINER_NAME=${CONTAINER_NAME:-red-flower-garden-api}
IMAGE_NAME=${IMAGE_NAME:-red-flower-garden-api:local}
DATA_VOLUME=${DATA_VOLUME:-red-flower-data}
HOST_PORT=${HOST_PORT:-3000}
DATABASE_FILE=${DATABASE_FILE:-/data/red-flower-prod.db}
SKIP_PRE_RESTORE_BACKUP=${SKIP_PRE_RESTORE_BACKUP:-0}
RESTORE_VERIFY_STATE=${RESTORE_VERIFY_STATE:-1}
CURL_CONNECT_TIMEOUT=${CURL_CONNECT_TIMEOUT:-5}
CURL_MAX_TIME=${CURL_MAX_TIME:-15}
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

if ! docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "Container not found: $CONTAINER_NAME" >&2
  exit 1
fi

bash deploy/verify-sqlite-backup.sh "$BACKUP_FILE"

safety_backup_file=""
if [ "$SKIP_PRE_RESTORE_BACKUP" != "1" ] && docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  if docker exec "$CONTAINER_NAME" test -f "$DATABASE_FILE" >/dev/null 2>&1; then
    safety_backup_output=$(BACKUP_REASON=before-restore BACKUP_UPLOAD_OSS=0 bash deploy/backup-sqlite.sh)
    safety_backup_file=$(printf '%s\n' "$safety_backup_output" | tail -n 1)
    echo "Created pre-restore safety backup: $safety_backup_file"
  fi
fi

stopped_by_restore=0

start_container_if_needed() {
  if [ "$stopped_by_restore" = "1" ] && docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    docker start "$CONTAINER_NAME" >/dev/null 2>&1 || true
    stopped_by_restore=0
  fi
}

trap start_container_if_needed EXIT

copy_backup_into_volume() {
  local source_file=$1
  local backup_dir backup_name
  backup_dir=$(cd "$(dirname "$source_file")" && pwd)
  backup_name=$(basename "$source_file")

  docker run --rm \
    -v "$DATA_VOLUME:/data" \
    -v "$backup_dir:/backup:ro" \
    "$IMAGE_NAME" \
    sh -c "cp '/backup/$backup_name' '$DATABASE_FILE' && chmod 600 '$DATABASE_FILE'"
}

family_token() {
  if [ -f deploy/api.env ]; then
    sed -n 's/^FAMILY_ACCESS_TOKEN=//p' deploy/api.env | tail -n 1
  fi
}

wait_for_api() {
  local token
  for _ in $(seq 1 20); do
    if curl -fsS \
      --connect-timeout "$CURL_CONNECT_TIMEOUT" \
      --max-time "$CURL_MAX_TIME" \
      "http://127.0.0.1:$HOST_PORT/health" >/dev/null; then
      if [ "$RESTORE_VERIFY_STATE" != "1" ]; then
        return 0
      fi

      token=$(family_token)
      if [ -z "$token" ]; then
        echo "Skipping /api/state verification because FAMILY_ACCESS_TOKEN is unavailable."
        return 0
      fi

      if curl -fsS \
        --connect-timeout "$CURL_CONNECT_TIMEOUT" \
        --max-time "$CURL_MAX_TIME" \
        -H "x-family-token: $token" \
        "http://127.0.0.1:$HOST_PORT/api/state" >/dev/null; then
        return 0
      fi
    fi

    sleep 1
  done

  return 1
}

stop_container_for_restore() {
  docker stop "$CONTAINER_NAME" >/dev/null
  stopped_by_restore=1
}

start_container_after_restore() {
  docker start "$CONTAINER_NAME" >/dev/null
  stopped_by_restore=0
}

rollback_to_safety_backup() {
  if [ -z "$safety_backup_file" ] || [ ! -f "$safety_backup_file" ]; then
    return 1
  fi

  echo "Restore health check failed; rolling back to safety backup: $safety_backup_file" >&2
  stop_container_for_restore
  copy_backup_into_volume "$safety_backup_file"
  start_container_after_restore
  wait_for_api
}

stop_container_for_restore
if ! copy_backup_into_volume "$BACKUP_FILE"; then
  echo "Failed to copy backup into data volume; restarting the original API container." >&2
  start_container_after_restore
  exit 1
fi
start_container_after_restore

if wait_for_api; then
  echo "Restored $BACKUP_FILE"
  exit 0
fi

if rollback_to_safety_backup; then
  echo "API did not become healthy after restore; rolled back to $safety_backup_file" >&2
  exit 1
fi

docker logs --tail 80 "$CONTAINER_NAME" 2>&1 || true
echo "API did not become healthy after restore; no safety rollback was available" >&2
exit 1
