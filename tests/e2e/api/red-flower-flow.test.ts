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

const fixtureHistory = {
  availableFlowers: 56,
  cumulativeFlowers: 76,
  taskSubmissions: 33,
  wishRedemptions: 3,
  ledgerEntries: 36,
};

let tempDir: string;
let prisma: PrismaClient | undefined;

function getPrisma(): PrismaClient {
  if (!prisma) {
    throw new Error("Prisma client was not initialized.");
  }

  return prisma;
}

async function resetFixture(app: ReturnType<typeof buildApp>) {
  const response = await app.inject({
    method: "POST",
    url: "/__test/reset",
  });

  expect(response.statusCode).toBe(200);

  return response.json();
}

async function createManagedTask(
  app: ReturnType<typeof buildApp>,
  payload: { title: string; flowerValue: number; kind: "repeating" | "one_time" },
) {
  const response = await app.inject({
    method: "POST",
    url: "/api/parent/tasks",
    headers: parentHeaders,
    payload,
  });

  expect(response.statusCode).toBe(200);

  return response.json().task.id as string;
}

async function createManagedWish(
  app: ReturnType<typeof buildApp>,
  payload: { title: string; flowerCost: number; kind?: "repeating" | "one_time"; pinned?: boolean },
) {
  const response = await app.inject({
    method: "POST",
    url: "/api/parent/wishes",
    headers: parentHeaders,
    payload,
  });

  expect(response.statusCode).toBe(200);

  return response.json().wish.id as string;
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
  it("serves domain state as a non-cacheable source of truth", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    const state = await app.inject({
      method: "GET",
      url: "/api/state",
      headers: familyHeaders,
    });

    expect(state.statusCode).toBe(200);
    expect(state.headers["cache-control"]).toBe("no-store");

    await app.close();
  });

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
        kind: "one_time",
        pinned: false,
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
      kind: "one_time",
      pinned: false,
      status: "active",
    });

    await app.close();
  });

  it("persists wish management fields and updates them through the API", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/__test/reset",
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/parent/wishes",
      headers: parentHeaders,
      payload: {
        title: "每周一次家庭电影夜",
        flowerCost: 8,
        kind: "repeating",
        pinned: true,
      },
    });

    expect(created.statusCode).toBe(200);
    const wishId = created.json().wish.id as string;
    expect(created.json()).toMatchObject({
      wish: {
        id: wishId,
        title: "每周一次家庭电影夜",
        flowerCost: 8,
        kind: "repeating",
        pinned: true,
        status: "active",
      },
    });

    const updated = await app.inject({
      method: "POST",
      url: `/api/parent/wishes/${wishId}`,
      headers: parentHeaders,
      payload: {
        title: "家庭电影夜",
        flowerCost: 7,
        kind: "one_time",
        pinned: false,
      },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      wish: {
        id: wishId,
        title: "家庭电影夜",
        flowerCost: 7,
        kind: "one_time",
        pinned: false,
        status: "active",
      },
      state: {
        wishBook: {
          wishes: expect.arrayContaining([
            expect.objectContaining({
              id: wishId,
              title: "家庭电影夜",
              flowerCost: 7,
              kind: "one_time",
              pinned: false,
            }),
          ]),
        },
      },
    });

    await expect(
      getPrisma().wish.findUniqueOrThrow({
        where: { id: wishId },
      }),
    ).resolves.toMatchObject({
      title: "家庭电影夜",
      flowerCost: 7,
      kind: "one_time",
      pinned: false,
      status: "active",
    });

    await app.close();
  });

  it("persists task management edits and archive deletion through the API", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/__test/reset",
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/parent/tasks",
      headers: parentHeaders,
      payload: {
        title: "每天整理书包",
        flowerValue: 2,
        kind: "repeating",
      },
    });

    expect(created.statusCode).toBe(200);
    const taskId = created.json().task.id as string;

    const updated = await app.inject({
      method: "POST",
      url: `/api/parent/tasks/${taskId}`,
      headers: parentHeaders,
      payload: {
        title: "每天睡前整理书包",
        flowerValue: 3,
        kind: "repeating",
      },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      task: {
        id: taskId,
        title: "每天睡前整理书包",
        flowerValue: 3,
        kind: "repeating",
        status: "active",
      },
    });

    const submitted = await app.inject({
      method: "POST",
      url: "/api/child/task-submissions",
      headers: familyHeaders,
      payload: { taskId },
    });

    expect(submitted.statusCode).toBe(200);
    expect(submitted.json()).toMatchObject({
      submission: {
        taskId,
        titleSnapshot: "每天睡前整理书包",
        flowerValueSnapshot: 3,
        status: "confirmed",
      },
    });

    const deleted = await app.inject({
      method: "POST",
      url: `/api/parent/tasks/${taskId}/delete`,
      headers: parentHeaders,
    });

    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({
      task: {
        id: taskId,
        status: "archived",
      },
      state: {
        taskBook: {
          tasks: expect.arrayContaining([
            expect.objectContaining({
              id: taskId,
              title: "每天睡前整理书包",
              status: "archived",
            }),
          ]),
          submissions: expect.arrayContaining([
            expect.objectContaining({
              taskId,
              titleSnapshot: "每天睡前整理书包",
              flowerValueSnapshot: 3,
              status: "confirmed",
            }),
          ]),
        },
      },
    });

    await expect(
      getPrisma().task.findUniqueOrThrow({
        where: { id: taskId },
      }),
    ).resolves.toMatchObject({
      title: "每天睡前整理书包",
      flowerValue: 3,
      kind: "repeating",
      status: "archived",
    });
    await expect(
      getPrisma().taskSubmission.count({
        where: { taskId },
      }),
    ).resolves.toBe(1);

    const submitDeleted = await app.inject({
      method: "POST",
      url: "/api/child/task-submissions",
      headers: familyHeaders,
      payload: { taskId },
    });

    expect(submitDeleted.statusCode).toBe(400);
    expect(submitDeleted.json()).toMatchObject({
      error: {
        code: "TASK_NOT_ACTIVE",
      },
    });
    await expect(
      getPrisma().taskSubmission.count({
        where: { taskId },
      }),
    ).resolves.toBe(1);

    const kindSwitchCreated = await app.inject({
      method: "POST",
      url: "/api/parent/tasks",
      headers: parentHeaders,
      payload: {
        title: "学会整理床铺",
        flowerValue: 4,
        kind: "repeating",
      },
    });

    expect(kindSwitchCreated.statusCode).toBe(200);
    const kindSwitchTaskId = kindSwitchCreated.json().task.id as string;

    const kindSwitchUpdated = await app.inject({
      method: "POST",
      url: `/api/parent/tasks/${kindSwitchTaskId}`,
      headers: parentHeaders,
      payload: {
        title: "独立整理床铺",
        flowerValue: 5,
        kind: "one_time",
      },
    });

    expect(kindSwitchUpdated.statusCode).toBe(200);
    expect(kindSwitchUpdated.json()).toMatchObject({
      task: {
        id: kindSwitchTaskId,
        title: "独立整理床铺",
        flowerValue: 5,
        kind: "one_time",
        status: "active",
      },
      state: {
        taskBook: {
          tasks: expect.arrayContaining([
            expect.objectContaining({
              id: kindSwitchTaskId,
              title: "独立整理床铺",
              flowerValue: 5,
              kind: "one_time",
              status: "active",
            }),
          ]),
        },
      },
    });
    await expect(
      getPrisma().task.findUniqueOrThrow({
        where: { id: kindSwitchTaskId },
      }),
    ).resolves.toMatchObject({
      title: "独立整理床铺",
      flowerValue: 5,
      kind: "one_time",
      status: "active",
    });

    await app.close();
  });

  it("keeps managed fixture task edits and deletions after app restart", async () => {
    let app = buildApp({ prisma: getPrisma() });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/__test/reset",
    });

    const edited = await app.inject({
      method: "POST",
      url: "/api/parent/tasks/test-task-drink-water",
      headers: parentHeaders,
      payload: {
        title: "主动喝一杯水",
        flowerValue: 3,
        kind: "one_time",
      },
    });

    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({
      task: {
        id: "test-task-drink-water",
        title: "主动喝一杯水",
        flowerValue: 3,
        kind: "one_time",
        status: "test",
      },
    });

    const deleted = await app.inject({
      method: "POST",
      url: "/api/parent/tasks/test-task-brush-teeth/delete",
      headers: parentHeaders,
    });

    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({
      task: {
        id: "test-task-brush-teeth",
        status: "archived",
      },
    });

    await app.close();

    app = buildApp({ prisma: getPrisma() });
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
            id: "test-task-drink-water",
            title: "主动喝一杯水",
            flowerValue: 3,
            kind: "one_time",
            status: "test",
          }),
          expect.objectContaining({
            id: "test-task-brush-teeth",
            status: "archived",
          }),
        ]),
      },
    });

    await expect(
      getPrisma().task.findUniqueOrThrow({
        where: { id: "test-task-drink-water" },
      }),
    ).resolves.toMatchObject({
      title: "主动喝一杯水",
      flowerValue: 3,
      kind: "one_time",
      status: "test",
    });
    await expect(
      getPrisma().task.findUniqueOrThrow({
        where: { id: "test-task-brush-teeth" },
      }),
    ).resolves.toMatchObject({
      status: "archived",
    });

    await app.close();
  });

  it("does not seed test fixtures on startup and keeps fixture reset explicit", async () => {
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
        tasks: [],
      },
      wishBook: {
        wishes: [],
      },
    });

    const reset = await resetFixture(app);

    expect(reset).toMatchObject({
      redFlowers: {
        balance: {
          available: fixtureHistory.availableFlowers,
          cumulative: fixtureHistory.cumulativeFlowers,
        },
      },
      taskBook: {
        submissions: expect.arrayContaining([
          expect.objectContaining({
            taskId: "test-task-brush-teeth",
            status: "confirmed",
          }),
          expect.objectContaining({
            taskId: "test-task-say-thanks",
            status: "confirmed",
          }),
        ]),
        tasks: expect.arrayContaining([
          expect.objectContaining({
            id: "test-task-brush-teeth",
            status: "test",
          }),
        ]),
      },
      wishBook: {
        wishes: expect.arrayContaining([
          expect.objectContaining({
            id: "test-wish-carousel",
            status: "archived",
          }),
          expect.objectContaining({
            id: "test-wish-picture-book",
            status: "archived",
          }),
          expect.objectContaining({
            id: "test-wish-ice-cream",
            status: "test",
          }),
        ]),
        redemptions: expect.arrayContaining([
          expect.objectContaining({
            wishId: "test-wish-carousel",
            status: "approved",
          }),
        ]),
      },
    });

    await app.close();
  });

  it("seeds consistent May history for statistics after explicit fixture reset", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    const state = await resetFixture(app);

    expect(state.redFlowers.balance).toMatchObject({
      available: fixtureHistory.availableFlowers,
      cumulative: fixtureHistory.cumulativeFlowers,
    });
    expect(state.taskBook.submissions).toHaveLength(fixtureHistory.taskSubmissions);
    expect(state.wishBook.redemptions).toHaveLength(fixtureHistory.wishRedemptions);
    expect(state.redFlowers.ledger).toHaveLength(fixtureHistory.ledgerEntries);
    expect(state.taskBook.submissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: "test-task-brush-teeth",
          confirmedAt: expect.stringContaining("2026-05-11"),
          flowerValueSnapshot: 2,
        }),
        expect.objectContaining({
          taskId: "test-task-drink-water",
          confirmedAt: expect.stringContaining("2026-05-11"),
          flowerValueSnapshot: 1,
        }),
        expect.objectContaining({
          taskId: "test-task-say-thanks",
          confirmedAt: expect.stringContaining("2026-05-11"),
          flowerValueSnapshot: 1,
        }),
        expect.objectContaining({
          taskId: "test-task-toys",
          confirmedAt: expect.stringContaining("2026-05-03"),
          flowerValueSnapshot: 3,
        }),
        expect.objectContaining({
          taskId: "test-task-write-name",
          confirmedAt: expect.stringContaining("2026-05-08"),
          flowerValueSnapshot: 6,
        }),
        expect.objectContaining({
          taskId: "test-task-ride-bike",
          confirmedAt: expect.stringContaining("2026-05-09"),
          flowerValueSnapshot: 8,
        }),
        expect.objectContaining({
          taskId: "test-task-count-twenty",
          confirmedAt: expect.stringContaining("2026-05-10"),
          flowerValueSnapshot: 4,
        }),
      ]),
    );
    expect(state.wishBook.redemptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          wishId: "test-wish-carousel",
          approvedAt: expect.stringContaining("2026-05-06"),
          flowerCostSnapshot: 10,
        }),
        expect.objectContaining({
          wishId: "test-wish-picture-book",
          approvedAt: expect.stringContaining("2026-05-10"),
          flowerCostSnapshot: 6,
        }),
      ]),
    );
    expect(state.taskBook.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "test-task-toys",
          kind: "one_time",
          status: "archived",
        }),
        expect.objectContaining({
          id: "test-task-write-name",
          kind: "one_time",
          status: "archived",
        }),
        expect.objectContaining({
          id: "test-task-ride-bike",
          kind: "one_time",
          status: "archived",
        }),
        expect.objectContaining({
          id: "test-task-count-twenty",
          kind: "one_time",
          status: "archived",
        }),
        expect.objectContaining({
          id: "test-task-tie-shoes",
          kind: "one_time",
          status: "test",
        }),
      ]),
    );
    expect(state.wishBook.wishes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "test-wish-carousel",
          status: "archived",
          pinned: false,
        }),
        expect.objectContaining({
          id: "test-wish-picture-book",
          status: "archived",
        }),
        expect.objectContaining({
          id: "test-wish-ice-cream",
          kind: "repeating",
          status: "test",
        }),
      ]),
    );

    await expect(getPrisma().taskSubmission.count()).resolves.toBe(fixtureHistory.taskSubmissions);
    await expect(getPrisma().wishRedemption.count()).resolves.toBe(fixtureHistory.wishRedemptions);
    await expect(getPrisma().redFlowerLedgerEntry.count()).resolves.toBe(
      fixtureHistory.ledgerEntries,
    );

    await app.close();
  });

  it("migrates legacy wish tables with default management fields", async () => {
    await getPrisma().$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Wish" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "flowerCost" INTEGER NOT NULL,
        "status" TEXT NOT NULL,
        "sortOrder" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL,
        "updatedAt" DATETIME NOT NULL
      )
    `);
    await getPrisma().$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RedFlowerBalance" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "available" INTEGER NOT NULL,
        "cumulative" INTEGER NOT NULL,
        "updatedAt" DATETIME NOT NULL
      )
    `);
    await getPrisma().$executeRawUnsafe(`
      INSERT INTO "Wish" ("id", "title", "flowerCost", "status", "sortOrder", "createdAt", "updatedAt")
      VALUES ('legacy-wish', 'Legacy wish', 5, 'active', 99, '2026-05-10T00:00:00.000Z', '2026-05-10T00:00:00.000Z')
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

    const columns =
      await getPrisma().$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("Wish")`);
    const state = await app.inject({
      method: "GET",
      url: "/api/state",
      headers: familyHeaders,
    });

    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["kind", "pinned"]),
    );
    expect(state.statusCode).toBe(200);
    expect(state.json()).toMatchObject({
      wishBook: {
        wishes: expect.arrayContaining([
          expect.objectContaining({
            id: "legacy-wish",
            kind: "one_time",
            pinned: false,
          }),
        ]),
      },
    });

    await app.close();
  });

  it("completes a child task immediately and persists official flowers", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/__test/reset",
    });
    const taskId = await createManagedTask(app, {
      title: "今天自己穿衣服",
      flowerValue: 2,
      kind: "repeating",
    });

    const submitted = await app.inject({
      method: "POST",
      url: "/api/child/task-submissions",
      headers: familyHeaders,
      payload: {
        taskId,
      },
    });

    expect(submitted.statusCode).toBe(200);
    expect(submitted.json()).toMatchObject({
      submission: {
        taskId,
        status: "confirmed",
        flowerValueSnapshot: 2,
      },
      state: {
        redFlowers: {
          balance: {
            available: fixtureHistory.availableFlowers + 2,
            cumulative: fixtureHistory.cumulativeFlowers + 2,
          },
          ledger: expect.arrayContaining([
            expect.objectContaining({
              type: "task_confirmed",
              deltaAvailable: 2,
              deltaCumulative: 2,
              flowerKind: expect.stringMatching(/^(coral|sunny|berry|sky)$/),
            }),
          ]),
        },
      },
    });

    const submissionId = submitted.json().submission.id as string;

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
    expect(savedSubmission.completionKey).toMatch(new RegExp(`^repeating:${taskId}:`));
    expect(savedBalance.available).toBe(fixtureHistory.availableFlowers + 2);
    expect(savedBalance.cumulative).toBe(fixtureHistory.cumulativeFlowers + 2);
    expect(savedLedger).toHaveLength(fixtureHistory.ledgerEntries + 1);
    expect(savedLedger.find((entry) => entry.sourceId === submissionId)).toMatchObject({
      type: "task_confirmed",
      deltaAvailable: 2,
      deltaCumulative: 2,
      flowerKind: expect.stringMatching(/^(coral|sunny|berry|sky)$/),
      sourceId: submissionId,
    });

    await app.close();
  });

  it("keeps habit tasks available across days but rejects duplicate same-day completion", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/__test/reset",
    });
    const taskId = await createManagedTask(app, {
      title: "今天整理水杯",
      flowerValue: 2,
      kind: "repeating",
    });

    const first = await app.inject({
      method: "POST",
      url: "/api/child/task-submissions",
      headers: familyHeaders,
      payload: {
        taskId,
      },
    });
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/child/task-submissions",
      headers: familyHeaders,
      payload: {
        taskId,
      },
    });

    expect(first.statusCode).toBe(200);
    expect(duplicate.statusCode).toBe(400);
    expect(duplicate.json()).toEqual({
      error: {
        code: "TASK_ALREADY_CONFIRMED",
        message: "Task has already been completed for this day.",
      },
    });

    await expect(
      getPrisma().task.findUniqueOrThrow({
        where: { id: taskId },
      }),
    ).resolves.toMatchObject({
      kind: "repeating",
      status: "active",
    });
    await expect(getPrisma().taskSubmission.count()).resolves.toBe(
      fixtureHistory.taskSubmissions + 1,
    );
    await expect(getPrisma().redFlowerLedgerEntry.count()).resolves.toBe(
      fixtureHistory.ledgerEntries + 1,
    );

    await app.close();
  });

  it("archives a one-time goal task after completion and persists it", async () => {
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
        taskId: "test-task-tie-shoes",
      },
    });

    expect(submitted.statusCode).toBe(200);
    expect(submitted.json()).toMatchObject({
      submission: {
        taskId: "test-task-tie-shoes",
        status: "confirmed",
        flowerValueSnapshot: 5,
      },
      state: {
        taskBook: {
          tasks: expect.arrayContaining([
            expect.objectContaining({
              id: "test-task-tie-shoes",
              kind: "one_time",
              status: "archived",
            }),
          ]),
        },
      },
    });

    await expect(
      getPrisma().task.findUniqueOrThrow({
        where: { id: "test-task-tie-shoes" },
      }),
    ).resolves.toMatchObject({
      kind: "one_time",
      status: "archived",
    });
    await expect(
      getPrisma().taskSubmission.findFirstOrThrow({
        where: { taskId: "test-task-tie-shoes" },
      }),
    ).resolves.toMatchObject({
      status: "confirmed",
      flowerValueSnapshot: 5,
    });

    await app.close();
  });

  it("keeps completed one-time fixture goals archived after app restart", async () => {
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
        taskId: "test-task-tie-shoes",
      },
    });

    expect(submitted.statusCode).toBe(200);
    await app.close();

    const restarted = buildApp({ prisma: getPrisma() });
    await restarted.ready();

    const state = await restarted.inject({
      method: "GET",
      url: "/api/state",
      headers: familyHeaders,
    });

    expect(state.statusCode).toBe(200);
    expect(state.json()).toMatchObject({
      taskBook: {
        tasks: expect.arrayContaining([
          expect.objectContaining({
            id: "test-task-tie-shoes",
            kind: "one_time",
            status: "archived",
          }),
        ]),
      },
    });
    await expect(
      getPrisma().task.findUniqueOrThrow({
        where: { id: "test-task-tie-shoes" },
      }),
    ).resolves.toMatchObject({
      status: "archived",
    });

    await restarted.close();
  });

  it("confirms existing parent-review task submissions and persists flowers", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/__test/reset",
    });
    const taskId = await createManagedTask(app, {
      title: "等待家长确认的习惯",
      flowerValue: 2,
      kind: "repeating",
    });

    await getPrisma().taskSubmission.create({
      data: {
        id: "pending-parent-confirmation",
        taskId,
        titleSnapshot: "等待家长确认的习惯",
        flowerValueSnapshot: 2,
        status: "pending",
        submittedAt: new Date("2026-05-11T01:00:00.000Z"),
      },
    });

    const confirmed = await app.inject({
      method: "POST",
      url: "/api/parent/task-confirmations",
      headers: parentHeaders,
      payload: {
        submissionIds: ["pending-parent-confirmation"],
      },
    });

    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({
      redFlowers: {
        balance: {
          available: fixtureHistory.availableFlowers + 2,
          cumulative: fixtureHistory.cumulativeFlowers + 2,
        },
      },
    });
    await expect(
      getPrisma().taskSubmission.findUniqueOrThrow({
        where: { id: "pending-parent-confirmation" },
      }),
    ).resolves.toMatchObject({
      status: "confirmed",
      completionKey: expect.stringMatching(new RegExp(`^repeating:${taskId}:`)),
    });
    await expect(
      getPrisma().redFlowerLedgerEntry.findFirstOrThrow({
        where: { sourceId: "pending-parent-confirmation" },
      }),
    ).resolves.toMatchObject({
      deltaAvailable: 2,
      deltaCumulative: 2,
    });

    await app.close();
  });

  it("rejects duplicate pending parent confirmations for the same local day", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/__test/reset",
    });
    const taskId = await createManagedTask(app, {
      title: "重复待确认习惯",
      flowerValue: 2,
      kind: "repeating",
    });

    await getPrisma().taskSubmission.createMany({
      data: [
        {
          id: "pending-parent-confirmation-1",
          taskId,
          titleSnapshot: "重复待确认习惯",
          flowerValueSnapshot: 2,
          status: "pending",
          submittedAt: new Date("2026-05-11T01:00:00.000Z"),
        },
        {
          id: "pending-parent-confirmation-2",
          taskId,
          titleSnapshot: "重复待确认习惯",
          flowerValueSnapshot: 2,
          status: "pending",
          submittedAt: new Date("2026-05-11T02:00:00.000Z"),
        },
      ],
    });

    const first = await app.inject({
      method: "POST",
      url: "/api/parent/task-confirmations",
      headers: parentHeaders,
      payload: {
        submissionIds: ["pending-parent-confirmation-1"],
      },
    });
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/parent/task-confirmations",
      headers: parentHeaders,
      payload: {
        submissionIds: ["pending-parent-confirmation-2"],
      },
    });

    expect(first.statusCode).toBe(200);
    expect(duplicate.statusCode).toBe(400);
    expect(duplicate.json()).toEqual({
      error: {
        code: "TASK_ALREADY_CONFIRMED",
        message: "Task has already been completed for this day.",
      },
    });
    await expect(getPrisma().redFlowerLedgerEntry.count()).resolves.toBe(
      fixtureHistory.ledgerEntries + 1,
    );

    await app.close();
  });

  it("approves wish redemption by spending available flowers without creating a memorial decoration", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/__test/reset",
    });
    const wishId = await createManagedWish(app, {
      title: "去儿童乐园",
      flowerCost: 10,
      kind: "one_time",
    });

    const requested = await app.inject({
      method: "POST",
      url: "/api/child/wish-redemptions",
      headers: familyHeaders,
      payload: {
        wishId,
      },
    });

    expect(requested.statusCode).toBe(200);
    expect(requested.json()).toMatchObject({
      redemption: {
        wishId,
        status: "pending",
        flowerCostSnapshot: 10,
      },
      state: {
        redFlowers: {
          balance: {
            available: fixtureHistory.availableFlowers,
            cumulative: fixtureHistory.cumulativeFlowers,
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
            available: fixtureHistory.availableFlowers - 10,
            cumulative: fixtureHistory.cumulativeFlowers,
          },
        },
        garden: {
          memorialDecorations: [],
        },
        wishBook: {
          wishes: expect.arrayContaining([
            expect.objectContaining({
              id: wishId,
              kind: "one_time",
              pinned: false,
              status: "archived",
            }),
          ]),
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
    expect(savedBalance.available).toBe(fixtureHistory.availableFlowers - 10);
    expect(savedBalance.cumulative).toBe(fixtureHistory.cumulativeFlowers);
    expect(savedDecorations).toHaveLength(0);
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

  it("redeems a wish in one child API action without creating a memorial decoration", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/__test/reset",
    });
    const wishId = await createManagedWish(app, {
      title: "买一个风筝",
      flowerCost: 10,
      kind: "one_time",
    });

    const redeemed = await app.inject({
      method: "POST",
      url: "/api/child/wish-redemptions/redeem",
      headers: familyHeaders,
      payload: {
        wishId,
      },
    });

    expect(redeemed.statusCode).toBe(200);
    expect(redeemed.json()).toMatchObject({
      redemption: {
        wishId,
        status: "approved",
        flowerCostSnapshot: 10,
      },
      state: {
        redFlowers: {
          balance: {
            available: fixtureHistory.availableFlowers - 10,
            cumulative: fixtureHistory.cumulativeFlowers,
          },
        },
        garden: {
          memorialDecorations: [],
        },
      },
    });
    expect(
      redeemed
        .json()
        .state.redFlowers.ledger.filter(
          (entry: { type: string; deltaCumulative: number }) =>
            entry.type === "task_confirmed" && entry.deltaCumulative > 0,
        )
        .reduce(
          (sum: number, entry: { deltaCumulative: number }) => sum + entry.deltaCumulative,
          0,
        ),
    ).toBe(fixtureHistory.cumulativeFlowers);

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
      getPrisma().wish.findUniqueOrThrow({
        where: { id: wishId },
      }),
    ).resolves.toMatchObject({
      kind: "one_time",
      pinned: false,
      status: "archived",
    });
    await expect(
      getPrisma().memorialDecoration.count({
        where: { wishRedemptionId: redemptionId },
      }),
    ).resolves.toBe(0);

    await app.close();
  });

  it("keeps a repeating wish active and redeemable after multiple child redemptions", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/__test/reset",
    });
    const wishId = await createManagedWish(app, {
      title: "周末吃一次酸奶",
      flowerCost: 4,
      kind: "repeating",
    });

    const first = await app.inject({
      method: "POST",
      url: "/api/child/wish-redemptions/redeem",
      headers: familyHeaders,
      payload: {
        wishId,
      },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/child/wish-redemptions/redeem",
      headers: familyHeaders,
      payload: {
        wishId,
      },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      state: {
        redFlowers: {
          balance: {
            available: fixtureHistory.availableFlowers - 8,
            cumulative: fixtureHistory.cumulativeFlowers,
          },
        },
        wishBook: {
          wishes: expect.arrayContaining([
            expect.objectContaining({
              id: wishId,
              kind: "repeating",
              status: "active",
            }),
          ]),
          redemptions: expect.arrayContaining([
            expect.objectContaining({
              wishId,
              status: "approved",
              flowerCostSnapshot: 4,
            }),
          ]),
        },
      },
    });

    await expect(
      getPrisma().wish.findUniqueOrThrow({
        where: { id: wishId },
      }),
    ).resolves.toMatchObject({
      kind: "repeating",
      status: "active",
    });
    await expect(
      getPrisma().wishRedemption.count({
        where: {
          wishId,
          status: "approved",
        },
      }),
    ).resolves.toBe(2);
    await expect(
      getPrisma().redFlowerBalance.findUniqueOrThrow({
        where: { id: "default-red-flower-balance" },
      }),
    ).resolves.toMatchObject({
      available: fixtureHistory.availableFlowers - 8,
      cumulative: fixtureHistory.cumulativeFlowers,
    });

    await app.close();
  });

  it("rejects duplicate one-time wish redemption requests without charging twice", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/__test/reset",
    });
    const wishId = await createManagedWish(app, {
      title: "一次性小火车",
      flowerCost: 10,
      kind: "one_time",
    });

    const first = await app.inject({
      method: "POST",
      url: "/api/child/wish-redemptions",
      headers: familyHeaders,
      payload: {
        wishId,
      },
    });
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/child/wish-redemptions",
      headers: familyHeaders,
      payload: {
        wishId,
      },
    });

    expect(first.statusCode).toBe(200);
    expect(duplicate.statusCode).toBe(400);
    expect(duplicate.json()).toEqual({
      error: {
        code: "WISH_ALREADY_REDEEMED",
        message: "One-time wish has already been redeemed.",
      },
    });
    await expect(
      getPrisma().wishRedemption.count({
        where: { wishId },
      }),
    ).resolves.toBe(1);

    await app.close();
  });

  it("keeps redeemed one-time fixture wishes archived after app restart", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/__test/reset",
    });
    await app.close();

    const restarted = buildApp({ prisma: getPrisma() });
    await restarted.ready();

    const state = await restarted.inject({
      method: "GET",
      url: "/api/state",
      headers: familyHeaders,
    });

    expect(state.statusCode).toBe(200);
    expect(state.json()).toMatchObject({
      wishBook: {
        wishes: expect.arrayContaining([
          expect.objectContaining({
            id: "test-wish-carousel",
            kind: "one_time",
            pinned: false,
            status: "archived",
          }),
        ]),
      },
    });
    await expect(
      getPrisma().wish.findUniqueOrThrow({
        where: { id: "test-wish-carousel" },
      }),
    ).resolves.toMatchObject({
      pinned: false,
      status: "archived",
    });

    await restarted.close();
  });

  it("rejects one-step child wish redemption without persisting partial state", async () => {
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    await app.inject({
      method: "POST",
      url: "/__test/reset",
    });
    const wishId = await createManagedWish(app, {
      title: "很贵的乐高",
      flowerCost: 999,
      kind: "one_time",
    });

    const redeemed = await app.inject({
      method: "POST",
      url: "/api/child/wish-redemptions/redeem",
      headers: familyHeaders,
      payload: {
        wishId,
      },
    });

    expect(redeemed.statusCode).toBe(400);
    expect(redeemed.json()).toEqual({
      error: {
        code: "INSUFFICIENT_RED_FLOWERS",
        message: "Available red flowers are not enough for this wish.",
      },
    });

    await expect(getPrisma().wishRedemption.count()).resolves.toBe(fixtureHistory.wishRedemptions);
    await expect(getPrisma().redFlowerLedgerEntry.count()).resolves.toBe(
      fixtureHistory.ledgerEntries,
    );
    await expect(getPrisma().memorialDecoration.count()).resolves.toBe(0);
    await expect(
      getPrisma().redFlowerBalance.findUniqueOrThrow({
        where: { id: "default-red-flower-balance" },
      }),
    ).resolves.toMatchObject({
      available: fixtureHistory.availableFlowers,
      cumulative: fixtureHistory.cumulativeFlowers,
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
    const beforeCounts = {
      taskSubmissions: await getPrisma().taskSubmission.count(),
      wishRedemptions: await getPrisma().wishRedemption.count(),
      ledgerEntries: await getPrisma().redFlowerLedgerEntry.count(),
    };

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

    await expect(getPrisma().taskSubmission.count()).resolves.toBe(beforeCounts.taskSubmissions);
    await expect(getPrisma().wishRedemption.count()).resolves.toBe(beforeCounts.wishRedemptions);
    await expect(getPrisma().redFlowerLedgerEntry.count()).resolves.toBe(
      beforeCounts.ledgerEntries,
    );

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

  it("allows fixture reset in development mode", async () => {
    process.env.NODE_ENV = "development";
    const app = buildApp({ prisma: getPrisma() });
    await app.ready();

    const created = await app.inject({
      method: "POST",
      url: "/api/parent/tasks",
      headers: parentHeaders,
      payload: {
        title: "重置前的临时任务",
        flowerValue: 2,
        kind: "repeating",
      },
    });

    expect(created.statusCode).toBe(200);

    const submitted = await app.inject({
      method: "POST",
      url: "/api/child/task-submissions",
      headers: familyHeaders,
      payload: {
        taskId: created.json().task.id,
      },
    });
    expect(submitted.statusCode).toBe(200);

    const response = await app.inject({
      method: "POST",
      url: "/__test/reset",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      redFlowers: {
        balance: {
          available: fixtureHistory.availableFlowers,
          cumulative: fixtureHistory.cumulativeFlowers,
        },
        ledger: expect.any(Array),
      },
      taskBook: {
        submissions: expect.any(Array),
        tasks: expect.arrayContaining([
          expect.objectContaining({
            id: "test-task-brush-teeth",
            status: "test",
          }),
        ]),
      },
    });
    expect(response.json().redFlowers.ledger).toHaveLength(fixtureHistory.ledgerEntries);
    expect(response.json().taskBook.submissions).toHaveLength(fixtureHistory.taskSubmissions);
    await expect(getPrisma().taskSubmission.count()).resolves.toBe(fixtureHistory.taskSubmissions);
    await expect(getPrisma().redFlowerLedgerEntry.count()).resolves.toBe(
      fixtureHistory.ledgerEntries,
    );

    await app.close();
  });

  it("rejects fixture reset in production mode", async () => {
    process.env.NODE_ENV = "production";
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
