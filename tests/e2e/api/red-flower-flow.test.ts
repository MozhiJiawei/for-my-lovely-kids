import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../../apps/api/src/app";
import { assertSafePrototypeAuthConfig } from "../../../apps/api/src/auth/prototype-auth";

const familyHeaders = {
  "x-family-token": "family-dev-token",
};

const parentHeaders = {
  "x-parent-token": "parent-dev-token",
};

let tempDir: string;
let prisma: PrismaClient | undefined;

function getPrisma(): PrismaClient {
  if (!prisma) {
    throw new Error("Prisma client was not initialized.");
  }

  return prisma;
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "red-flower-api-"));
  process.env.NODE_ENV = "test";
  delete process.env.FAMILY_ACCESS_TOKEN;
  delete process.env.PARENT_ACCESS_TOKEN;
  process.env.DATABASE_URL = `file:${join(tempDir, "test.db").replaceAll("\\", "/")}`;
  prisma = new PrismaClient();
});

afterEach(async () => {
  await prisma?.$disconnect();
  delete process.env.FAMILY_ACCESS_TOKEN;
  delete process.env.PARENT_ACCESS_TOKEN;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("red flower API flow", () => {
  it("lets parent create task and wish records through the API", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/__test/reset",
    });

    const taskResponse = await app.inject({
      method: "POST",
      url: "/api/parent/tasks",
      headers: parentHeaders,
      payload: {
        title: "帮忙收玩具",
        flowerValue: 3,
        kind: "one_time",
      },
    });

    expect(taskResponse.statusCode).toBe(200);
    expect(taskResponse.json()).toMatchObject({
      task: {
        title: "帮忙收玩具",
        flowerValue: 3,
        kind: "one_time",
        status: "active",
      },
    });

    const wishResponse = await app.inject({
      method: "POST",
      url: "/api/parent/wishes",
      headers: parentHeaders,
      payload: {
        title: "买一本新绘本",
        flowerCost: 6,
      },
    });

    expect(wishResponse.statusCode).toBe(200);
    expect(wishResponse.json()).toMatchObject({
      wish: {
        title: "买一本新绘本",
        flowerCost: 6,
        status: "active",
      },
    });

    await expect(
      getPrisma().task.findFirstOrThrow({
        where: { title: "帮忙收玩具" },
      }),
    ).resolves.toMatchObject({
      flowerValue: 3,
      kind: "one_time",
      status: "active",
    });
    await expect(
      getPrisma().wish.findFirstOrThrow({
        where: { title: "买一本新绘本" },
      }),
    ).resolves.toMatchObject({
      flowerCost: 6,
      status: "active",
    });

    await app.close();
  });

  it("backfills test fixture tasks and wishes when an existing database is missing them", async () => {
    await getPrisma().$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RedFlowerBalance" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "available" INTEGER NOT NULL,
        "cumulative" INTEGER NOT NULL,
        "updatedAt" DATETIME NOT NULL
      )
    `);
    await getPrisma().redFlowerBalance.create({
      data: {
        id: "default-red-flower-balance",
        available: 0,
        cumulative: 0,
        updatedAt: new Date("2026-04-25T08:00:00.000Z"),
      },
    });

    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    const state = await app.inject({
      method: "GET",
      url: "/api/state",
      headers: familyHeaders,
    });

    expect(state.statusCode).toBe(200);
    expect(state.json()).toMatchObject({
      taskBook: {
        tasks: expect.arrayContaining([
          expect.objectContaining({
            id: "test-task-brush-teeth",
            status: "test",
          }),
          expect.objectContaining({
            id: "test-task-toys",
            status: "test",
          }),
          expect.objectContaining({
            id: "test-task-reading",
            status: "test",
          }),
        ]),
      },
      wishBook: {
        wishes: expect.arrayContaining([
          expect.objectContaining({
            id: "test-wish-carousel",
            status: "test",
          }),
          expect.objectContaining({
            id: "test-wish-picture-book",
            status: "test",
          }),
          expect.objectContaining({
            id: "test-wish-ice-cream",
            status: "test",
          }),
        ]),
      },
    });

    await app.close();
  });

  it("keeps task submission pending until parent confirmation adds official flowers", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/__test/reset",
    });

    const submitted = await app.inject({
      method: "POST",
      url: "/api/child/task-submissions",
      headers: familyHeaders,
      payload: {
        taskId: "test-task-brush-teeth",
      },
    });

    expect(submitted.statusCode).toBe(200);
    expect(submitted.json()).toMatchObject({
      submission: {
        taskId: "test-task-brush-teeth",
        status: "pending",
        flowerValueSnapshot: 2,
      },
      state: {
        redFlowers: {
          balance: {
            available: 0,
            cumulative: 0,
          },
        },
      },
    });

    const submissionId = submitted.json().submission.id as string;

    const confirmed = await app.inject({
      method: "POST",
      url: "/api/parent/task-confirmations",
      headers: parentHeaders,
      payload: {
        submissionIds: [submissionId],
      },
    });

    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({
      redFlowers: {
        balance: {
          available: 2,
          cumulative: 2,
        },
        ledger: [
          {
            type: "task_confirmed",
            deltaAvailable: 2,
            deltaCumulative: 2,
            sourceId: submissionId,
          },
        ],
      },
    });

    const savedSubmission = await getPrisma().taskSubmission.findUniqueOrThrow({
      where: { id: submissionId },
    });
    const savedBalance = await getPrisma().redFlowerBalance.findUniqueOrThrow({
      where: { id: "default-red-flower-balance" },
    });
    const savedLedger = await getPrisma().redFlowerLedgerEntry.findMany({
      orderBy: { occurredAt: "asc" },
    });

    expect(savedSubmission.status).toBe("confirmed");
    expect(savedSubmission.flowerValueSnapshot).toBe(2);
    expect(savedBalance.available).toBe(2);
    expect(savedBalance.cumulative).toBe(2);
    expect(savedLedger).toHaveLength(1);
    expect(savedLedger[0]).toMatchObject({
      type: "task_confirmed",
      deltaAvailable: 2,
      deltaCumulative: 2,
      sourceId: submissionId,
    });

    await app.close();
  });

  it("approves wish redemption by spending available flowers and creating a memorial decoration", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/__test/reset",
    });

    const first = await app.inject({
      method: "POST",
      url: "/api/child/task-submissions",
      headers: familyHeaders,
      payload: {
        taskId: "test-task-brush-teeth",
      },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/child/task-submissions",
      headers: familyHeaders,
      payload: {
        taskId: "test-task-brush-teeth",
      },
    });
    const third = await app.inject({
      method: "POST",
      url: "/api/child/task-submissions",
      headers: familyHeaders,
      payload: {
        taskId: "test-task-brush-teeth",
      },
    });
    const fourth = await app.inject({
      method: "POST",
      url: "/api/child/task-submissions",
      headers: familyHeaders,
      payload: {
        taskId: "test-task-brush-teeth",
      },
    });
    const fifth = await app.inject({
      method: "POST",
      url: "/api/child/task-submissions",
      headers: familyHeaders,
      payload: {
        taskId: "test-task-brush-teeth",
      },
    });
    const sixth = await app.inject({
      method: "POST",
      url: "/api/child/task-submissions",
      headers: familyHeaders,
      payload: {
        taskId: "test-task-brush-teeth",
      },
    });

    const submissionIds = [first, second, third, fourth, fifth, sixth].map(
      (response) => response.json().submission.id as string,
    );

    await app.inject({
      method: "POST",
      url: "/api/parent/task-confirmations",
      headers: parentHeaders,
      payload: {
        submissionIds,
      },
    });

    const requested = await app.inject({
      method: "POST",
      url: "/api/child/wish-redemptions",
      headers: familyHeaders,
      payload: {
        wishId: "test-wish-carousel",
      },
    });

    expect(requested.statusCode).toBe(200);
    expect(requested.json()).toMatchObject({
      redemption: {
        wishId: "test-wish-carousel",
        status: "pending",
        flowerCostSnapshot: 10,
      },
      state: {
        redFlowers: {
          balance: {
            available: 12,
            cumulative: 12,
          },
        },
      },
    });

    const redemptionId = requested.json().redemption.id as string;

    const approved = await app.inject({
      method: "POST",
      url: `/api/parent/wish-redemptions/${redemptionId}/approve`,
      headers: parentHeaders,
    });

    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      redemption: {
        id: redemptionId,
        status: "approved",
      },
      state: {
        redFlowers: {
          balance: {
            available: 2,
            cumulative: 12,
          },
        },
        garden: {
          memorialDecorations: [
            {
              wishRedemptionId: redemptionId,
              kind: "wish_memorial",
            },
          ],
        },
      },
    });

    const savedRedemption = await getPrisma().wishRedemption.findUniqueOrThrow({
      where: { id: redemptionId },
    });
    const savedBalance = await getPrisma().redFlowerBalance.findUniqueOrThrow({
      where: { id: "default-red-flower-balance" },
    });
    const savedDecorations = await getPrisma().memorialDecoration.findMany({
      where: { wishRedemptionId: redemptionId },
    });
    const savedWishLedger = await getPrisma().redFlowerLedgerEntry.findMany({
      where: { sourceId: redemptionId },
    });

    expect(savedRedemption.status).toBe("approved");
    expect(savedRedemption.flowerCostSnapshot).toBe(10);
    expect(savedBalance.available).toBe(2);
    expect(savedBalance.cumulative).toBe(12);
    expect(savedDecorations).toHaveLength(1);
    expect(savedDecorations[0]).toMatchObject({
      wishRedemptionId: redemptionId,
      kind: "wish_memorial",
    });
    expect(savedWishLedger).toEqual([
      expect.objectContaining({
        type: "wish_approved",
        deltaAvailable: -10,
        deltaCumulative: 0,
        sourceId: redemptionId,
      }),
    ]);

    await app.close();
  });

  it("redeems a wish in one API action and creates a memorial decoration", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/__test/reset",
    });

    const submissions = await Promise.all(
      Array.from({ length: 5 }, () =>
        app.inject({
          method: "POST",
          url: "/api/child/task-submissions",
          headers: familyHeaders,
          payload: {
            taskId: "test-task-brush-teeth",
          },
        }),
      ),
    );

    await app.inject({
      method: "POST",
      url: "/api/parent/task-confirmations",
      headers: parentHeaders,
      payload: {
        submissionIds: submissions.map((response) => response.json().submission.id as string),
      },
    });

    const redeemed = await app.inject({
      method: "POST",
      url: "/api/child/wish-redemptions/redeem",
      headers: familyHeaders,
      payload: {
        wishId: "test-wish-carousel",
      },
    });

    expect(redeemed.statusCode).toBe(200);
    expect(redeemed.json()).toMatchObject({
      redemption: {
        wishId: "test-wish-carousel",
        status: "approved",
        flowerCostSnapshot: 10,
      },
      state: {
        redFlowers: {
          balance: {
            available: 0,
            cumulative: 10,
          },
        },
        garden: {
          memorialDecorations: [
            expect.objectContaining({
              kind: "wish_memorial",
            }),
          ],
        },
      },
    });

    const redemptionId = redeemed.json().redemption.id as string;

    await expect(
      getPrisma().wishRedemption.findUniqueOrThrow({
        where: { id: redemptionId },
      }),
    ).resolves.toMatchObject({
      status: "approved",
      flowerCostSnapshot: 10,
    });
    await expect(
      getPrisma().memorialDecoration.findFirstOrThrow({
        where: { wishRedemptionId: redemptionId },
      }),
    ).resolves.toMatchObject({
      kind: "wish_memorial",
    });

    await app.close();
  });

  it("returns structured errors when POST bodies are missing", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/__test/reset",
    });

    const taskSubmission = await app.inject({
      method: "POST",
      url: "/api/child/task-submissions",
      headers: familyHeaders,
    });
    const wishRedemption = await app.inject({
      method: "POST",
      url: "/api/child/wish-redemptions",
      headers: familyHeaders,
    });
    const wishRedeem = await app.inject({
      method: "POST",
      url: "/api/child/wish-redemptions/redeem",
      headers: familyHeaders,
    });
    const taskConfirmation = await app.inject({
      method: "POST",
      url: "/api/parent/task-confirmations",
      headers: parentHeaders,
    });

    expect(taskSubmission.statusCode).toBe(400);
    expect(taskSubmission.json()).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "taskId is required.",
      },
    });
    expect(wishRedemption.statusCode).toBe(400);
    expect(wishRedemption.json()).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "wishId is required.",
      },
    });
    expect(wishRedeem.statusCode).toBe(400);
    expect(wishRedeem.json()).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "wishId is required.",
      },
    });
    expect(taskConfirmation.statusCode).toBe(400);
    expect(taskConfirmation.json()).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "submissionIds is required.",
      },
    });

    await expect(getPrisma().taskSubmission.count()).resolves.toBe(0);
    await expect(getPrisma().wishRedemption.count()).resolves.toBe(0);
    await expect(getPrisma().redFlowerLedgerEntry.count()).resolves.toBe(0);

    await app.close();
  });

  it("rejects public binding with default prototype tokens outside test mode", () => {
    process.env.NODE_ENV = "development";

    expect(() => assertSafePrototypeAuthConfig("0.0.0.0")).toThrow(
      "FAMILY_ACCESS_TOKEN and PARENT_ACCESS_TOKEN must be set to non-default values",
    );
    expect(() => assertSafePrototypeAuthConfig("127.0.0.1")).not.toThrow();

    process.env.FAMILY_ACCESS_TOKEN = "family-local-secret";
    process.env.PARENT_ACCESS_TOKEN = "parent-local-secret";

    expect(() => assertSafePrototypeAuthConfig("0.0.0.0")).not.toThrow();
  });

  it("rejects test reset outside test mode", async () => {
    process.env.NODE_ENV = "development";
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/__test/reset",
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });
});
