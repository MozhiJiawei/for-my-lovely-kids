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
          decorationId: "decoration-1",
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
      decorationId: "decoration-1",
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

  it("creates exactly one memorial decoration for an approved wish redemption", () => {
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
          decorationId: "decoration-1",
        },
      ),
    );

    expect(approved.garden.memorialDecorations).toEqual([
      {
        id: "decoration-1",
        wishRedemptionId: "redemption-1",
        kind: "wish_memorial",
        createdAt: "2026-04-25T11:00:00.000Z",
      },
    ]);
  });
});
