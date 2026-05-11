---
date: 2026-05-11
status: active
type: requirements
sequence: 3
topic: red-flower-garden-data-versioning-migration-safety
origin: production-readiness discussion for public-IP minimum system
depends_on: docs/plans/2026-05-11-002-data-recoverability-requirements.md
---

# Data Versioning And Migration Safety Requirements

## Background

The current API can initialize and patch SQLite tables during startup. That is useful for prototype speed, but it is risky for family-use production data. Once the public-IP system holds real history, every code update must understand the database version it is running against.

This requirement covers data versioning and migration safety. The core rule is simple: a code update must never silently run against an unknown or incompatible database and corrupt it.

## Goals

- Make database schema and data version explicit.
- Ensure code deployment and database migration are ordered, logged, and recoverable.
- Prevent destructive or incompatible migrations from running accidentally.
- Refuse startup when the database version is unknown, unsupported, or only partially migrated.

## Non-Goals

- No switch from SQLite to Postgres in this requirement.
- No user-facing data migration UI.
- No automatic rollback for every possible migration shape; rollback can use backup restore where needed.
- No historical reprocessing beyond what each migration explicitly requires.

## Requirements

### R1. Explicit Database Version Table

The database must contain a durable record of applied migrations.

At minimum, the record must include:

- Migration id.
- Human-readable name.
- Applied timestamp.
- Git commit or build identifier when available.
- Checksum or equivalent migration content identifier.
- Success/failure state if failed attempts are recorded.

The current database version must be queryable without reading application logs.

### R2. Migration Files Are Versioned In Git

Schema and data migrations must live in the repository and be reviewed with code.

Each migration must have:

- Stable ordered id.
- Purpose summary.
- Forward migration body.
- Verification expectation.
- Rollback note or explicit "restore from backup" note.

### R3. Startup Version Compatibility Check

The API must check database version before serving traffic.

Startup must fail closed when:

- The database has no version metadata after production migration support is introduced.
- The database has a migration that the current code does not recognize.
- Required migrations are missing.
- A previous migration is marked incomplete or failed.

The service must not attempt to serve real requests in those states.

### R4. Deployment Migration Order

Deployment must follow this order for production:

1. Create and verify a pre-deploy backup.
2. Check current database version.
3. Run pending migrations.
4. Verify migration results.
5. Start or replace the API container.
6. Run health and data consistency checks.

If any step fails, deployment must stop and preserve logs.

### R5. Migration Dry Run Or Preflight

Before applying migrations, the deploy flow must perform a preflight check.

The minimum acceptable preflight is:

- Confirm the database is reachable.
- Confirm current version is known.
- List pending migrations.
- Detect migrations marked as destructive.
- Confirm required backup exists for production.

Dry-run SQL support is preferred where practical, but an explicit preflight is the minimum.

### R6. Destructive Change Protection

Destructive migrations must require an explicit production confirmation flag.

Examples of destructive changes:

- Dropping a table.
- Dropping a column.
- Rewriting primary keys.
- Deleting rows outside a documented cleanup.
- Changing the meaning of historical ledger or balance records.

For the public-IP minimum system, destructive migrations should normally be avoided. Prefer additive changes followed by verified data backfill.

### R7. Data Backfill Safety

Migrations that change existing data must be idempotent or protected by migration versioning so they cannot apply twice.

Data backfills must:

- Run inside a transaction where SQLite supports it.
- Log counts of affected rows.
- Verify expected invariants after completion.
- Avoid overwriting user-created production data unless explicitly required.

### R8. Failed Migration Handling

If a migration fails, the system must make the failure obvious.

The deployment must:

- Stop before replacing the healthy running service when possible.
- Keep the pre-deploy backup.
- Preserve migration logs.
- Prevent the new application version from serving requests against a partially migrated database.

Recovery should use the pre-deploy backup unless the failed migration is proven to be fully rolled back.

### R9. Versioned Application Expectations

Application code must know which database version range it supports.

For example, a build may declare:

- Minimum supported database version.
- Target database version.
- Whether it can run with older versions during a rolling migration. For this single-container system, the expected answer should usually be no.

### R10. Local And Test Database Support

Local development and tests must remain easy to run.

Migration tooling must support:

- Creating a fresh local database.
- Migrating an existing local database.
- Resetting test databases safely without affecting production.

Production-only protections must not make local iteration painful, but local shortcuts must not bypass production safety.

## Acceptance Criteria

- A fresh database can be migrated from empty to the latest version.
- An existing production-shaped database can be migrated from the previous version to the latest version.
- The database records which migrations have been applied.
- Starting the API with an unknown future database version fails.
- Starting the API with missing required migrations fails.
- A simulated migration failure prevents the new service from serving traffic.
- Deployment logs show old version, pending migrations, new version, and verification result.
- A migration that changes existing data reports affected row counts and passes post-migration invariants.

## Operational Notes

- Migration commands must not print tokens or OSS credentials.
- The pre-deploy backup capability is a dependency for production migrations.
- In this project, migrations should prefer additive schema changes because the data model is still young and family history is more valuable than schema neatness.
- Manual database edits on production must be treated as emergency operations and followed by a data consistency check.

## Risks

| Risk | Mitigation |
|------|------------|
| New code runs against old schema and writes bad data | Fail startup when required migrations are missing |
| Migration partly applies and app continues running | Record migration state, run in transaction when possible, fail closed |
| Destructive change removes family history | Require explicit confirmation and pre-deploy backup |
| Data backfill runs twice | Version migrations and make backfills idempotent |
| Production and local behavior diverge too much | Support local migrations while keeping production checks strict |

