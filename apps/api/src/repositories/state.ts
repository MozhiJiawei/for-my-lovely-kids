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
    status: "test",
    sortOrder: 1,
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
  },
  {
    id: "test-wish-picture-book",
    title: "[测试] 买一本新绘本",
    flowerCost: 6,
    status: "test",
    sortOrder: 2,
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
  },
  {
    id: "test-wish-ice-cream",
    title: "[测试] 吃一个冰淇淋",
    flowerCost: 4,
    status: "test",
    sortOrder: 3,
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
  },
];

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

    await tx.redFlowerBalance.create({
      data: {
        id: balanceId,
        available: 0,
        cumulative: 0,
        updatedAt: fixtureNow,
      },
    });
  });
}

export async function ensureDefaultFixture(db: PrismaClient): Promise<void> {
  const balance = await db.redFlowerBalance.findUnique({
    where: {
      id: balanceId,
    },
  });

  if (!balance) {
    await resetToDefaultFixture(db);
    return;
  }

  await db.$transaction(seedTestFixtures);
}

async function seedTestFixtures(tx: Prisma.TransactionClient): Promise<void> {
  for (const task of testTasks) {
    const existing = await tx.task.findUnique({
      where: { id: task.id },
      select: { status: true, updatedAt: true },
    });
    const keepArchivedGoal = task.kind === "one_time" && existing?.status === "archived";

    if (!existing) {
      await tx.task.create({ data: task });
      continue;
    }

    await tx.task.update({
      where: { id: task.id },
      data: {
        title: task.title,
        flowerValue: task.flowerValue,
        kind: task.kind,
        status: keepArchivedGoal ? "archived" : task.status,
        updatedAt: keepArchivedGoal ? existing.updatedAt : task.updatedAt,
      },
    });
  }

  for (const wish of testWishes) {
    await tx.wish.upsert({
      where: { id: wish.id },
      create: wish,
      update: {
        title: wish.title,
        flowerCost: wish.flowerCost,
        status: wish.status,
        sortOrder: wish.sortOrder,
        updatedAt: wish.updatedAt,
      },
    });
  }
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
        status: wish.status,
        sortOrder: wish.sortOrder,
        createdAt: new Date(wish.createdAt),
        updatedAt: new Date(wish.updatedAt),
      },
      update: {
        title: wish.title,
        flowerCost: wish.flowerCost,
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
