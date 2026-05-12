import type {
  Garden,
  RedFlowerAccount,
  TaskBook,
  TaskKind,
  WishBook,
} from "@red-flower-garden/domain";
import { getBusinessDayKey } from "@red-flower-garden/domain";
import { Prisma, PrismaClient } from "@prisma/client";

import { balanceId } from "./database";
import { mapGarden, mapRedFlowerAccount, mapTaskBook, mapWishBook } from "./mappers";

export type DomainState = {
  taskBook: TaskBook;
  wishBook: WishBook;
  redFlowers: RedFlowerAccount;
  garden: Garden;
};

type Tx = Prisma.TransactionClient | PrismaClient;

const fixtureNow = new Date("2026-04-25T08:00:00.000Z");

const testTasks = [
  {
    id: "test-task-brush-teeth",
    title: "[测试] 认真刷牙",
    flowerValue: 2,
    kind: "repeating",
    status: "test",
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
  },
  {
    id: "test-task-toys",
    title: "[测试] 帮忙收玩具",
    flowerValue: 3,
    kind: "one_time",
    status: "test",
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
  },
  {
    id: "test-task-reading",
    title: "[测试] 亲子阅读",
    flowerValue: 4,
    kind: "repeating",
    status: "test",
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
  },
  {
    id: "test-task-drink-water",
    title: "[测试] 主动喝水",
    flowerValue: 1,
    kind: "repeating",
    status: "test",
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
  },
  {
    id: "test-task-go-potty",
    title: "[测试] 自己上厕所",
    flowerValue: 2,
    kind: "repeating",
    status: "test",
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
  },
  {
    id: "test-task-say-thanks",
    title: "[测试] 主动说谢谢",
    flowerValue: 1,
    kind: "repeating",
    status: "test",
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
  },
  {
    id: "test-task-tie-shoes",
    title: "[测试] 学会系鞋带",
    flowerValue: 5,
    kind: "one_time",
    status: "test",
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
  },
  {
    id: "test-task-write-name",
    title: "[测试] 会写自己的名字",
    flowerValue: 6,
    kind: "one_time",
    status: "test",
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
  },
  {
    id: "test-task-ride-bike",
    title: "[测试] 学会骑平衡车",
    flowerValue: 8,
    kind: "one_time",
    status: "test",
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
  },
  {
    id: "test-task-count-twenty",
    title: "[测试] 从 1 数到 20",
    flowerValue: 4,
    kind: "one_time",
    status: "test",
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
  },
];

const testWishes = [
  {
    id: "test-wish-carousel",
    title: "[测试] 周末坐旋转木马",
    flowerCost: 10,
    kind: "one_time",
    pinned: true,
    description: "",
    imageUrl: "",
    linkUrl: "",
    status: "test",
    sortOrder: 1,
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
  },
  {
    id: "test-wish-picture-book",
    title: "[测试] 买一本新绘本",
    flowerCost: 6,
    kind: "one_time",
    pinned: false,
    description: "",
    imageUrl: "",
    linkUrl: "",
    status: "test",
    sortOrder: 2,
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
  },
  {
    id: "test-wish-ice-cream",
    title: "[测试] 吃一个冰淇淋",
    flowerCost: 4,
    kind: "repeating",
    pinned: false,
    description: "",
    imageUrl: "",
    linkUrl: "",
    status: "test",
    sortOrder: 3,
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
  },
];

