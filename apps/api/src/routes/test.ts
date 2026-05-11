import type { FastifyInstance } from "fastify";

import { assertPrototypeAuth } from "../auth/prototype-auth";
import { loadDomainState, resetToDefaultFixture } from "../repositories/state";

export async function registerTestRoutes(app: FastifyInstance): Promise<void> {
  app.post("/__test/reset", async (request, reply) => {
    const isProduction = process.env.NODE_ENV === "production";
    const isPrototypeResetEnabled = process.env.ENABLE_PROTOTYPE_RESET === "1";

    if (isProduction && !isPrototypeResetEnabled) {
      return reply.code(404).send({
        error: {
          code: "NOT_FOUND",
          message: "Not found.",
        },
      });
    }

    if (isProduction && !assertPrototypeAuth(request, reply, "parent")) {
      return reply;
    }

    await resetToDefaultFixture(app.prisma);

    return loadDomainState(app.prisma);
  });
}
