import type { Prisma, PrismaClient } from "@prisma/client";

import {
  getMigrationChecksum,
  migrations,
  minimumSupportedDatabaseVersion,
  targetDatabaseVersion,
} from "./index";
import type { Migration, MigrationLog } from "./types";

type MigrationRow = {
  id: string;
  name: string;
  appliedAt: Date | string | null;
  buildId: string | null;
  checksum: string;
  status: string;
  failureMessage: string | null;
  rollbackNote: string;
};

export type MigrationStatus = {
  currentVersion: string | null;
  targetVersion: string;
  minimumSupportedVersion: string;
  hasMetadataTable: boolean;
  applied: MigrationRow[];
  pending: Migration[];
  failed: MigrationRow[];
  unknown: MigrationRow[];
  checksumMismatches: MigrationRow[];
  destructivePending: Migration[];
};

export type MigrationRunResult = {
  oldVersion: string | null;
  newVersion: string | null;
  applied: string[];
  logs: MigrationLog[];
};

export async function getMigrationStatus(db: PrismaClient): Promise<MigrationStatus> {
  await assertDatabaseReachable(db);

  const hasMetadataTable = await migrationTableExists(db);
  const applied = hasMetadataTable ? await getAppliedMigrations(db) : [];
  const registryById = new Map(migrations.map((migration) => [migration.id, migration]));
  const successfulIds = new Set(
    applied.filter((migration) => migration.status === "success").map((migration) => migration.id),
  );
  const failed = applied.filter((migration) => migration.status !== "success");
  const unknown = applied.filter((migration) => !registryById.has(migration.id));
  const checksumMismatches = applied.filter((row) => {
    const migration = registryById.get(row.id);
    return (
      migration && row.status === "success" && row.checksum !== getMigrationChecksum(migration)
    );
  });
  const pending = migrations.filter((migration) => !successfulIds.has(migration.id));

  return {
    currentVersion: getCurrentVersion(applied),
    targetVersion: targetDatabaseVersion,
    minimumSupportedVersion: minimumSupportedDatabaseVersion,
    hasMetadataTable,
    applied,
    pending,
    failed,
    unknown,
    checksumMismatches,
    destructivePending: pending.filter((migration) => migration.destructive),
  };
}