const fixtureTaskSubmissions = [
  taskSubmission(
    "fixture-submission-brush-2026-05-01",
    "test-task-brush-teeth",
    "[测试] 认真刷牙",
    2,
    "2026-05-01T00:30:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-drink-2026-05-01",
    "test-task-drink-water",
    "[测试] 主动喝水",
    1,
    "2026-05-01T02:10:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-brush-2026-05-02",
    "test-task-brush-teeth",
    "[测试] 认真刷牙",
    2,
    "2026-05-02T00:28:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-reading-2026-05-02",
    "test-task-reading",
    "[测试] 亲子阅读",
    4,
    "2026-05-02T12:00:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-brush-2026-05-03",
    "test-task-brush-teeth",
    "[测试] 认真刷牙",
    2,
    "2026-05-03T00:33:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-drink-2026-05-03",
    "test-task-drink-water",
    "[测试] 主动喝水",
    1,
    "2026-05-03T02:06:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-toys-2026-05-03",
    "test-task-toys",
    "[测试] 帮忙收玩具",
    3,
    "2026-05-03T09:40:00.000Z",
    "one_time",
  ),
  taskSubmission(
    "fixture-submission-reading-2026-05-04",
    "test-task-reading",
    "[测试] 亲子阅读",
    4,
    "2026-05-04T12:18:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-drink-2026-05-04",
    "test-task-drink-water",
    "[测试] 主动喝水",
    1,
    "2026-05-04T02:14:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-brush-2026-05-05",
    "test-task-brush-teeth",
    "[测试] 认真刷牙",
    2,
    "2026-05-05T00:31:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-drink-2026-05-05",
    "test-task-drink-water",
    "[测试] 主动喝水",
    1,
    "2026-05-05T02:05:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-potty-2026-05-05",
    "test-task-go-potty",
    "[测试] 自己上厕所",
    2,
    "2026-05-05T03:20:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-reading-2026-05-06",
    "test-task-reading",
    "[测试] 亲子阅读",
    4,
    "2026-05-06T12:11:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-drink-2026-05-06",
    "test-task-drink-water",
    "[测试] 主动喝水",
    1,
    "2026-05-06T02:07:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-potty-2026-05-06",
    "test-task-go-potty",
    "[测试] 自己上厕所",
    2,
    "2026-05-06T03:24:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-brush-2026-05-07",
    "test-task-brush-teeth",
    "[测试] 认真刷牙",
    2,
    "2026-05-07T00:29:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-drink-2026-05-07",
    "test-task-drink-water",
    "[测试] 主动喝水",
    1,
    "2026-05-07T02:16:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-potty-2026-05-07",
    "test-task-go-potty",
    "[测试] 自己上厕所",
    2,
    "2026-05-07T03:28:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-brush-2026-05-08",
    "test-task-brush-teeth",
    "[测试] 认真刷牙",
    2,
    "2026-05-08T00:32:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-reading-2026-05-08",
    "test-task-reading",
    "[测试] 亲子阅读",
    4,
    "2026-05-08T12:06:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-drink-2026-05-08",
    "test-task-drink-water",
    "[测试] 主动喝水",
    1,
    "2026-05-08T02:09:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-write-name-2026-05-08",
    "test-task-write-name",
    "[测试] 会写自己的名字",
    6,
    "2026-05-08T11:30:00.000Z",
    "one_time",
  ),
  taskSubmission(
    "fixture-submission-drink-2026-05-09",
    "test-task-drink-water",
    "[测试] 主动喝水",
    1,
    "2026-05-09T02:04:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-thanks-2026-05-09",
    "test-task-say-thanks",
    "[测试] 主动说谢谢",
    1,
    "2026-05-09T10:12:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-ride-bike-2026-05-09",
    "test-task-ride-bike",
    "[测试] 学会骑平衡车",
    8,
    "2026-05-09T11:45:00.000Z",
    "one_time",
  ),
  taskSubmission(
    "fixture-submission-brush-2026-05-10",
    "test-task-brush-teeth",
    "[测试] 认真刷牙",
    2,
    "2026-05-10T00:35:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-reading-2026-05-10",
    "test-task-reading",
    "[测试] 亲子阅读",
    4,
    "2026-05-10T12:22:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-drink-2026-05-10",
    "test-task-drink-water",
    "[测试] 主动喝水",
    1,
    "2026-05-10T02:03:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-thanks-2026-05-10",
    "test-task-say-thanks",
    "[测试] 主动说谢谢",
    1,
    "2026-05-10T10:18:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-count-twenty-2026-05-10",
    "test-task-count-twenty",
    "[测试] 从 1 数到 20",
    4,
    "2026-05-10T11:05:00.000Z",
    "one_time",
  ),
  taskSubmission(
    "fixture-submission-brush-2026-05-11",
    "test-task-brush-teeth",
    "[测试] 认真刷牙",
    2,
    "2026-05-11T00:34:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-drink-2026-05-11",
    "test-task-drink-water",
    "[测试] 主动喝水",
    1,
    "2026-05-11T02:08:00.000Z",
  ),
  taskSubmission(
    "fixture-submission-thanks-2026-05-11",
    "test-task-say-thanks",
    "[测试] 主动说谢谢",
    1,
    "2026-05-11T10:25:00.000Z",
  ),
];

