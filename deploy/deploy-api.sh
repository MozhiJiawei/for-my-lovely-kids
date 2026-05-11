#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/red-flower-garden}
IMAGE_NAME=${IMAGE_NAME:-red-flower-garden-api:local}
CONTAINER_NAME=${CONTAINER_NAME:-red-flower-garden-api}
DATA_VOLUME=${DATA_VOLUME:-red-flower-data}
HOST_PORT=${HOST_PORT:-3000}
CONTAINER_PORT=${CONTAINER_PORT:-3000}
NODE_IMAGE=${NODE_IMAGE:-m.daocloud.io/docker.io/library/node:22-bookworm-slim}
NPM_REGISTRY=${NPM_REGISTRY:-https://registry.npmmirror.com}
ENABLE_PROTOTYPE_RESET=${ENABLE_PROTOTYPE_RESET:-0}

cd "$APP_DIR"

mkdir -p deploy

if [ ! -f deploy/api.env ]; then
  if ! command -v openssl >/dev/null 2>&1; then
    echo "openssl is required to generate deploy/api.env" >&2
    exit 1
  fi

  family_token=$(openssl rand -hex 24)
  parent_token=$(openssl rand -hex 24)
  cat > deploy/api.env <<EOF
DATABASE_URL=file:/data/red-flower-prod.db
FAMILY_ACCESS_TOKEN=$family_token
PARENT_ACCESS_TOKEN=$parent_token
ENABLE_PROTOTYPE_RESET=$ENABLE_PROTOTYPE_RESET
EOF
  chmod 600 deploy/api.env
else
  if grep -q '^ENABLE_PROTOTYPE_RESET=' deploy/api.env; then
    sed -i "s/^ENABLE_PROTOTYPE_RESET=.*/ENABLE_PROTOTYPE_RESET=$ENABLE_PROTOTYPE_RESET/" deploy/api.env
  else
    printf '\nENABLE_PROTOTYPE_RESET=%s\n' "$ENABLE_PROTOTYPE_RESET" >> deploy/api.env
  fi
fi

docker build \
  --build-arg "NODE_IMAGE=$NODE_IMAGE" \
  --build-arg "NPM_REGISTRY=$NPM_REGISTRY" \
  -t "$IMAGE_NAME" .

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker volume create "$DATA_VOLUME" >/dev/null
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --env-file "$APP_DIR/deploy/api.env" \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e "PORT=$CONTAINER_PORT" \
  -p "$HOST_PORT:$CONTAINER_PORT" \
  -v "$DATA_VOLUME:/data" \
  "$IMAGE_NAME" >/dev/null

for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$HOST_PORT/health" >/dev/null; then
    docker ps --filter "name=$CONTAINER_NAME" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    curl -fsS "http://127.0.0.1:$HOST_PORT/health"
    echo
    exit 0
  fi

  sleep 1
done

docker logs --tail 80 "$CONTAINER_NAME" 2>&1 || true
echo "API did not become healthy on port $HOST_PORT" >&2
exit 1
