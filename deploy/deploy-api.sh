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
RUN_PRE_DEPLOY_BACKUP=${RUN_PRE_DEPLOY_BACKUP:-1}
FORCE_REBUILD=${FORCE_REBUILD:-0}
FORCE_RECREATE=${FORCE_RECREATE:-0}
ALLOW_DESTRUCTIVE_MIGRATIONS=${ALLOW_DESTRUCTIVE_MIGRATIONS:-0}

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
EOF
  chmod 600 deploy/api.env
fi

image_exists() {
  docker image inspect "$IMAGE_NAME" >/dev/null 2>&1
}

build_image() {
  docker_build_args=()
  if [ -n "${DOCKER_BUILD_PROGRESS:-}" ]; then
    docker_build_args+=(--progress="$DOCKER_BUILD_PROGRESS")
  fi

  docker build \
    "${docker_build_args[@]}" \
    --build-arg "NODE_IMAGE=$NODE_IMAGE" \
    --build-arg "NPM_REGISTRY=$NPM_REGISTRY" \
    -t "$IMAGE_NAME" .
}

container_has_code_mounts() {
  docker inspect "$CONTAINER_NAME" \
    --format '{{range .Mounts}}{{println .Destination}}{{end}}' 2>/dev/null |
    grep -qx '/app/apps/api/src' &&
    docker inspect "$CONTAINER_NAME" \
      --format '{{range .Mounts}}{{println .Destination}}{{end}}' 2>/dev/null |
      grep -qx '/app/packages/domain/src'
}

container_has_prisma_mount() {
  docker inspect "$CONTAINER_NAME" \
    --format '{{range .Mounts}}{{println .Destination}}{{end}}' 2>/dev/null |
    grep -qx '/app/prisma'
}

wait_for_health() {
  for _ in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:$HOST_PORT/health" >/dev/null; then
      docker container ls --filter "name=$CONTAINER_NAME" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
      curl -fsS "http://127.0.0.1:$HOST_PORT/health"
      echo
      return 0
    fi

    sleep 1
  done

  docker logs --tail 80 "$CONTAINER_NAME" 2>&1 || true
  echo "API did not become healthy on port $HOST_PORT" >&2
  return 1
}

database_exists() {
  docker volume inspect "$DATA_VOLUME" >/dev/null 2>&1 &&
    docker run --rm -v "$DATA_VOLUME:/data:ro" "$IMAGE_NAME" test -f /data/red-flower-prod.db
}

run_migration_command() {
  local command=$1
  docker run --rm \
    --env-file "$APP_DIR/deploy/api.env" \
    -e NODE_ENV=production \
    -e "BUILD_ID=$git_sha" \
    -e "PRE_DEPLOY_BACKUP_VERIFIED=$pre_deploy_backup_verified" \
    -e "ALLOW_DESTRUCTIVE_MIGRATIONS=$ALLOW_DESTRUCTIVE_MIGRATIONS" \
    -v "$APP_DIR/apps/api/src:/app/apps/api/src:ro" \
    -v "$APP_DIR/packages/domain/src:/app/packages/domain/src:ro" \
    -v "$APP_DIR/prisma:/app/prisma:ro" \
    -v "$DATA_VOLUME:/data" \
    "$IMAGE_NAME" \
    sh -lc "pnpm exec prisma generate >/tmp/prisma-generate.log && pnpm --filter @red-flower-garden/api exec tsx src/migrate.ts '$command'"
}

if [ "$FORCE_REBUILD" = "1" ] || ! image_exists; then
  build_image
else
  echo "Using existing image $IMAGE_NAME. Set FORCE_REBUILD=1 to rebuild dependencies/runtime." >&2
fi

git_sha=${GIT_SHA:-}
if [ -z "$git_sha" ] && command -v git >/dev/null 2>&1; then
  git_sha=$(git rev-parse --short HEAD 2>/dev/null || true)
fi
if [ -z "$git_sha" ]; then
  git_sha="unknown"
fi

docker volume create "$DATA_VOLUME" >/dev/null

had_database=0
if database_exists; then
  had_database=1
fi

pre_deploy_backup_verified=0
stopped_for_migration=0
echo "Migration status:"
migration_status=$(run_migration_command status)
printf '%s\n' "$migration_status"
pending_migrations=$(printf '%s\n' "$migration_status" | sed -n 's/^pending=//p')
if [ -z "$pending_migrations" ]; then
  echo "Migration status did not report pending migrations." >&2
  exit 1
fi

if [ "$pending_migrations" != "<none>" ]; then
  FORCE_RECREATE=1
fi

if [ "$pending_migrations" != "<none>" ] && [ "$had_database" = "1" ]; then
  if [ "$RUN_PRE_DEPLOY_BACKUP" != "1" ]; then
    echo "Existing production database requires RUN_PRE_DEPLOY_BACKUP=1 before migrations." >&2
    exit 1
  fi

  if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    BACKUP_REASON=before-migration \
      CONTAINER_NAME="$CONTAINER_NAME" \
      bash deploy/backup-sqlite.sh
  else
    BACKUP_REASON=before-migration-volume \
      BACKUP_ALLOW_VOLUME_FALLBACK=1 \
      CONTAINER_NAME="$CONTAINER_NAME" \
      IMAGE_NAME="$IMAGE_NAME" \
      DATA_VOLUME="$DATA_VOLUME" \
      bash deploy/backup-sqlite.sh
  fi
  pre_deploy_backup_verified=1
else
  if [ "$pending_migrations" = "<none>" ]; then
    echo "No pending migrations; skipping pre-migration backup and migration apply." >&2
  else
    echo "No existing production database found; migration will initialize a fresh database." >&2
  fi
  pre_deploy_backup_verified=1
fi

if [ "$pending_migrations" != "<none>" ]; then
  echo "Migration preflight:"
  run_migration_command preflight
  if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    echo "Stopping API container before applying migrations to prevent writes during migration." >&2
    docker stop "$CONTAINER_NAME" >/dev/null
    stopped_for_migration=1
  fi
  echo "Applying pending migrations:"
  run_migration_command up
fi
echo "Post-migration compatibility check:"
run_migration_command check

if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1 &&
  [ "$FORCE_RECREATE" != "1" ] &&
  container_has_code_mounts &&
  container_has_prisma_mount; then
  if [ "$stopped_for_migration" = "1" ]; then
    docker start "$CONTAINER_NAME" >/dev/null
  else
    docker restart "$CONTAINER_NAME" >/dev/null
  fi
  wait_for_health
  exit $?
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

if ! docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --env-file "$APP_DIR/deploy/api.env" \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e "PORT=$CONTAINER_PORT" \
  -p "$HOST_PORT:$CONTAINER_PORT" \
  -v "$APP_DIR/apps/api/src:/app/apps/api/src:ro" \
  -v "$APP_DIR/packages/domain/src:/app/packages/domain/src:ro" \
  -v "$APP_DIR/prisma:/app/prisma:ro" \
  -v "$DATA_VOLUME:/data" \
  "$IMAGE_NAME" \
  sh -lc "pnpm exec prisma generate && pnpm --filter @red-flower-garden/api exec tsx src/server.ts" >/dev/null; then
  rollback_previous_container
  echo "Failed to start replacement API container" >&2
  exit 1
fi

if wait_for_health; then
  if [ -n "$previous_container" ]; then
    docker rm -f "$previous_container" >/dev/null 2>&1 || true
  fi
  exit 0
fi

rollback_previous_container
exit 1