const fixtureWishRedemptions = [
  wishRedemption(
    "fixture-redemption-carousel",
    "test-wish-carousel",
    "[测试] 周末坐旋转木马",
    10,
    "2026-05-06T06:30:00.000Z",
  ),
  wishRedemption(
    "fixture-redemption-picture-book",
    "test-wish-picture-book",
    "[测试] 买一本新绘本",
    6,
    "2026-05-10T06:50:00.000Z",
  ),
  wishRedemption(
    "fixture-redemption-ice-cream",
    "test-wish-ice-cream",
    "[测试] 吃一个冰淇淋",
    4,
    "2026-05-11T08:00:00.000Z",
  ),
];

const fixtureLedgerEntries = [
  ...fixtureTaskSubmissions.map((submission) => ({
    id: `fixture-ledger-${submission.id.replace("fixture-submission-", "")}`,
    type: "task_confirmed",
    deltaAvailable: submission.flowerValueSnapshot,
    deltaCumulative: submission.flowerValueSnapshot,
    flowerKind: chooseFixtureFlowerKind(submission.id),
    occurredAt: submission.confirmedAt!,
    sourceId: submission.id,
  })),
  ...fixtureWishRedemptions.map((redemption) => ({
    id: `fixture-ledger-${redemption.id.replace("fixture-redemption-", "wish-")}`,
    type: "wish_approved",
    deltaAvailable: -redemption.flowerCostSnapshot,
    deltaCumulative: 0,
    flowerKind: null,
    occurredAt: redemption.approvedAt!,
    sourceId: redemption.id,
  })),
];

const fixtureCumulativeFlowers = fixtureLedgerEntries.reduce(
  (sum, entry) => sum + entry.deltaCumulative,
  0,
);
const fixtureAvailableFlowers = fixtureLedgerEntries.reduce(
  (sum, entry) => sum + entry.deltaAvailable,
  0,
);
const fixtureLastOccurredAt = fixtureLedgerEntries
  .map((entry) => entry.occurredAt)
  .sort()
  .at(-1)!;

export async function resetToDefaultFixture(db: PrismaClient): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.memorialDecoration.deleteMany();
    await tx.redFlowerLedgerEntry.deleteMany();
    await tx.wishRedemption.deleteMany();
    await tx.taskSubmission.deleteMany();
    await tx.wish.deleteMany();
    await tx.task.deleteMany();
    await tx.redFlowerBalance.deleteMany();

    await seedTestFixtures(tx);
    await seedFixtureHistory(tx);

    await tx.redFlowerBalance.create({
      data: {
        id: balanceId,
        available: fixtureAvailableFlowers,
        cumulative: fixtureCumulativeFlowers,
        updatedAt: new Date(fixtureLastOccurredAt),
      },
    });
  });
}

export async function ensureDefaultState(db: PrismaClient): Promise<void> {
  await db.redFlowerBalance.upsert({
    where: {
      id: balanceId,
    },
    create: {
      id: balanceId,
      available: 0,
      cumulative: 0,
      updatedAt: fixtureNow,
    },
    update: {},
  });
}

