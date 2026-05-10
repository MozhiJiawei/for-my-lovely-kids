import { describe, expect, it } from "vitest";

import {
  approveWishRedemption,
  confirmTaskSubmission,
  createEmptyRedFlowerAccount,
  createGarden,
  requestWishRedemption,
  submitTask,
  type Garden,
  type RedFlowerAccount,
  type TaskBook,
  type WishBook,
} from "./index";

const now = "2026-04-25T08:00:00.000Z";

function createTaskBook(): TaskBook {
  return {
    tasks: [
      {
        id: "task-brush-teeth",
        title: "认真刷牙",
        flowerValue: 2,
        kind: "repeating",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "task-tie-shoes",
        title: "学会系鞋带",
        flowerValue: 5,
        kind: "one_time",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ],
    submissions: [],
  };
}

function createWishBook(): WishBook {
  return {
    wishes: [
      {
        id: "wish-carousel",
        title: "周末坐旋转木马",
        flowerCost: 10,
        status: "active",
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
    ],
    redemptions: [],
  };
}

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("Expected domain result to be ok.");
  }

  return result.value;
}

function earnTwelveFlowers(
  taskBook: TaskBook,
  redFlowers: RedFlowerAccount,
): {
  taskBook: TaskBook;
  redFlowers: RedFlowerAccount;
} {
  const submitted = expectOk(
    submitTask(taskBook, {
      taskId: "task-brush-teeth",
      submissionId: "submission-1",
      submittedAt: now,
    }),
  );

  const confirmed = expectOk(
    confirmTaskSubmission(submitted.taskBook, redFlowers, {
      submissionId: "submission-1",
      confirmedAt: "2026-04-25T09:00:00.000Z",
      ledgerEntryId: "ledger-1",
    }),
  );

  return {
    taskBook: confirmed.taskBook,
    redFlowers: {
      ...confirmed.redFlowers,
      balance: {
        ...confirmed.redFlowers.balance,
        available: 12,
        cumulative: 12,
      },
    },
  };
}

