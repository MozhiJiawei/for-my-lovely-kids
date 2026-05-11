import Fastify from "fastify";
import type { PrismaClient } from "@prisma/client";

import { getDomainSmokeMessage } from "@red-flower-garden/domain";

import { createPrismaClient, initializeDatabase } from "./repositories/database";
import { ensureDefaultState } from "./repositories/state";
import { registerChildRoutes } from "./routes/child";
import { registerParentRoutes } from "./routes/parent";
import { registerStateRoutes } from "./routes/state";
import { registerTestRoutes } from "./routes/test";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export function buildApp(options: { prisma?: PrismaClient; skipDataSetup?: boolean } = {}) {
  const app = Fastify({
    logger: false,
  });
  const prisma = options.prisma ?? createPrismaClient();

  app.decorate("prisma", prisma);

  if (!options.skipDataSetup) {
    app.addHook("onReady", async () => {
      await initializeDatabase(prisma);
      await ensureDefaultState(prisma);
    });
  }

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  app.get("/health", async () => ({
    ok: true,
    service: "red-flower-garden-api",
    domain: getDomainSmokeMessage(),
  }));

  void registerStateRoutes(app);
  void registerChildRoutes(app);
  void registerParentRoutes(app);
  void registerTestRoutes(app);

  return app;
}
