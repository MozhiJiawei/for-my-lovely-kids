#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/red-flower-garden}
API_BASE_URL=${API_BASE_URL:-http://127.0.0.1:3000}
CONFIRM=${CONFIRM:-}

cd "$APP_DIR"

if [ ! -f deploy/api.env ]; then
  echo "Missing deploy/api.env" >&2
  exit 1
fi

if ! grep -q '^ENABLE_PROTOTYPE_RESET=1$' deploy/api.env; then
  echo "ENABLE_PROTOTYPE_RESET must be 1 in deploy/api.env. Re-run deploy/deploy-api.sh with ENABLE_PROTOTYPE_RESET=1." >&2
  exit 1
fi

if [ "$CONFIRM" != "reset" ]; then
  echo "Refusing to reset without confirmation. Run: CONFIRM=reset bash deploy/reset-fixture.sh" >&2
  exit 1
fi

parent_token=$(sed -n 's/^PARENT_ACCESS_TOKEN=//p' deploy/api.env)

if [ -z "$parent_token" ]; then
  echo "Missing PARENT_ACCESS_TOKEN in deploy/api.env" >&2
  exit 1
fi

curl -fsS \
  -X POST \
  -H "content-type: application/json" \
  -H "x-parent-token: $parent_token" \
  -d '{}' \
  "$API_BASE_URL/__test/reset"
echo
