import type { Prisma, PrismaClient } from "@prisma/client";

export type MigrationClient = PrismaClient | Prisma.TransactionClient;

export type MigrationLog = {
  migrationId: string;
  message: string;
  affectedRows?: number;
};

export type Migration = {
  id: string;
  name: string;
  purpose: string;
  sourceUrl: string;
  destructive: boolean;
  rollbackNote: string;
  up: (db: MigrationClient, log: (entry: MigrationLog) => void) => Promise<void>;
  verify: (db: MigrationClient) => Promise<void>;
};
