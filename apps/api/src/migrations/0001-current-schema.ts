import type { Migration, MigrationClient } from "./types";

export const migration0001CurrentSchema: Migration = {
  id: "0001",
  name: "current application schema baseline",
  purpose:
    "Create the current red flower garden tables and backfill fields that were previously patched at startup.",
  sourceUrl: import.meta.url,
  destructive: false,
  rollbackNote: "Restore from the verified pre-migration backup if this baseline migration fails.",
  async up(db, log) {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Task" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "flowerValue" INTEGER NOT NULL,
        "kind" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL,
        "updatedAt" DATETIME NOT NULL
      )
    `);

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TaskSubmission" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "taskId" TEXT NOT NULL,
        "titleSnapshot" TEXT NOT NULL,
        "flowerValueSnapshot" INTEGER NOT NULL,
        "status" TEXT NOT NULL,
        "submittedAt" DATETIME NOT NULL,
        "confirmedAt" DATETIME,
        "completionKey" TEXT,
        CONSTRAINT "TaskSubmission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await addColumnIfMissing(db, "TaskSubmission", "completionKey", "TEXT", log);
    await backfillTaskSubmissionCompletionKeys(db, log);
    await db.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "TaskSubmission_confirmedCompletionKey_key"
      ON "TaskSubmission" ("completionKey")
      WHERE "status" = 'confirmed' AND "completionKey" IS NOT NULL
    `);

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Wish" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "flowerCost" INTEGER NOT NULL,
        "kind" TEXT NOT NULL DEFAULT 'one_time',
        "pinned" BOOLEAN NOT NULL DEFAULT false,
        "status" TEXT NOT NULL,
        "sortOrder" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL,
        "updatedAt" DATETIME NOT NULL
      )
    `);
    await addColumnIfMissing(db, "Wish", "kind", "TEXT NOT NULL DEFAULT 'one_time'", log);
    await addColumnIfMissing(db, "Wish", "pinned", "BOOLEAN NOT NULL DEFAULT false", log);

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WishRedemption" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "wishId" TEXT NOT NULL,
        "titleSnapshot" TEXT NOT NULL,
        "flowerCostSnapshot" INTEGER NOT NULL,
        "status" TEXT NOT NULL,
        "requestedAt" DATETIME NOT NULL,
        "approvedAt" DATETIME,
        CONSTRAINT "WishRedemption_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "Wish" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RedFlowerBalance" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "available" INTEGER NOT NULL,
        "cumulative" INTEGER NOT NULL,
        "updatedAt" DATETIME NOT NULL
      )
    `);

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RedFlowerLedgerEntry" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "type" TEXT NOT NULL,
        "deltaAvailable" INTEGER NOT NULL,
        "deltaCumulative" INTEGER NOT NULL,
        "flowerKind" TEXT,
        "occurredAt" DATETIME NOT NULL,
        "sourceId" TEXT NOT NULL
      )
    `);
    await addColumnIfMissing(db, "RedFlowerLedgerEntry", "flowerKind", "TEXT", log);
    await backfillLedgerFlowerKinds(db, log);

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MemorialDecoration" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "wishRedemptionId" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL
      )
    `);
  },
  async verify(db) {
    for (const tableName of [
      "Task",
      "TaskSubmission",
      "Wish",
      "WishRedemption",
      "RedFlowerBalance",
      "RedFlowerLedgerEntry",
      "MemorialDecoration",
    ]) {
      await assertTableExists(db, tableName);
    }

    await assertColumnExists(db, "TaskSubmission", "completionKey");
    await assertColumnExists(db, "Wish", "kind");
    await assertColumnExists(db, "Wish", "pinned");
    await assertColumnExists(db, "RedFlowerLedgerEntry", "flowerKind");
  },
};

async function assertTableExists(db: MigrationClient, tableName: string): Promise<void> {
  const rows = await db.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    tableName,
  );

  if (rows.length !== 1) {
    throw new Error(`Expected table to exist after migration: ${tableName}`);
  }
}

async function assertColumnExists(
  db: MigrationClient,
  tableName: string,
  columnName: string,
): Promise<void> {
  const columns = await db.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info("${tableName}")`,
  );

  if (!columns.some((column) => column.name === columnName)) {
    throw new Error(`Expected column to exist after migration: ${tableName}.${columnName}`);
  }
}

async function addColumnIfMissing(
  db: MigrationClient,
  tableName: string,
  columnName: string,
  columnDefinition: string,
  log: (entry: { migrationId: string; message: string; affectedRows?: number }) => void,
): Promise<void> {
  const columns = await db.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info("${tableName}")`,
  );
  const hasColumn = columns.some((column) => column.name === columnName);

  if (!hasColumn) {
    await db.$executeRawUnsafe(
      `ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${columnDefinition}`,
    );
    log({
      migrationId: migration0001CurrentSchema.id,
      message: `Added ${tableName}.${columnName}`,
      affectedRows: 1,
    });
  }
}

async function backfillTaskSubmissionCompletionKeys(
  db: MigrationClient,
  log: (entry: { migrationId: string; message: string; affectedRows?: number }) => void,
): Promise<void> {
  const rows = await db.$queryRaw<
    Array<{
      id: string;
      taskId: string;
      kind: string;
      confirmedAt: Date | string | null;
    }>
  >`
    SELECT s."id", s."taskId", t."kind", s."confirmedAt"
    FROM "TaskSubmission" s
    INNER JOIN "Task" t ON t."id" = s."taskId"
    WHERE s."status" = 'confirmed'
      AND s."completionKey" IS NULL
      AND s."confirmedAt" IS NOT NULL
  `;

  for (const row of rows) {
    const confirmedAt =
      row.confirmedAt instanceof Date ? row.confirmedAt.toISOString() : String(row.confirmedAt);

    await db.$executeRaw`
      UPDATE "TaskSubmission"
      SET "completionKey" = ${createCompletionKey(row.taskId, row.kind, confirmedAt)}
      WHERE "id" = ${row.id}
    `;
  }

  log({
    migrationId: migration0001CurrentSchema.id,
    message: "Backfilled TaskSubmission.completionKey",
    affectedRows: rows.length,
  });
}

function createCompletionKey(taskId: string, kind: string, confirmedAt: string): string {
  if (kind === "one_time") {
    return `one_time:${taskId}`;
  }

  return `repeating:${taskId}:${getBusinessDayKey(confirmedAt)}`;
}

function getBusinessDayKey(value: string): string {
  return new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function backfillLedgerFlowerKinds(
  db: MigrationClient,
  log: (entry: { migrationId: string; message: string; affectedRows?: number }) => void,
): Promise<void> {
  const entries = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "RedFlowerLedgerEntry"
    WHERE "type" = 'task_confirmed'
      AND "flowerKind" IS NULL
  `;

  for (const entry of entries) {
    await db.$executeRaw`
      UPDATE "RedFlowerLedgerEntry"
      SET "flowerKind" = ${choosePersistedFlowerKind(entry.id)}
      WHERE "id" = ${entry.id}
    `;
  }

  log({
    migrationId: migration0001CurrentSchema.id,
    message: "Backfilled RedFlowerLedgerEntry.flowerKind",
    affectedRows: entries.length,
  });
}

function choosePersistedFlowerKind(seed: string): string {
  const flowerKinds = ["coral", "sunny", "berry", "sky"];
  let hash = 0;

  for (const char of seed) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x45d9f3b);
  }

  return flowerKinds[Math.abs(hash) % flowerKinds.length]!;
}
