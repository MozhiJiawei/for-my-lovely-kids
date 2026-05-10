import { mkdirSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

export const balanceId = "default-red-flower-balance";

export function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    mkdirSync("data", { recursive: true });
    process.env.DATABASE_URL = "file:../data/red-flower-dev.db";
  }

  return new PrismaClient();
}

export async function initializeDatabase(db: PrismaClient): Promise<void> {
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

  await addColumnIfMissing(db, "TaskSubmission", "completionKey", "TEXT");
  await backfillTaskSubmissionCompletionKeys(db);
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
      "status" TEXT NOT NULL,
      "sortOrder" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL,
      "updatedAt" DATETIME NOT NULL
    )
  `);

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

  await addColumnIfMissing(db, "RedFlowerLedgerEntry", "flowerKind", "TEXT");
  await backfillLedgerFlowerKinds(db);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MemorialDecoration" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "wishRedemptionId" TEXT NOT NULL,
      "kind" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL
    )
  `);
}

async function backfillTaskSubmissionCompletionKeys(db: PrismaClient): Promise<void> {
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

async function backfillLedgerFlowerKinds(db: PrismaClient): Promise<void> {
  const entries = await db.redFlowerLedgerEntry.findMany({
    where: {
      type: "task_confirmed",
      flowerKind: null,
    },
    select: {
      id: true,
    },
  });

  for (const entry of entries) {
    await db.redFlowerLedgerEntry.update({
      where: {
        id: entry.id,
      },
      data: {
        flowerKind: choosePersistedFlowerKind(entry.id),
      },
    });
  }
}

function choosePersistedFlowerKind(seed: string): string {
  const flowerKinds = ["coral", "sunny", "berry", "sky"];
  let hash = 0;

  for (const char of seed) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x45d9f3b);
  }

  return flowerKinds[Math.abs(hash) % flowerKinds.length]!;
}

async function addColumnIfMissing(
  db: PrismaClient,
  tableName: string,
  columnName: string,
  columnDefinition: string,
): Promise<void> {
  const columns = await db.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info("${tableName}")`,
  );
  const hasColumn = columns.some((column) => column.name === columnName);

  if (!hasColumn) {
    await db.$executeRawUnsafe(
      `ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${columnDefinition}`,
    );
  }
}
