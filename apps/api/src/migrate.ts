import { createPrismaClient } from "./repositories/database";
import {
  assertDatabaseIsCompatible,
  getMigrationStatus,
  migrateDatabase,
  preflightMigrations,
} from "./migrations/runner";

const command = process.argv[2] ?? "status";
const prisma = createPrismaClient();

try {
  if (command === "status") {
    printStatus(await getMigrationStatus(prisma));
  } else if (command === "preflight") {
    const status = await preflightMigrations(prisma, {
      allowDestructive: process.env.ALLOW_DESTRUCTIVE_MIGRATIONS === "1",
      backupVerified: process.env.PRE_DEPLOY_BACKUP_VERIFIED === "1",
      requireBackup: process.env.NODE_ENV === "production",
    });
    printStatus(status);
  } else if (command === "up") {
    const buildId = process.env.BUILD_ID ?? process.env.GIT_SHA;
    const result = await migrateDatabase(prisma, {
      allowDestructive: process.env.ALLOW_DESTRUCTIVE_MIGRATIONS === "1",
      backupVerified: process.env.PRE_DEPLOY_BACKUP_VERIFIED === "1",
      requireBackup: process.env.NODE_ENV === "production",
      ...(buildId ? { buildId } : {}),
    });
    console.log(`old_version=${result.oldVersion ?? "<none>"}`);
    console.log(`new_version=${result.newVersion ?? "<none>"}`);
    console.log(`applied=${result.applied.length === 0 ? "<none>" : result.applied.join(",")}`);
    for (const log of result.logs) {
      const count = log.affectedRows === undefined ? "" : ` affected_rows=${log.affectedRows}`;
      console.log(`migration=${log.migrationId} ${log.message}${count}`);
    }
  } else if (command === "check") {
    await assertDatabaseIsCompatible(prisma);
    printStatus(await getMigrationStatus(prisma));
  } else {
    throw new Error(`Unknown migration command: ${command}`);
  }
} finally {
  await prisma.$disconnect();
}

function printStatus(status: Awaited<ReturnType<typeof getMigrationStatus>>): void {
  console.log(`metadata_table=${status.hasMetadataTable ? "present" : "missing"}`);
  console.log(`current_version=${status.currentVersion ?? "<none>"}`);
  console.log(`minimum_supported_version=${status.minimumSupportedVersion}`);
  console.log(`target_version=${status.targetVersion}`);
  console.log(
    `pending=${status.pending.length === 0 ? "<none>" : status.pending.map((m) => m.id).join(",")}`,
  );
  console.log(
    `destructive_pending=${
      status.destructivePending.length === 0
        ? "<none>"
        : status.destructivePending.map((m) => m.id).join(",")
    }`,
  );
}
