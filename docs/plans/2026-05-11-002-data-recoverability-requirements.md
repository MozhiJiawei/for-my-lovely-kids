---
date: 2026-05-11
status: active
type: requirements
sequence: 2
topic: red-flower-garden-data-recoverability
origin: production-readiness discussion for public-IP minimum system
depends_on: docs/plans/2026-05-11-001-wish-management-use-cases.md
---

# Data Recoverability Requirements

## Background

The public-IP minimum system stores the family's authoritative business data in the server-side SQLite database. If that database is deleted, corrupted, overwritten during deployment, or restored incorrectly, the Mini Program can no longer be trusted by the family.

This requirement covers the first data safety capability: backups, off-server storage, and recovery drills. The goal is not only to create backup files, but to prove that those files can restore a working service.

## Goals

- Ensure production data can be recovered after accidental deletion, database corruption, deployment failure, or server loss.
- Store backup copies outside the server so a single machine failure does not destroy all recovery points.
- Make restore steps repeatable enough to execute under pressure.
- Verify backups automatically instead of assuming a copied file is usable.

## Non-Goals

- No full multi-region disaster recovery.
- No managed database migration in this capability; schema/data versioning is covered separately.
- No long-term public download links for backups.
- No user-facing backup UI inside the Mini Program.

## Requirements

### R1. Deployment Pre-Backup

Before any deployment replaces the running API container or changes the database, the deployment flow must create a timestamped production database backup.

The deployment must stop before changing the service if the backup step fails.

Backup file names must include:

- Environment name, such as `prod`.
- UTC timestamp.
- Current git commit SHA when available.
- A clear reason marker such as `before-deploy`.

Example:

```text
red-flower-prod-20260511T064500Z-94236f4-before-deploy.db
```

### R2. Scheduled Backups

The server must run an automated scheduled backup at least once per day.

The scheduled backup must produce the same kind of verified artifact as deployment pre-backups.

The server-local backup directory must have a retention policy. A minimum acceptable policy is to keep the latest 7 daily backups locally.

### R3. SQLite-Safe Backup Method

Backups must be created using a SQLite-safe method that is valid while the database may be open by the API process.

Directly copying a live database file is not sufficient unless the service is stopped or the copy process uses SQLite's online backup support.

### R4. Backup Integrity Verification

Each backup must be verified before it is considered successful.

The minimum verification is:

- Open the backup as SQLite.
- Run `PRAGMA integrity_check`.
- Fail the backup job if the result is not `ok`.

The verification output must be logged without exposing secrets.

### R5. Aliyun OSS Off-Server Storage

Verified backups must be uploaded to a private Aliyun OSS bucket.

The design should follow the safety model used by the local `gh-oss-attachments` skill:

- Read OSS credentials from a secrets file outside the repository.
- Never print, commit, or store AccessKey secrets in project files.
- Use a private bucket.
- Use prefix-scoped RAM permissions.
- Treat signed URLs as temporary access links, not as the backup retention mechanism.

Recommended object key prefix:

```text
red-flower-garden/backups/prod/
```

The RAM policy should be scoped narrowly to the configured backup prefix.

### R6. OSS Retention

OSS backup retention must be explicit.

The minimum acceptable policy is:

- Keep daily backups for at least 30 days.
- Keep deployment pre-backups for at least 14 days.

Longer retention is allowed if cost remains acceptable.

### R7. Restore From Local Backup

The system must provide a repeatable restore script for server-local backup files.

The restore flow must:

- Validate that the selected backup file exists.
- Run SQLite integrity verification before restore.
- Create a safety backup of the current production database before replacing it.
- Stop the API container.
- Replace the database.
- Start the API container.
- Verify `/health`.
- Verify that `/api/state` can be read with valid server-side credentials or an internal check.

### R8. Restore From OSS Backup

The system must provide a repeatable way to restore from OSS.

The flow must:

- List or select an OSS backup by object key.
- Download it to a temporary server-local path.
- Verify integrity.
- Use the same safe restore process as local backup restoration.

### R9. Recovery Drill

Before the public-IP system is treated as family-use ready, at least one recovery drill must be completed.

The drill must restore a real backup into a temporary Docker volume or isolated test location first, without overwriting production data.

The drill must record:

- Backup object or file used.
- Restore timestamp.
- Git commit associated with the backup when available.
- Verification steps and results.
- Any manual steps required.

### R10. Restore Failure Handling

If restore fails after the original database has been replaced, the restore process must preserve enough information to recover manually.

The preferred behavior is to automatically restore the pre-restore safety backup when possible.

## Acceptance Criteria

- Running the backup command creates a local `.db` file and uploads a verified copy to OSS.
- A deliberately corrupted backup file fails verification.
- Deployment refuses to proceed when pre-backup fails.
- A selected backup can be restored into an isolated temporary volume and serve `/health`.
- A documented drill proves `/api/state` can be read from the restored database.
- OSS object keys do not include local paths, personal names, AccessKeys, or business-sensitive details beyond environment and timestamp.

## Operational Notes

- Backup scripts must not echo `FAMILY_ACCESS_TOKEN`, `PARENT_ACCESS_TOKEN`, or OSS credentials.
- Signed OSS URLs may be generated only for short-lived manual download or debugging.
- The backup system should prefer append-only behavior. Deleting backup files should happen only through documented retention cleanup.
- Restore commands should require an explicit confirmation flag when targeting production.

## Risks

| Risk | Mitigation |
|------|------------|
| Backup copy is corrupt because SQLite was being written | Use SQLite online backup or stop service before copying |
| Backups exist only on the server that failed | Upload verified backups to private OSS |
| Restore script overwrites production with the wrong file | Require explicit file selection, integrity check, and pre-restore safety backup |
| OSS credentials leak | Store credentials outside repo, use prefix-scoped RAM policy, never print secrets |
| Backups silently stop running | Add logged results now; later connect failures to alerting |

