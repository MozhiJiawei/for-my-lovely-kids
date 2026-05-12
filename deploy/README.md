# API Deployment

The API deployment is reproducible from this repository with Docker.

## Server Deploy

On the Linux server, keep the repository at `/opt/red-flower-garden`, then run:

```bash
cd /opt/red-flower-garden
bash deploy/deploy-api.sh
```

The script:

- creates `deploy/api.env` with random API tokens if it is missing
- builds `red-flower-garden-api:local` only when the image is missing or `FORCE_REBUILD=1`
- uses DaoCloud's Node image mirror and npmmirror by default for mainland network reliability
- mounts API and domain source code read-only from the server checkout into the container
- restarts the existing mounted container for ordinary source-only changes
- checks the current database version and pending migrations
- creates a verified pre-migration SQLite backup only when pending migrations will run against an existing production database
- stops the API container before applying pending migrations so old code cannot write during migration
- runs migration preflight, applies pending versioned migrations, and checks database compatibility before replacing or restarting the API container
- starts or restarts `red-flower-garden-api` on port `3000`
- rolls back to the previous container if the replacement fails its health check
- stores SQLite data in the Docker volume `red-flower-data`
- verifies `GET /health`

For source-only backend changes, sync the repository on the server and run:

```bash
bash deploy/deploy-api.sh
```

For dependency, Dockerfile, runtime package, or package metadata changes, rebuild the runtime image
explicitly:

```bash
FORCE_REBUILD=1 bash deploy/deploy-api.sh
```

For a default Docker Hub/npmjs build instead:

```bash
FORCE_REBUILD=1 NODE_IMAGE=node:22-bookworm-slim NPM_REGISTRY=https://registry.npmjs.org/ bash deploy/deploy-api.sh
```

## Compose

If Docker Compose is available:

```bash
cp deploy/api.env.example deploy/api.env
# edit deploy/api.env
docker compose up -d --build
```

The production API listens inside the container on `PORT=3000` and persists SQLite at `/data/red-flower-prod.db`.
API, domain, and Prisma schema files are bind-mounted into the container. The deploy flow refreshes
the generated Prisma client inside the runtime container before migration commands and API startup,
so additive schema migrations do not require a full image rebuild unless dependencies or runtime
packages changed.

## Database Migrations

Database changes are versioned in `apps/api/src/migrations`. A schema change must add a new ordered
migration file and register it in `apps/api/src/migrations/index.ts`; CI runs
`pnpm run db:migration-guard` so `prisma/schema.prisma` cannot change without an upgrade migration.

Useful local commands:

```bash
pnpm --filter @red-flower-garden/api exec tsx src/migrate.ts status
pnpm --filter @red-flower-garden/api exec tsx src/migrate.ts up
pnpm --filter @red-flower-garden/api exec tsx src/migrate.ts check
```

Production deploys run:

1. migration status check
2. API container recreation when pending migrations exist, so startup refreshes the generated Prisma client
3. verified pre-migration backup when pending migrations exist
4. migration preflight
5. stop the current API container before applying pending migrations
6. pending migrations
7. compatibility check
8. API restart or replacement

Destructive migrations must set `destructive: true` in their migration metadata and require
`ALLOW_DESTRUCTIVE_MIGRATIONS=1` during deployment. Prefer additive migrations and data backfills
for family history data.

## Backup And Restore

### OSS Configuration

Backups upload to a private Aliyun OSS bucket. Use a bucket dedicated to this app; do not reuse
the local `gh-oss-attachments.env` credentials.

On the server:

```bash
sudo mkdir -p /etc/red-flower-garden
sudo cp deploy/object-storage.env.example /etc/red-flower-garden/object-storage.env
sudo chmod 600 /etc/red-flower-garden/object-storage.env
sudo editor /etc/red-flower-garden/object-storage.env
```

Recommended RAM policy shape:

- allow only the dedicated bucket
- allow only the configured app prefix, for example `red-flower-garden/`
- include object read/write/list/delete permissions needed for upload and retention cleanup

The script never prints AccessKey values. Object keys are shaped like:

```text
red-flower-garden/backups/prod/red-flower-prod-20260511T064500Z-94236f4-before-deploy.db
```

`ALIYUN_OSS_PREFIX` is the app-level object root. The backup script stores database backups under
`${ALIYUN_OSS_PREFIX}backups/<environment>/`. Future object features, such as uploaded images, should
use sibling prefixes under the same app root.

`ALIYUN_OSS_PUBLIC_BASE_URL` is optional. Set it to a CDN domain or public bucket URL when Mini Program
features need to display uploaded objects such as wish images.

### Manual Backup

Create a timestamped SQLite backup with SQLite online backup support, integrity verification,
OSS upload, and the default three-day retention cleanup:

```bash
bash deploy/backup-sqlite.sh
```

The command is intentionally standalone so deployment, software upgrade, and data migration flows
can call it before making a risky change:

```bash
BACKUP_REASON=before-migration bash deploy/backup-sqlite.sh
```

Useful overrides:

```bash
BACKUP_RETENTION_DAYS=7 bash deploy/backup-sqlite.sh
OBJECT_STORAGE_ENV=/etc/red-flower-garden/object-storage.env bash deploy/backup-sqlite.sh
BACKUP_UPLOAD_OSS=0 bash deploy/backup-sqlite.sh
OSS_CURL_MAX_TIME=180 OSS_CURL_RETRY=5 bash deploy/backup-sqlite.sh
```

`BACKUP_UPLOAD_OSS=0` is for local dry runs only. Production backups should upload to OSS.

### Daily Automatic Backup

Install the daily systemd timer on the server:

```bash
sudo bash deploy/install-backup-timer.sh
```

By default it runs every day at `03:30` server time:

```bash
sudo BACKUP_TIME=02:15 bash deploy/install-backup-timer.sh
```

Check timer and recent backup logs:

```bash
systemctl list-timers red-flower-garden-backup.timer
journalctl -u red-flower-garden-backup.service -n 80 --no-pager
```

### Restore

Verify a local backup file without restoring it:

```bash
bash deploy/verify-sqlite-backup.sh /opt/red-flower-garden/backups/red-flower-prod-YYYYMMDDTHHMMSSZ.db
```

Restore a backup:

```bash
bash deploy/restore-sqlite.sh /opt/red-flower-garden/backups/red-flower-prod-YYYYMMDDTHHMMSSZ.db
```

The restore script verifies the backup, creates a local before-restore safety backup, stops the API
container, copies the DB into `/data/red-flower-prod.db`, starts the container again, and waits for
`/health` plus `/api/state` when `FAMILY_ACCESS_TOKEN` is available. If the replacement copy fails,
the script restarts the original container. If the restored service fails its readiness checks, the
script rolls back to the before-restore safety backup.

Download and verify a backup from OSS without restoring:

```bash
DOWNLOAD_ONLY=1 bash deploy/restore-sqlite-from-oss.sh red-flower-garden/backups/prod/red-flower-prod-YYYYMMDDTHHMMSSZ.db
```

Restore the latest OSS backup:

```bash
CONFIRM_RESTORE_FROM_OSS=restore bash deploy/restore-sqlite-from-oss.sh --latest
```

Restore a specific OSS object:

```bash
CONFIRM_RESTORE_FROM_OSS=restore bash deploy/restore-sqlite-from-oss.sh red-flower-garden/backups/prod/red-flower-prod-YYYYMMDDTHHMMSSZ.db
```

## Local Development Fixture

The fixture reset endpoint is available only outside `NODE_ENV=production`. To reset a local API
that is running in development mode:

```bash
CONFIRM=reset bash deploy/reset-fixture.sh
```

The script refuses non-local API URLs.