async function seedFixtureHistory(tx: Prisma.TransactionClient): Promise<void> {
  await tx.taskSubmission.createMany({
    data: fixtureTaskSubmissions.map((submission) => ({
      ...submission,
      submittedAt: new Date(submission.submittedAt),
      confirmedAt: submission.confirmedAt ? new Date(submission.confirmedAt) : null,
    })),
  });

  await tx.wishRedemption.createMany({
    data: fixtureWishRedemptions.map((redemption) => ({
      ...redemption,
      requestedAt: new Date(redemption.requestedAt),
      approvedAt: redemption.approvedAt ? new Date(redemption.approvedAt) : null,
    })),
  });

  await tx.redFlowerLedgerEntry.createMany({
    data: fixtureLedgerEntries.map((entry) => ({
      ...entry,
      occurredAt: new Date(entry.occurredAt),
    })),
  });

  await tx.wish.update({
    where: { id: "test-wish-carousel" },
    data: {
      status: "archived",
      pinned: false,
      updatedAt: new Date("2026-05-06T06:30:00.000Z"),
    },
  });
  await tx.wish.update({
    where: { id: "test-wish-picture-book" },
    data: {
      status: "archived",
      updatedAt: new Date("2026-05-10T06:50:00.000Z"),
    },
  });

  await tx.task.update({
    where: { id: "test-task-toys" },
    data: {
      status: "archived",
      updatedAt: new Date("2026-05-03T09:40:00.000Z"),
    },
  });
  await tx.task.update({
    where: { id: "test-task-write-name" },
    data: {
      status: "archived",
      updatedAt: new Date("2026-05-08T11:30:00.000Z"),
    },
  });
  await tx.task.update({
    where: { id: "test-task-ride-bike" },
    data: {
      status: "archived",
      updatedAt: new Date("2026-05-09T11:45:00.000Z"),
    },
  });
  await tx.task.update({
    where: { id: "test-task-count-twenty" },
    data: {
      status: "archived",
      updatedAt: new Date("2026-05-10T11:05:00.000Z"),
    },
  });
}

async function seedTestFixtures(tx: Prisma.TransactionClient): Promise<void> {
  for (const task of testTasks) {
    const existing = await tx.task.findUnique({
      where: { id: task.id },
      select: { id: true },
    });

    if (!existing) {
      await tx.task.create({ data: task });
    }
  }

  for (const wish of testWishes) {
    const existing = await tx.wish.findUnique({
      where: { id: wish.id },
      select: { status: true, updatedAt: true, pinned: true },
    });
    const keepArchivedWish = wish.kind === "one_time" && existing?.status === "archived";

    if (!existing) {
      await tx.wish.create({ data: wish });
      continue;
    }

    await tx.wish.update({
      where: { id: wish.id },
      data: {
        title: wish.title,
        flowerCost: wish.flowerCost,
        kind: wish.kind,
        pinned: keepArchivedWish ? existing.pinned : wish.pinned,
        status: keepArchivedWish ? "archived" : wish.status,
        sortOrder: wish.sortOrder,
        updatedAt: keepArchivedWish ? existing.updatedAt : wish.updatedAt,
      },
    });
  }
}

function taskSubmission(
  id: string,
  taskId: string,
  titleSnapshot: string,
  flowerValueSnapshot: number,
  confirmedAt: string,
  kind: TaskKind = "repeating",
) {
  return {
    id,
    taskId,
    titleSnapshot,
    flowerValueSnapshot,
    status: "confirmed",
    submittedAt: confirmedAt,
    confirmedAt,
    completionKey:
      kind === "one_time"
        ? `one_time:${taskId}`
        : `repeating:${taskId}:${getBusinessDayKey(confirmedAt)}`,
  };
}

function wishRedemption(
  id: string,
  wishId: string,
  titleSnapshot: string,
  flowerCostSnapshot: number,
  approvedAt: string,
) {
  return {
    id,
    wishId,
    titleSnapshot,
    flowerCostSnapshot,
    status: "approved",
    requestedAt: approvedAt,
    approvedAt,
  };
}

function chooseFixtureFlowerKind(seed: string): "coral" | "sunny" | "berry" | "sky" {
  const flowerKinds = ["coral", "sunny", "berry", "sky"] as const;
  let hash = 0;

  for (const char of seed) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x45d9f3b);
  }

  return flowerKinds[Math.abs(hash) % flowerKinds.length]!;
}

