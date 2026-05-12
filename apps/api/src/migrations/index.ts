import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { migration0001CurrentSchema } from "./0001-current-schema";
import { migration0002WishEntryDetails } from "./0002-wish-entry-details";
import type { Migration } from "./types";

export const migrations = [
  migration0001CurrentSchema,
  migration0002WishEntryDetails,
] as const satisfies readonly Migration[];

export const minimumSupportedDatabaseVersion = migration0001CurrentSchema.id;
export const targetDatabaseVersion = migrations.at(-1)!.id;

export function getMigrationChecksum(migration: Migration): string {
  const source = readFileSync(fileURLToPath(migration.sourceUrl), "utf8").replace(/\r\n/g, "\n");

  return createHash("sha256")
    .update(
      JSON.stringify({
        id: migration.id,
        name: migration.name,
        purpose: migration.purpose,
        destructive: migration.destructive,
        rollbackNote: migration.rollbackNote,
        source,
      }),
    )
    .digest("hex");
}
