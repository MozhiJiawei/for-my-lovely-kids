import { describe, expect, it } from "vitest";

import { getDomainSmokeMessage } from "./index";

describe("domain smoke", () => {
  it("returns a stable smoke value", () => {
    expect(getDomainSmokeMessage()).toBe("red-flower-domain-ready");
  });
});