export async function loadDomainState(db: Tx): Promise<DomainState> {
  const [tasks, submissions, wishes, redemptions, balance, ledger, decorations] = await Promise.all(
    [
      db.task.findMany({ orderBy: { createdAt: "asc" } }),
      db.taskSubmission.findMany({ orderBy: { submittedAt: "asc" } }),
      db.wish.findMany({ orderBy: { sortOrder: "asc" } }),
      db.wishRedemption.findMany({ orderBy: { requestedAt: "asc" } }),
      db.redFlowerBalance.findUniqueOrThrow({ where: { id: balanceId } }),
      db.redFlowerLedgerEntry.findMany({ orderBy: { occurredAt: "asc" } }),
      db.memorialDecoration.findMany({ orderBy: { createdAt: "asc" } }),
    ],
  );

  return {
    taskBook: mapTaskBook({ tasks, submissions }),
    wishBook: mapWishBook({ wishes, redemptions }),
    redFlowers: mapRedFlowerAccount({ balance, ledger }),
    garden: mapGarden({ balance, decorations }),
  };
}

export async function saveTaskBookAndRedFlowers(
  tx: Prisma.TransactionClient,
  state: Pick<DomainState, "taskBook" | "redFlowers">,
): Promise<void> {
  await saveTaskBook(tx, state.taskBook);

  for (const latestSubmission of state.taskBook.submissions) {
    await tx.taskSubmission.upsert({
      where: { id: latestSubmission.id },
      create: {
        id: latestSubmission.id,
        taskId: latestSubmission.taskId,
        titleSnapshot: latestSubmission.titleSnapshot,
        flowerValueSnapshot: latestSubmission.flowerValueSnapshot,
        status: latestSubmission.status,
        submittedAt: new Date(latestSubmission.submittedAt),
        confirmedAt: latestSubmission.confirmedAt ? new Date(latestSubmission.confirmedAt) : null,
        completionKey: createSubmissionCompletionKey(
          state.taskBook,
          latestSubmission.taskId,
          latestSubmission.confirmedAt,
        ),
      },
      update: {
        status: latestSubmission.status,
        confirmedAt: latestSubmission.confirmedAt ? new Date(latestSubmission.confirmedAt) : null,
        completionKey: createSubmissionCompletionKey(
          state.taskBook,
          latestSubmission.taskId,
          latestSubmission.confirmedAt,
        ),
      },
    });
  }

  await saveRedFlowerAccount(tx, state.redFlowers);
}

export async function saveTaskBook(
  tx: Prisma.TransactionClient,
  taskBook: TaskBook,
): Promise<void> {
  for (const task of taskBook.tasks) {
    await tx.task.upsert({
      where: { id: task.id },
      create: {
        id: task.id,
        title: task.title,
        flowerValue: task.flowerValue,
        kind: task.kind,
        status: task.status,
        createdAt: new Date(task.createdAt),
        updatedAt: new Date(task.updatedAt),
      },
      update: {
        title: task.title,
        flowerValue: task.flowerValue,
        kind: task.kind,
        status: task.status,
        updatedAt: new Date(task.updatedAt),
      },
    });
  }
}

export async function saveWishBook(
  tx: Prisma.TransactionClient,
  wishBook: WishBook,
): Promise<void> {
  for (const wish of wishBook.wishes) {
    await tx.wish.upsert({
      where: { id: wish.id },
      create: {
        id: wish.id,
        title: wish.title,
        flowerCost: wish.flowerCost,
        kind: wish.kind,
        pinned: wish.pinned,
        description: wish.description,
        imageUrl: wish.imageUrl,
        linkUrl: wish.linkUrl,
        status: wish.status,
        sortOrder: wish.sortOrder,
        createdAt: new Date(wish.createdAt),
        updatedAt: new Date(wish.updatedAt),
      },
      update: {
        title: wish.title,
        flowerCost: wish.flowerCost,
        kind: wish.kind,
        pinned: wish.pinned,
        description: wish.description,
        imageUrl: wish.imageUrl,
        linkUrl: wish.linkUrl,
        status: wish.status,
        sortOrder: wish.sortOrder,
        updatedAt: new Date(wish.updatedAt),
      },
    });
  }
}

