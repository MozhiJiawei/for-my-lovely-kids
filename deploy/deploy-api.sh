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
RUN_PRE_DEPLOY_BACKUP=${RUN_PRE_DEPLOY_BACKUP:-1}

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

docker_build_args=()
if [ -n "${DOCKER_BUILD_PROGRESS:-}" ]; then
  docker_build_args+=(--progress="$DOCKER_BUILD_PROGRESS")
fi

docker build \
  "${docker_build_args[@]}" \
  --build-arg "NODE_IMAGE=$NODE_IMAGE" \
  --build-arg "NPM_REGISTRY=$NPM_REGISTRY" \
  -t "$IMAGE_NAME" .

if [ "$RUN_PRE_DEPLOY_BACKUP" = "1" ]; then
  if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    BACKUP_REASON=before-deploy \
      CONTAINER_NAME="$CONTAINER_NAME" \
      bash deploy/backup-sqlite.sh >/dev/null
  elif docker volume inspect "$DATA_VOLUME" >/dev/null 2>&1 &&
    docker run --rm -v "$DATA_VOLUME:/data:ro" "$IMAGE_NAME" test -f /data/red-flower-prod.db; then
    BACKUP_REASON=before-deploy-volume \
      BACKUP_ALLOW_VOLUME_FALLBACK=1 \
      CONTAINER_NAME="$CONTAINER_NAME" \
      IMAGE_NAME="$IMAGE_NAME" \
      DATA_VOLUME="$DATA_VOLUME" \
      bash deploy/backup-sqlite.sh >/dev/null
  fi
fi

previous_container=""
if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  previous_container="$CONTAINER_NAME-previous-$(date -u +%Y%m%dT%H%M%SZ)"
  docker rename "$CONTAINER_NAME" "$previous_container"
  docker stop "$previous_container" >/dev/null 2>&1 || true
fi

rollback_previous_container() {
  if [ -n "$previous_container" ] && docker inspect "$previous_container" >/dev/null 2>&1; then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rename "$previous_container" "$CONTAINER_NAME"
    docker start "$CONTAINER_NAME" >/dev/null
    echo "Rolled back to previous container: $CONTAINER_NAME" >&2
  fi
}

docker volume create "$DATA_VOLUME" >/dev/null
if ! docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --env-file "$APP_DIR/deploy/api.env" \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e "PORT=$CONTAINER_PORT" \
  -p "$HOST_PORT:$CONTAINER_PORT" \
  -v "$DATA_VOLUME:/data" \
  "$IMAGE_NAME" >/dev/null; then
  rollback_previous_container
  echo "Failed to start replacement API container" >&2
  exit 1
fi

for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$HOST_PORT/health" >/dev/null; then
    docker ps --filter "name=$CONTAINER_NAME" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    curl -fsS "http://127.0.0.1:$HOST_PORT/health"
    echo
    if [ -n "$previous_container" ]; then
      docker rm -f "$previous_container" >/dev/null 2>&1 || true
    fi
    exit 0
  fi

  sleep 1
done

docker logs --tail 80 "$CONTAINER_NAME" 2>&1 || true
rollback_previous_container
echo "API did not become healthy on port $HOST_PORT" >&2
exit 1
