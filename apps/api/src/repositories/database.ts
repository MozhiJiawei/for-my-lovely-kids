import { mkdirSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

export const balanceId = "default-red-flower-balance";

export function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    mkdirSync("tmp", { recursive: true });
    process.env.DATABASE_URL = "file:../tmp/red-flower-dev.db";
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
      CONSTRAINT "TaskSubmission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
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
      "occurredAt" DATETIME NOT NULL,
      "sourceId" TEXT NOT NULL
    )
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MemorialDecoration" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "wishRedemptionId" TEXT NOT NULL,
      "kind" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL
    )
  `);
}
