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
- creates a verified pre-deployment SQLite backup when an existing API container must be recreated
- starts or restarts `red-flower-garden-api` on port `3000`
- rolls back to the previous container if the replacement fails its health check
- stores SQLite data in the Docker volume `red-flower-data`
- verifies `GET /health`

For source-only backend changes, sync the repository on the server and run:

```bash
bash deploy/deploy-api.sh
```

For dependency, Dockerfile, Prisma client generation, or package metadata changes, rebuild the
runtime image explicitly:

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
API and domain source code are bind-mounted into the container, so source-only changes need a
container restart rather than an image rebuild.

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
