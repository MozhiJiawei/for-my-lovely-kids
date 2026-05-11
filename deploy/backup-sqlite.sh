#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/red-flower-garden}
CONTAINER_NAME=${CONTAINER_NAME:-red-flower-garden-api}
IMAGE_NAME=${IMAGE_NAME:-red-flower-garden-api:local}
DATA_VOLUME=${DATA_VOLUME:-red-flower-data}
DATABASE_FILE=${DATABASE_FILE:-/data/red-flower-prod.db}
BACKUP_DIR=${BACKUP_DIR:-$APP_DIR/backups}
APP_NAME=${APP_NAME:-red-flower}
ENVIRONMENT=${ENVIRONMENT:-prod}
BACKUP_REASON=${BACKUP_REASON:-daily}
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-3}
OBJECT_STORAGE_ENV=${OBJECT_STORAGE_ENV:-/etc/red-flower-garden/object-storage.env}
BACKUP_UPLOAD_OSS=${BACKUP_UPLOAD_OSS:-1}
BACKUP_ALLOW_VOLUME_FALLBACK=${BACKUP_ALLOW_VOLUME_FALLBACK:-0}
OSS_CURL_CONNECT_TIMEOUT=${OSS_CURL_CONNECT_TIMEOUT:-10}
OSS_CURL_MAX_TIME=${OSS_CURL_MAX_TIME:-120}
OSS_CURL_RETRY=${OSS_CURL_RETRY:-3}
OSS_CURL_RETRY_DELAY=${OSS_CURL_RETRY_DELAY:-2}

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required" >&2
    exit 1
  fi
}

require_command docker
require_command date
require_command find

backup_source=container
if ! docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  if [ "$BACKUP_ALLOW_VOLUME_FALLBACK" = "1" ] && docker volume inspect "$DATA_VOLUME" >/dev/null 2>&1; then
    backup_source=volume
  else
    echo "Container not found: $CONTAINER_NAME" >&2
    exit 1
  fi
fi

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
git_sha=${GIT_SHA:-}
if [ -z "$git_sha" ] && command -v git >/dev/null 2>&1 && [ -d "$APP_DIR/.git" ]; then
  git_sha=$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || true)
fi
if [ -z "$git_sha" ]; then
  git_sha="unknown"
fi

safe_reason=$(printf '%s' "$BACKUP_REASON" | tr -cs 'A-Za-z0-9._-' '-')
backup_name="$APP_NAME-$ENVIRONMENT-$timestamp-$git_sha-$safe_reason.db"
backup_file="$BACKUP_DIR/$backup_name"
container_tmp="/tmp/$backup_name"

cleanup_container_tmp() {
  if [ "$backup_source" = "container" ]; then
    docker exec "$CONTAINER_NAME" rm -f "$container_tmp" >/dev/null 2>&1 || true
  fi
}
trap cleanup_container_tmp EXIT

if [ "$backup_source" = "container" ]; then
  docker exec "$CONTAINER_NAME" test -f "$DATABASE_FILE"
  docker exec "$CONTAINER_NAME" sqlite3 "$DATABASE_FILE" ".backup '$container_tmp'"
  integrity_result=$(docker exec "$CONTAINER_NAME" sqlite3 "$container_tmp" "PRAGMA integrity_check;")
else
  integrity_result=$(docker run --rm \
    -v "$DATA_VOLUME:/data:ro" \
    -v "$BACKUP_DIR:/backup" \
    "$IMAGE_NAME" \
    sh -c "test -f '$DATABASE_FILE' && sqlite3 '$DATABASE_FILE' \".backup '/backup/$backup_name'\" && sqlite3 '/backup/$backup_name' 'PRAGMA integrity_check;'")
fi
if [ "$integrity_result" != "ok" ]; then
  echo "Backup integrity_check failed: $integrity_result" >&2
  exit 1
fi

if [ "$backup_source" = "container" ]; then
  docker cp "$CONTAINER_NAME:$container_tmp" "$backup_file"
fi
chmod 600 "$backup_file"
echo "Backup integrity_check: ok"

