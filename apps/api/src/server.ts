import { buildApp } from "./app";
import { assertSafePrototypeAuthConfig } from "./auth/prototype-auth";

const app = buildApp();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

try {
  assertSafePrototypeAuthConfig(host);
  await app.listen({ host, port });
  app.log.info(`API listening on http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  console.error(error);
  process.exit(1);
}
