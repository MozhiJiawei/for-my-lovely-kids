import type { FastifyInstance } from "fastify";

import { assertPrototypeAuth } from "../auth/prototype-auth";
import { loadDomainState } from "../repositories/state";

export async function registerStateRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/state", async (request, reply) => {
    if (!assertPrototypeAuth(request, reply, "family")) {
      return;
    }

    return loadDomainState(app.prisma);
  });
}