export async function preflightMigrations(
  db: PrismaClient,
  options: { requireBackup?: boolean; backupVerified?: boolean; allowDestructive?: boolean } = {},
): Promise<MigrationStatus> {
  const status = await getMigrationStatus(db);
  const errors = collectBlockingErrors(status, { requireComplete: false });

  if (status.destructivePending.length > 0 && !options.allowDestructive) {
    errors.push(
      `Destructive pending migrations require ALLOW_DESTRUCTIVE_MIGRATIONS=1: ${status.destructivePending
        .map((migration) => migration.id)
        .join(", ")}`,
    );
  }

  if (options.requireBackup && !options.backupVerified) {
    errors.push("Production migration preflight requires a verified pre-deploy backup.");
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  return status;
}

export async function migrateDatabase(
  db: PrismaClient,
  options: {
    buildId?: string;
    allowDestructive?: boolean;
    requireBackup?: boolean;
    backupVerified?: boolean;
  } = {},
): Promise<MigrationRunResult> {
  await ensureMigrationTable(db);
  await preflightMigrations(db, {
    requireBackup: options.requireBackup ?? false,
    backupVerified: options.backupVerified ?? false,
    ...(options.allowDestructive === undefined
      ? {}
      : { allowDestructive: options.allowDestructive }),
  });

  const oldStatus = await getMigrationStatus(db);
  const applied: string[] = [];
  const logs: MigrationLog[] = [];

  for (const migration of oldStatus.pending) {
    if (migration.destructive && !options.allowDestructive) {
      throw new Error(`Migration ${migration.id} is destructive and requires explicit permission.`);
    }

    const checksum = getMigrationChecksum(migration);

    try {
      await db.$transaction(async (tx) => {
        await recordMigrationStarted(tx, migration, checksum, options.buildId);
        await migration.up(tx, (entry) => logs.push(entry));
        await migration.verify(tx);
        await tx.$executeRaw`
          UPDATE "DatabaseMigration"
          SET "status" = 'success',
              "appliedAt" = CURRENT_TIMESTAMP,
              "failureMessage" = NULL
          WHERE "id" = ${migration.id}
        `;
      });
      applied.push(migration.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordMigrationFailed(db, migration, checksum, options.buildId, message);
      throw new Error(`Migration ${migration.id} failed: ${message}`);
    }
  }

  const newStatus = await getMigrationStatus(db);
  assertDatabaseIsCompatibleStatus(newStatus);

  return {
    oldVersion: oldStatus.currentVersion,
    newVersion: newStatus.currentVersion,
    applied,
    logs,
  };
}

export async function assertDatabaseIsCompatible(db: PrismaClient): Promise<void> {
  const status = await getMigrationStatus(db);
  assertDatabaseIsCompatibleStatus(status);
}

function assertDatabaseIsCompatibleStatus(status: MigrationStatus): void {
  const errors = collectBlockingErrors(status, { requireComplete: true });

  if (!status.hasMetadataTable) {
    errors.push("Database has no DatabaseMigration metadata table.");
  }

  if (status.pending.length > 0) {
    errors.push(`Required migrations are missing: ${status.pending.map((m) => m.id).join(", ")}`);
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
}

function collectBlockingErrors(
  status: MigrationStatus,
  options: { requireComplete: boolean },
): string[] {
  const errors: string[] = [];

  if (status.unknown.length > 0) {
    errors.push(
      `Database contains unknown migrations: ${status.unknown.map((m) => m.id).join(", ")}`,
    );
  }

  if (status.failed.length > 0) {
    errors.push(
      `Database has incomplete or failed migrations: ${status.failed
        .map((migration) => `${migration.id}:${migration.status}`)
        .join(", ")}`,
    );
  }

  if (status.checksumMismatches.length > 0) {
    errors.push(
      `Applied migration checksums do not match the current code: ${status.checksumMismatches
        .map((migration) => migration.id)
        .join(", ")}`,
    );
  }

  if (options.requireComplete && !isAtLeastMinimumVersion(status.currentVersion)) {
    errors.push(
      `Database version ${status.currentVersion ?? "<none>"} is below minimum supported version ${
        status.minimumSupportedVersion
      }.`,
    );
  }

  return errors;
}

function isAtLeastMinimumVersion(version: string | null): boolean {
  return version !== null && version >= minimumSupportedDatabaseVersion;
}

async function assertDatabaseReachable(db: PrismaClient): Promise<void> {
  await db.$queryRaw`SELECT 1`;
}

async function ensureMigrationTable(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DatabaseMigration" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "appliedAt" DATETIME,
      "buildId" TEXT,
      "checksum" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "failureMessage" TEXT,
      "rollbackNote" TEXT NOT NULL
    )
  `);
}

async function migrationTableExists(db: PrismaClient): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ name: string }>>`
    SELECT "name"
    FROM "sqlite_master"
    WHERE "type" = 'table'
      AND "name" = 'DatabaseMigration'
  `;

  return rows.length === 1;
}

async function getAppliedMigrations(db: PrismaClient): Promise<MigrationRow[]> {
  return db.$queryRaw<MigrationRow[]>`
    SELECT "id", "name", "appliedAt", "buildId", "checksum", "status", "failureMessage", "rollbackNote"
    FROM "DatabaseMigration"
    ORDER BY "id" ASC
  `;
}

function getCurrentVersion(applied: MigrationRow[]): string | null {
  return (
    applied
      .filter((migration) => migration.status === "success")
      .map((migration) => migration.id)
      .sort()
      .at(-1) ?? null
  );
}

async function recordMigrationStarted(
  db: PrismaClient | Prisma.TransactionClient,
  migration: Migration,
  checksum: string,
  buildId: string | undefined,
): Promise<void> {
  await db.$executeRaw`
    INSERT INTO "DatabaseMigration" (
      "id",
      "name",
      "appliedAt",
      "buildId",
      "checksum",
      "status",
      "failureMessage",
      "rollbackNote"
    )
    VALUES (
      ${migration.id},
      ${migration.name},
      NULL,
      ${buildId ?? null},
      ${checksum},
      'running',
      NULL,
      ${migration.rollbackNote}
    )
    ON CONFLICT("id") DO UPDATE SET
      "name" = excluded."name",
      "buildId" = excluded."buildId",
      "checksum" = excluded."checksum",
      "status" = 'running',
      "failureMessage" = NULL,
      "rollbackNote" = excluded."rollbackNote"
  `;
}

async function recordMigrationFailed(
  db: PrismaClient,
  migration: Migration,
  checksum: string,
  buildId: string | undefined,
  message: string,
): Promise<void> {
  await db.$executeRaw`
    INSERT INTO "DatabaseMigration" (
      "id",
      "name",
      "appliedAt",
      "buildId",
      "checksum",
      "status",
      "failureMessage",
      "rollbackNote"
    )
    VALUES (
      ${migration.id},
      ${migration.name},
      NULL,
      ${buildId ?? null},
      ${checksum},
      'failed',
      ${message},
      ${migration.rollbackNote}
    )
    ON CONFLICT("id") DO UPDATE SET
      "name" = excluded."name",
      "buildId" = excluded."buildId",
      "checksum" = excluded."checksum",
      "status" = 'failed',
      "failureMessage" = excluded."failureMessage",
      "rollbackNote" = excluded."rollbackNote"
  `;
}
