#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/red-flower-garden}
BACKUP_DIR=${BACKUP_DIR:-$APP_DIR/backups}
ENVIRONMENT=${ENVIRONMENT:-prod}
OBJECT_STORAGE_ENV=${OBJECT_STORAGE_ENV:-/etc/red-flower-garden/object-storage.env}
OSS_CURL_CONNECT_TIMEOUT=${OSS_CURL_CONNECT_TIMEOUT:-10}
OSS_CURL_MAX_TIME=${OSS_CURL_MAX_TIME:-120}
OSS_CURL_RETRY=${OSS_CURL_RETRY:-3}
OSS_CURL_RETRY_DELAY=${OSS_CURL_RETRY_DELAY:-2}
DOWNLOAD_ONLY=${DOWNLOAD_ONLY:-0}
CONFIRM_RESTORE_FROM_OSS=${CONFIRM_RESTORE_FROM_OSS:-}
OBJECT_KEY=${1:-}

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required" >&2
    exit 1
  fi
}

require_command curl
require_command date
require_command openssl
require_command sed

if [ ! -f "$OBJECT_STORAGE_ENV" ]; then
  echo "OSS config file not found: $OBJECT_STORAGE_ENV" >&2
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

backup_prefix() {
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

  printf '%s' "$prefix"
}

oss_get() {
  local object_key=$1
  local output_file=$2
  local endpoint host date_header signature url
  endpoint=$(oss_endpoint_host "$ALIYUN_OSS_ENDPOINT")
  host="$ALIYUN_OSS_BUCKET.$endpoint"
  date_header=$(LC_ALL=C date -u '+%a, %d %b %Y %H:%M:%S GMT')
  signature=$(oss_sign "GET" "" "$date_header" "/$ALIYUN_OSS_BUCKET/$object_key")
  url="https://$host/$object_key"

  oss_curl \
    -H "Date: $date_header" \
    -H "Authorization: OSS $ALIYUN_OSS_ACCESS_KEY_ID:$signature" \
    "$url" \
    -o "$output_file"
}

oss_list_backup_keys() {
  local prefix endpoint host date_header signature url xml
  prefix=$(backup_prefix)
  endpoint=$(oss_endpoint_host "$ALIYUN_OSS_ENDPOINT")
  host="$ALIYUN_OSS_BUCKET.$endpoint"
  date_header=$(LC_ALL=C date -u '+%a, %d %b %Y %H:%M:%S GMT')
  signature=$(oss_sign "GET" "" "$date_header" "/$ALIYUN_OSS_BUCKET/")
  url="https://$host/?prefix=$(oss_query_escape "$prefix")"
  xml=$(oss_curl \
    -H "Date: $date_header" \
    -H "Authorization: OSS $ALIYUN_OSS_ACCESS_KEY_ID:$signature" \
    "$url")

  printf '%s' "$xml" | grep -o '<Key>[^<]*</Key>' | sed 's#</\?Key>##g'
}

if [ -z "$OBJECT_KEY" ]; then
  echo "Usage: bash deploy/restore-sqlite-from-oss.sh <oss-object-key|--latest>" >&2
  echo "Recent backup objects:" >&2
  oss_list_backup_keys | tail -n 20 >&2
  exit 1
fi

if [ "$OBJECT_KEY" = "--latest" ]; then
  OBJECT_KEY=$(oss_list_backup_keys | tail -n 1)
  if [ -z "$OBJECT_KEY" ]; then
    echo "No backup objects found under $(backup_prefix)" >&2
    exit 1
  fi
fi

backup_name=$(basename "$OBJECT_KEY")
download_file="$BACKUP_DIR/$backup_name"
partial_file="$download_file.partial"

oss_get "$OBJECT_KEY" "$partial_file"
mv "$partial_file" "$download_file"
chmod 600 "$download_file"
echo "Downloaded OSS backup object: $OBJECT_KEY"
echo "$download_file"

bash deploy/verify-sqlite-backup.sh "$download_file"

if [ "$DOWNLOAD_ONLY" = "1" ]; then
  echo "Skipping restore because DOWNLOAD_ONLY=1"
  exit 0
fi

if [ "$CONFIRM_RESTORE_FROM_OSS" != "restore" ]; then
  echo "Refusing to restore from OSS without CONFIRM_RESTORE_FROM_OSS=restore" >&2
  echo "Downloaded and verified backup remains at: $download_file" >&2
  exit 1
fi

bash deploy/restore-sqlite.sh "$download_file"
