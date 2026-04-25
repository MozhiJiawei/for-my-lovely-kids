import type { FastifyInstance } from "fastify";

import { loadDomainState, resetToDefaultFixture } from "../repositories/state";

export async function registerTestRoutes(app: FastifyInstance): Promise<void> {
  app.post("/__test/reset", async (_request, reply) => {
    if (process.env.NODE_ENV !== "test") {
      return reply.code(404).send({
        error: {
          code: "NOT_FOUND",
          message: "Not found.",
        },
      });
    }

    await resetToDefaultFixture(app.prisma);

    return loadDomainState(app.prisma);
  });
}
