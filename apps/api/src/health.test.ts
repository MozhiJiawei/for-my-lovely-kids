import { describe, expect, it } from "vitest";

import { buildApp } from "./app";

describe("GET /health", () => {
  it("returns a successful smoke response", async () => {
    const app = buildApp({ skipDataSetup: true });

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      service: "red-flower-garden-api",
      domain: "red-flower-domain-ready",
    });
  });
});