export async function saveWishBookRedFlowersAndGarden(
  tx: Prisma.TransactionClient,
  state: Pick<DomainState, "wishBook" | "redFlowers" | "garden">,
): Promise<void> {
  for (const latestRedemption of state.wishBook.redemptions) {
    await tx.wishRedemption.upsert({
      where: { id: latestRedemption.id },
      create: {
        id: latestRedemption.id,
        wishId: latestRedemption.wishId,
        titleSnapshot: latestRedemption.titleSnapshot,
        flowerCostSnapshot: latestRedemption.flowerCostSnapshot,
        status: latestRedemption.status,
        requestedAt: new Date(latestRedemption.requestedAt),
        approvedAt: latestRedemption.approvedAt ? new Date(latestRedemption.approvedAt) : null,
      },
      update: {
        status: latestRedemption.status,
        approvedAt: latestRedemption.approvedAt ? new Date(latestRedemption.approvedAt) : null,
      },
    });
  }

  await saveArchivedWishStates(tx, state.wishBook);
  await saveRedFlowerAccount(tx, state.redFlowers);

  for (const latestDecoration of state.garden.memorialDecorations) {
    await tx.memorialDecoration.upsert({
      where: { id: latestDecoration.id },
      create: {
        id: latestDecoration.id,
        wishRedemptionId: latestDecoration.wishRedemptionId,
        kind: latestDecoration.kind,
        createdAt: new Date(latestDecoration.createdAt),
      },
      update: {},
    });
  }
}

async function saveArchivedWishStates(
  tx: Prisma.TransactionClient,
  wishBook: WishBook,
): Promise<void> {
  for (const wish of wishBook.wishes) {
    if (wish.status !== "archived") {
      continue;
    }

    await tx.wish.update({
      where: { id: wish.id },
      data: {
        status: wish.status,
        pinned: wish.pinned,
        updatedAt: new Date(wish.updatedAt),
      },
    });
  }
}

export function isDuplicateTaskCompletionPersistenceError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    String(error.meta?.target ?? "").includes("completionKey")
  );
}

function createSubmissionCompletionKey(
  taskBook: TaskBook,
  taskId: string,
  confirmedAt: string | null,
): string | null {
  if (!confirmedAt) {
    return null;
  }

  const task = taskBook.tasks.find((candidate) => candidate.id === taskId);

  if (!task) {
    return null;
  }

  return createCompletionKey(taskId, task.kind, confirmedAt);
}

function createCompletionKey(taskId: string, taskKind: TaskKind, confirmedAt: string): string {
  if (taskKind === "one_time") {
    return `one_time:${taskId}`;
  }

  return `repeating:${taskId}:${getBusinessDayKey(confirmedAt)}`;
}

async function saveRedFlowerAccount(
  tx: Prisma.TransactionClient,
  account: RedFlowerAccount,
): Promise<void> {
  await tx.redFlowerBalance.update({
    where: { id: balanceId },
    data: {
      available: account.balance.available,
      cumulative: account.balance.cumulative,
      updatedAt: new Date(account.balance.updatedAt),
    },
  });

  for (const latestLedgerEntry of account.ledger) {
    await tx.redFlowerLedgerEntry.upsert({
      where: { id: latestLedgerEntry.id },
      create: {
        id: latestLedgerEntry.id,
        type: latestLedgerEntry.type,
        deltaAvailable: latestLedgerEntry.deltaAvailable,
        deltaCumulative: latestLedgerEntry.deltaCumulative,
        flowerKind: latestLedgerEntry.flowerKind,
        occurredAt: new Date(latestLedgerEntry.occurredAt),
        sourceId: latestLedgerEntry.sourceId,
      },
      update: {},
    });
  }
}
