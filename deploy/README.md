# API Deployment

The API deployment is reproducible from this repository with Docker.

## Server Deploy

On the Linux server, keep the repository at `/opt/red-flower-garden`, then run:

```bash
cd /opt/red-flower-garden
bash deploy/deploy-api.sh
```

The script:

- creates `deploy/api.env` with random prototype tokens if it is missing
- builds `red-flower-garden-api:local`
- uses DaoCloud's Node image mirror and npmmirror by default for mainland network reliability
- starts `red-flower-garden-api` on port `3000`
- stores SQLite data in the Docker volume `red-flower-data`
- verifies `GET /health`

For prototype phone testing only, enable the reset endpoint:

```bash
ENABLE_PROTOTYPE_RESET=1 bash deploy/deploy-api.sh
```

For a default Docker Hub/npmjs build instead:

```bash
NODE_IMAGE=node:22-bookworm-slim NPM_REGISTRY=https://registry.npmjs.org/ bash deploy/deploy-api.sh
```

## Compose

If Docker Compose is available:

```bash
cp deploy/api.env.example deploy/api.env
# edit deploy/api.env
docker compose up -d --build
```

The production API listens inside the container on `PORT=3000` and persists SQLite at `/data/red-flower-prod.db`.

## Backup And Restore

Create a timestamped SQLite backup:

```bash
bash deploy/backup-sqlite.sh
```

Restore a backup:

```bash
bash deploy/restore-sqlite.sh /opt/red-flower-garden/backups/red-flower-prod-YYYYMMDDTHHMMSSZ.db
```

The restore script stops the API container, copies the DB into `/data/red-flower-prod.db`, starts the container again, and waits for `/health`.

## Reset Prototype Fixture

For temporary phone testing, deploy with reset enabled:

```bash
ENABLE_PROTOTYPE_RESET=1 bash deploy/deploy-api.sh
```

Then reset the current server fixture:

```bash
CONFIRM=reset bash deploy/reset-fixture.sh
```

Disable reset after testing:

```bash
ENABLE_PROTOTYPE_RESET=0 bash deploy/deploy-api.sh
```
