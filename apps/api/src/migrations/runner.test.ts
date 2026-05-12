import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertDatabaseIsCompatible, getMigrationStatus, migrateDatabase } from "./runner";
import { targetDatabaseVersion } from "./index";

let tempDir: string;
let prisma: PrismaClient;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "red-flower-migrations-"));
  process.env.DATABASE_URL = `file:${join(tempDir, "test.db").replaceAll("\\", "/")}`;
  prisma = new PrismaClient();
});

afterEach(async () => {
  await prisma.$disconnect();
  delete process.env.DATABASE_URL;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("database migrations", () => {
  it("migrates a fresh database to the target version and records metadata", async () => {
    const result = await migrateDatabase(prisma, { buildId: "test-build" });

    expect(result).toMatchObject({
      oldVersion: null,
      newVersion: targetDatabaseVersion,
      applied: ["0001"],
    });
    await expect(getMigrationStatus(prisma)).resolves.toMatchObject({
      currentVersion: targetDatabaseVersion,
      pending: [],
      failed: [],
      unknown: [],
    });
    await expect(
      prisma.$queryRaw<Array<{ id: string; buildId: string; status: string }>>`
        SELECT "id", "buildId", "status"
        FROM "DatabaseMigration"
      `,
    ).resolves.toEqual([
      expect.objectContaining({
        id: "0001",
        buildId: "test-build",
        status: "success",
      }),
    ]);
  });

  it("fails closed when migration metadata is missing", async () => {
    await expect(assertDatabaseIsCompatible(prisma)).rejects.toThrow(
      "Database has no DatabaseMigration metadata table.",
    );
  });

  it("requires a verified backup before applying production migrations when requested", async () => {
    await expect(
      migrateDatabase(prisma, {
        requireBackup: true,
        backupVerified: false,
      }),
    ).rejects.toThrow("Production migration preflight requires a verified pre-deploy backup.");

    await expect(
      migrateDatabase(prisma, {
        requireBackup: true,
        backupVerified: true,
      }),
    ).resolves.toMatchObject({
      newVersion: targetDatabaseVersion,
    });
  });

  it("fails closed when a required migration is missing", async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "DatabaseMigration" (
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

    await expect(assertDatabaseIsCompatible(prisma)).rejects.toThrow(
      "Required migrations are missing: 0001",
    );
  });

  it("fails closed when the database contains an unknown future migration", async () => {
    await migrateDatabase(prisma);
    await prisma.$executeRaw`
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
        '9999',
        'future migration',
        CURRENT_TIMESTAMP,
        'future-build',
        'future-checksum',
        'success',
        NULL,
        'restore from backup'
      )
    `;

    await expect(assertDatabaseIsCompatible(prisma)).rejects.toThrow(
      "Database contains unknown migrations: 9999",
    );
  });

  it("fails closed when a previous migration attempt is incomplete", async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "DatabaseMigration" (
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
    await prisma.$executeRaw`
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
        '0001',
        'current application schema baseline',
        NULL,
        'test-build',
        'test-checksum',
        'failed',
        'simulated failure',
        'restore from backup'
      )
    `;

    await expect(assertDatabaseIsCompatible(prisma)).rejects.toThrow(
      "Database has incomplete or failed migrations: 0001:failed",
    );
  });
});
