import type { FastifyInstance, FastifyRequest } from "fastify";

import { loadDomainState, resetToDefaultFixture } from "../repositories/state";

export async function registerTestRoutes(app: FastifyInstance): Promise<void> {
  app.post("/__test/reset", async (request, reply) => {
    const isProduction = process.env.NODE_ENV === "production";

    if (isProduction) {
      return reply.code(404).send({
        error: {
          code: "NOT_FOUND",
          message: "Not found.",
        },
      });
    }

    if (!isLocalResetListener() || !isLocalResetRequest(request)) {
      return reply.code(403).send({
        error: {
          code: "LOCAL_RESET_ONLY",
          message:
            "Database reset is only available when the API listens on and is reached through localhost or 127.0.0.1.",
        },
      });
    }

    await resetToDefaultFixture(app.prisma);

    return loadDomainState(app.prisma);
  });
}

function isLocalResetListener(): boolean {
  if (process.env.NODE_ENV === "test") {
    return true;
  }

  return isLocalHostname(process.env.HOST ?? "127.0.0.1");
}

function isLocalResetRequest(request: FastifyRequest): boolean {
  if (process.env.NODE_ENV === "test") {
    return true;
  }

  const hosts = [request.hostname, request.headers.host]
    .flat()
    .filter((host): host is string => typeof host === "string");

  return hosts.some(isLocalHostname);
}

function isLocalHostname(host: string): boolean {
  const normalized = normalizeHostname(host);

  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function normalizeHostname(host: string): string {
  const trimmed = host.trim().toLowerCase();

  if (trimmed.startsWith("[") && trimmed.includes("]")) {
    return trimmed.slice(1, trimmed.indexOf("]"));
  }

  if (trimmed === "::1") {
    return trimmed;
  }

  return trimmed.split(":")[0] ?? trimmed;
}
