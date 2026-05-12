import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { PrismaClient } from "@prisma/client";

import { assertDatabaseIsCompatible, migrateDatabase } from "../migrations/runner";

export const balanceId = "default-red-flower-balance";

export function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    mkdirSync("data", { recursive: true });
    process.env.DATABASE_URL = "file:../data/red-flower-dev.db";
  } else {
    ensureSqliteDatabaseDirectory(process.env.DATABASE_URL);
  }

  return new PrismaClient();
}

function ensureSqliteDatabaseDirectory(databaseUrl: string): void {
  if (!databaseUrl.startsWith("file:")) {
    return;
  }

  const databasePath = databaseUrl.slice("file:".length).split("?")[0];

  if (!databasePath) {
    return;
  }

  mkdirSync(dirname(databasePath), { recursive: true });
}

export async function initializeDatabase(db: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === "production" && process.env.RUN_STARTUP_MIGRATIONS !== "1") {
    await assertDatabaseIsCompatible(db);
    return;
  }

  const buildId = process.env.BUILD_ID ?? process.env.GIT_SHA;

  await migrateDatabase(db, {
    allowDestructive: process.env.ALLOW_DESTRUCTIVE_MIGRATIONS === "1",
    backupVerified: process.env.PRE_DEPLOY_BACKUP_VERIFIED === "1",
    requireBackup: process.env.NODE_ENV === "production",
    ...(buildId ? { buildId } : {}),
  });
}