describe("red flower domain rules", () => {
  it("submits a task as pending without changing red flower balances", () => {
    const redFlowers = createEmptyRedFlowerAccount(now);

    const result = expectOk(
      submitTask(createTaskBook(), {
        taskId: "task-brush-teeth",
        submissionId: "submission-1",
        submittedAt: now,
      }),
    );

    expect(result.submission).toMatchObject({
      taskId: "task-brush-teeth",
      titleSnapshot: "认真刷牙",
      flowerValueSnapshot: 2,
      status: "pending",
      confirmedAt: null,
    });
    expect(redFlowers.balance).toMatchObject({
      available: 0,
      cumulative: 0,
    });
  });

  it("confirms a pending task and increases available and cumulative flowers", () => {
    const redFlowers = createEmptyRedFlowerAccount(now);
    const submitted = expectOk(
      submitTask(createTaskBook(), {
        taskId: "task-brush-teeth",
        submissionId: "submission-1",
        submittedAt: now,
      }),
    );

    const confirmed = expectOk(
      confirmTaskSubmission(submitted.taskBook, redFlowers, {
        submissionId: "submission-1",
        confirmedAt: "2026-04-25T09:00:00.000Z",
        ledgerEntryId: "ledger-1",
      }),
    );

    expect(confirmed.submission.status).toBe("confirmed");
    expect(confirmed.redFlowers.balance).toMatchObject({
      available: 2,
      cumulative: 2,
    });
    expect(confirmed.redFlowers.ledger).toEqual([
      expect.objectContaining({
        id: "ledger-1",
        type: "task_confirmed",
        deltaAvailable: 2,
        deltaCumulative: 2,
        flowerKind: "coral",
        sourceId: "submission-1",
      }),
    ]);
  });

  it("rejects duplicate task confirmation without adding flowers twice", () => {
    const redFlowers = createEmptyRedFlowerAccount(now);
    const submitted = expectOk(
      submitTask(createTaskBook(), {
        taskId: "task-brush-teeth",
        submissionId: "submission-1",
        submittedAt: now,
      }),
    );
    const confirmed = expectOk(
      confirmTaskSubmission(submitted.taskBook, redFlowers, {
        submissionId: "submission-1",
        confirmedAt: "2026-04-25T09:00:00.000Z",
        ledgerEntryId: "ledger-1",
      }),
    );

    const duplicate = confirmTaskSubmission(confirmed.taskBook, confirmed.redFlowers, {
      submissionId: "submission-1",
      confirmedAt: "2026-04-25T09:10:00.000Z",
      ledgerEntryId: "ledger-duplicate",
    });

    expect(duplicate).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "TASK_ALREADY_CONFIRMED",
      }),
    });
    expect(confirmed.redFlowers.balance).toMatchObject({
      available: 2,
      cumulative: 2,
    });
    expect(confirmed.redFlowers.ledger).toHaveLength(1);
  });

  it("keeps a repeating habit active after today's check-in and rejects a second same-day check-in", () => {
    const first = expectOk(
      submitTask(createTaskBook(), {
        taskId: "task-brush-teeth",
        submissionId: "submission-1",
        submittedAt: "2026-05-11T01:00:00.000Z",
      }),
    );
    const confirmed = expectOk(
      confirmTaskSubmission(first.taskBook, createEmptyRedFlowerAccount(now), {
        submissionId: "submission-1",
        confirmedAt: "2026-05-11T01:00:00.000Z",
        ledgerEntryId: "ledger-1",
      }),
    );

    expect(confirmed.taskBook.tasks.find((task) => task.id === "task-brush-teeth")).toMatchObject({
      status: "active",
    });

    expect(
      submitTask(confirmed.taskBook, {
        taskId: "task-brush-teeth",
        submissionId: "submission-duplicate",
        submittedAt: "2026-05-11T10:00:00.000Z",
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "TASK_ALREADY_CONFIRMED",
      }),
    });

    expect(
      submitTask(confirmed.taskBook, {
        taskId: "task-brush-teeth",
        submissionId: "submission-next-day",
        submittedAt: "2026-05-12T01:00:00.000Z",
      }),
    ).toMatchObject({
      ok: true,
      value: {
        submission: {
          id: "submission-next-day",
          taskId: "task-brush-teeth",
        },
      },
    });
  });

  it("uses the China local day for repeating habit completion windows", () => {
    const first = expectOk(
      submitTask(createTaskBook(), {
        taskId: "task-brush-teeth",
        submissionId: "submission-1",
        submittedAt: "2026-05-10T16:30:00.000Z",
      }),
    );
    const confirmed = expectOk(
      confirmTaskSubmission(first.taskBook, createEmptyRedFlowerAccount(now), {
        submissionId: "submission-1",
        confirmedAt: "2026-05-10T16:30:00.000Z",
        ledgerEntryId: "ledger-1",
      }),
    );

    expect(
      submitTask(confirmed.taskBook, {
        taskId: "task-brush-teeth",
        submissionId: "submission-same-china-day",
        submittedAt: "2026-05-11T15:30:00.000Z",
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "TASK_ALREADY_CONFIRMED",
      }),
    });

    expect(
      submitTask(confirmed.taskBook, {
        taskId: "task-brush-teeth",
        submissionId: "submission-next-china-day",
        submittedAt: "2026-05-11T16:30:00.000Z",
      }),
    ).toMatchObject({
      ok: true,
    });
  });

  it("rejects duplicate pending confirmations for the same completion window", () => {
    const taskBook: TaskBook = {
      ...createTaskBook(),
      submissions: [
        {
          id: "submission-1",
          taskId: "task-brush-teeth",
          titleSnapshot: "认真刷牙",
          flowerValueSnapshot: 2,
          status: "pending",
          submittedAt: "2026-05-11T01:00:00.000Z",
          confirmedAt: null,
        },
        {
          id: "submission-2",
          taskId: "task-brush-teeth",
          titleSnapshot: "认真刷牙",
          flowerValueSnapshot: 2,
          status: "pending",
          submittedAt: "2026-05-11T02:00:00.000Z",
          confirmedAt: null,
        },
      ],
    };
    const first = expectOk(
      confirmTaskSubmission(taskBook, createEmptyRedFlowerAccount(now), {
        submissionId: "submission-1",
        confirmedAt: "2026-05-11T03:00:00.000Z",
        ledgerEntryId: "ledger-1",
      }),
    );

    expect(
      confirmTaskSubmission(first.taskBook, first.redFlowers, {
        submissionId: "submission-2",
        confirmedAt: "2026-05-11T04:00:00.000Z",
        ledgerEntryId: "ledger-2",
      }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "TASK_ALREADY_CONFIRMED",
      }),
    });
    expect(first.redFlowers.ledger).toHaveLength(1);
  });

  it("archives a one-time goal after confirmation", () => {
    const submitted = expectOk(
      submitTask(createTaskBook(), {
        taskId: "task-tie-shoes",
        submissionId: "submission-goal",
        submittedAt: now,
      }),
    );

    const confirmed = expectOk(
      confirmTaskSubmission(submitted.taskBook, createEmptyRedFlowerAccount(now), {
        submissionId: "submission-goal",
        confirmedAt: "2026-04-25T09:00:00.000Z",
        ledgerEntryId: "ledger-goal",
      }),
    );

    expect(confirmed.taskBook.tasks.find((task) => task.id === "task-tie-shoes")).toMatchObject({
      status: "archived",
    });
  });

  it("approves a wish redemption, spends available flowers, and keeps cumulative flowers", () => {
    const redFlowers = createEmptyRedFlowerAccount(now);
    const earned = earnTwelveFlowers(createTaskBook(), redFlowers);
    const requested = expectOk(
      requestWishRedemption(createWishBook(), {
        wishId: "wish-carousel",
        redemptionId: "redemption-1",
        requestedAt: "2026-04-25T10:00:00.000Z",
      }),
    );

    const approved = expectOk(
      approveWishRedemption(
        requested.wishBook,
        earned.redFlowers,
        createGarden(earned.redFlowers.balance.cumulative),
        {
          redemptionId: "redemption-1",
          approvedAt: "2026-04-25T11:00:00.000Z",
          ledgerEntryId: "ledger-2",
        },
      ),
    );

    expect(approved.redemption.status).toBe("approved");
    expect(approved.redFlowers.balance).toMatchObject({
      available: 2,
      cumulative: 12,
    });
    expect(approved.redFlowers.ledger.at(-1)).toMatchObject({
      type: "wish_approved",
      deltaAvailable: -10,
      deltaCumulative: 0,
      sourceId: "redemption-1",
    });
  });

  it("fails wish approval with insufficient available flowers without changing balance or garden", () => {
    const redFlowers = createEmptyRedFlowerAccount(now);
    const garden: Garden = createGarden(redFlowers.balance.cumulative);
    const requested = expectOk(
      requestWishRedemption(createWishBook(), {
        wishId: "wish-carousel",
        redemptionId: "redemption-1",
        requestedAt: "2026-04-25T10:00:00.000Z",
      }),
    );

    const approved = approveWishRedemption(requested.wishBook, redFlowers, garden, {
      redemptionId: "redemption-1",
      approvedAt: "2026-04-25T11:00:00.000Z",
      ledgerEntryId: "ledger-2",
    });

    expect(approved).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "INSUFFICIENT_RED_FLOWERS",
      }),
    });
    expect(redFlowers.balance).toMatchObject({
      available: 0,
      cumulative: 0,
    });
    expect(garden.memorialDecorations).toHaveLength(0);
  });

  it("does not create memorial decorations for an approved wish redemption", () => {
    const redFlowers = createEmptyRedFlowerAccount(now);
    const earned = earnTwelveFlowers(createTaskBook(), redFlowers);
    const requested = expectOk(
      requestWishRedemption(createWishBook(), {
        wishId: "wish-carousel",
        redemptionId: "redemption-1",
        requestedAt: "2026-04-25T10:00:00.000Z",
      }),
    );

    const approved = expectOk(
      approveWishRedemption(
        requested.wishBook,
        earned.redFlowers,
        createGarden(earned.redFlowers.balance.cumulative),
        {
          redemptionId: "redemption-1",
          approvedAt: "2026-04-25T11:00:00.000Z",
          ledgerEntryId: "ledger-2",
        },
      ),
    );

    expect(approved.garden.memorialDecorations).toEqual([]);
  });
});
