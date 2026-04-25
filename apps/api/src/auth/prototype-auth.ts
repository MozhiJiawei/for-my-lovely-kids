import type { FastifyReply, FastifyRequest } from "fastify";

type AuthMode = "family" | "parent";

const defaultFamilyToken = "family-dev-token";
const defaultParentToken = "parent-dev-token";
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);

export function assertSafePrototypeAuthConfig(host: string): void {
  if (process.env.NODE_ENV === "test" || loopbackHosts.has(host)) {
    return;
  }

  const familyToken = process.env.FAMILY_ACCESS_TOKEN;
  const parentToken = process.env.PARENT_ACCESS_TOKEN;

  if (
    !familyToken ||
    !parentToken ||
    familyToken === defaultFamilyToken ||
    parentToken === defaultParentToken
  ) {
    throw new Error(
      "FAMILY_ACCESS_TOKEN and PARENT_ACCESS_TOKEN must be set to non-default values before binding the API to a non-loopback host.",
    );
  }
}

export function assertPrototypeAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  mode: AuthMode,
): boolean {
  const headerName = mode === "family" ? "x-family-token" : "x-parent-token";
  const expected =
    mode === "family"
      ? (process.env.FAMILY_ACCESS_TOKEN ?? defaultFamilyToken)
      : (process.env.PARENT_ACCESS_TOKEN ?? defaultParentToken);

  if (request.headers[headerName] !== expected) {
    void reply.code(401).send({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid prototype access token.",
      },
    });
    return false;
  }

  return true;
}
