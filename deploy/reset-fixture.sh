#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/red-flower-garden}
API_BASE_URL=${API_BASE_URL:-http://127.0.0.1:3000}
CONFIRM=${CONFIRM:-}

cd "$APP_DIR"

if [ "$CONFIRM" != "reset" ]; then
  echo "Refusing to reset without confirmation. Run: CONFIRM=reset bash deploy/reset-fixture.sh" >&2
  exit 1
fi

case "$API_BASE_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *)
    echo "Refusing to reset a non-local API. This fixture reset is for local development only." >&2
    exit 1
    ;;
esac

curl -fsS \
  -X POST \
  -H "content-type: application/json" \
  -d '{}' \
  "$API_BASE_URL/__test/reset"
echo
