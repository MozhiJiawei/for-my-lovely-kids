import Fastify from "fastify";

import { getDomainSmokeMessage } from "@red-flower-garden/domain";

export function buildApp() {
  const app = Fastify({
    logger: false,
  });

  app.get("/health", async () => ({
    ok: true,
    service: "red-flower-garden-api",
    domain: getDomainSmokeMessage(),
  }));

  return app;
}