oss_endpoint_host() {
  local endpoint=$1
  endpoint=${endpoint#http://}
  endpoint=${endpoint#https://}
  endpoint=${endpoint%%/}
  printf '%s' "$endpoint"
}

oss_sign() {
  local method=$1
  local content_type=$2
  local date_header=$3
  local canonical_resource=$4
  local string_to_sign
  string_to_sign=$(printf '%s\n%s\n%s\n%s\n%s' "$method" "" "$content_type" "$date_header" "$canonical_resource")
  printf '%s' "$string_to_sign" | openssl dgst -sha1 -hmac "$ALIYUN_OSS_ACCESS_KEY_SECRET" -binary | openssl base64
}

oss_curl() {
  curl -fsS \
    --connect-timeout "$OSS_CURL_CONNECT_TIMEOUT" \
    --max-time "$OSS_CURL_MAX_TIME" \
    --retry "$OSS_CURL_RETRY" \
    --retry-delay "$OSS_CURL_RETRY_DELAY" \
    "$@"
}

oss_query_escape() {
  printf '%s' "$1" | sed 's#/#%2F#g'
}

oss_put_object() {
  require_command curl
  require_command openssl

  if [ ! -f "$OBJECT_STORAGE_ENV" ]; then
    echo "OSS config file not found: $OBJECT_STORAGE_ENV" >&2
    echo "Create it from deploy/object-storage.env.example, using a dedicated bucket for this app." >&2
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  . "$OBJECT_STORAGE_ENV"
  set +a

  : "${ALIYUN_OSS_ACCESS_KEY_ID:?ALIYUN_OSS_ACCESS_KEY_ID is required}"
  : "${ALIYUN_OSS_ACCESS_KEY_SECRET:?ALIYUN_OSS_ACCESS_KEY_SECRET is required}"
  : "${ALIYUN_OSS_BUCKET:?ALIYUN_OSS_BUCKET is required}"
  : "${ALIYUN_OSS_ENDPOINT:?ALIYUN_OSS_ENDPOINT is required}"

  local app_prefix=${ALIYUN_OSS_PREFIX:-red-flower-garden/}
  app_prefix=${app_prefix#/}
  if [ -n "$app_prefix" ] && [ "${app_prefix%/}" = "$app_prefix" ]; then
    app_prefix="$app_prefix/"
  fi

  local prefix=${ALIYUN_OSS_BACKUP_PREFIX:-${app_prefix}backups/$ENVIRONMENT/}
  prefix=${prefix#/}
  if [ -n "$prefix" ] && [ "${prefix%/}" = "$prefix" ]; then
    prefix="$prefix/"
  fi

  local object_key="$prefix$backup_name"
  local endpoint host date_header content_type signature url
  endpoint=$(oss_endpoint_host "$ALIYUN_OSS_ENDPOINT")
  host="$ALIYUN_OSS_BUCKET.$endpoint"
  date_header=$(LC_ALL=C date -u '+%a, %d %b %Y %H:%M:%S GMT')
  content_type="application/octet-stream"
  signature=$(oss_sign "PUT" "$content_type" "$date_header" "/$ALIYUN_OSS_BUCKET/$object_key")
  url="https://$host/$object_key"

  oss_curl -X PUT \
    -T "$backup_file" \
    -H "Date: $date_header" \
    -H "Content-Type: $content_type" \
    -H "Authorization: OSS $ALIYUN_OSS_ACCESS_KEY_ID:$signature" \
    "$url" >/dev/null

  echo "Uploaded backup to OSS object: $object_key"

  cleanup_oss_retention "$prefix" || echo "OSS retention cleanup failed; uploaded backup was kept." >&2
}

oss_delete_object() {
  local object_key=$1
  local endpoint host date_header signature url
  endpoint=$(oss_endpoint_host "$ALIYUN_OSS_ENDPOINT")
  host="$ALIYUN_OSS_BUCKET.$endpoint"
  date_header=$(LC_ALL=C date -u '+%a, %d %b %Y %H:%M:%S GMT')
  signature=$(oss_sign "DELETE" "" "$date_header" "/$ALIYUN_OSS_BUCKET/$object_key")
  url="https://$host/$object_key"

  oss_curl -X DELETE \
    -H "Date: $date_header" \
    -H "Authorization: OSS $ALIYUN_OSS_ACCESS_KEY_ID:$signature" \
    "$url" >/dev/null
}

cleanup_oss_retention() {
  local prefix=$1
  local endpoint host date_header signature url xml cutoff_epoch key key_timestamp key_epoch

  endpoint=$(oss_endpoint_host "$ALIYUN_OSS_ENDPOINT")
  host="$ALIYUN_OSS_BUCKET.$endpoint"
  date_header=$(LC_ALL=C date -u '+%a, %d %b %Y %H:%M:%S GMT')
  signature=$(oss_sign "GET" "" "$date_header" "/$ALIYUN_OSS_BUCKET/")
  url="https://$host/?prefix=$(oss_query_escape "$prefix")"
  xml=$(oss_curl \
    -H "Date: $date_header" \
    -H "Authorization: OSS $ALIYUN_OSS_ACCESS_KEY_ID:$signature" \
    "$url")

  cutoff_epoch=$(date -u -d "$BACKUP_RETENTION_DAYS days ago" +%s)
  while IFS= read -r key; do
    key_timestamp=$(basename "$key" | sed -n 's/.*-\([0-9]\{8\}T[0-9]\{6\}Z\)-.*/\1/p')
    if [ -z "$key_timestamp" ]; then
      continue
    fi

    key_epoch=$(date -u -d "${key_timestamp:0:8} ${key_timestamp:9:2}:${key_timestamp:11:2}:${key_timestamp:13:2}" +%s)
    if [ "$key_epoch" -lt "$cutoff_epoch" ]; then
      oss_delete_object "$key"
      echo "Deleted old OSS backup object: $key"
    fi
  done < <(printf '%s' "$xml" | grep -o '<Key>[^<]*</Key>' | sed 's#</\?Key>##g')
}

cleanup_local_retention() {
  if [ "$BACKUP_RETENTION_DAYS" -lt 1 ]; then
    echo "BACKUP_RETENTION_DAYS must be at least 1" >&2
    exit 1
  fi

  find "$BACKUP_DIR" -maxdepth 1 -type f -name "$APP_NAME-$ENVIRONMENT-*.db" -mtime +"$((BACKUP_RETENTION_DAYS - 1))" -print -delete
}

if [ "$BACKUP_UPLOAD_OSS" = "1" ]; then
  oss_put_object
else
  echo "Skipping OSS upload because BACKUP_UPLOAD_OSS=$BACKUP_UPLOAD_OSS"
fi

cleanup_local_retention

echo "$backup_file"
