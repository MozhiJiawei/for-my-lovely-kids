import type { Migration, MigrationClient } from "./types";

export const migration0002WishEntryDetails: Migration = {
  id: "0002",
  name: "wish entry detail fields",
  purpose:
    "Add optional wish image, link, and description fields without changing existing wishes.",
  sourceUrl: import.meta.url,
  destructive: false,
  rollbackNote:
    "Restore from the verified pre-migration backup if the wish detail columns need to be removed.",
  async up(db, log) {
    await addColumnIfMissing(db, "Wish", "description", "TEXT NOT NULL DEFAULT ''", log);
    await addColumnIfMissing(db, "Wish", "imageUrl", "TEXT NOT NULL DEFAULT ''", log);
    await addColumnIfMissing(db, "Wish", "linkUrl", "TEXT NOT NULL DEFAULT ''", log);
  },
  async verify(db) {
    await assertColumnExists(db, "Wish", "description");
    await assertColumnExists(db, "Wish", "imageUrl");
    await assertColumnExists(db, "Wish", "linkUrl");
  },
};

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
      migrationId: migration0002WishEntryDetails.id,
      message: `Added ${tableName}.${columnName}`,
      affectedRows: 1,
    });
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
