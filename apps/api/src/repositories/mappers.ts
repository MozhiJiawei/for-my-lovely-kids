import type {
  Garden,
  RedFlowerAccount,
  RedFlowerBalance,
  RedFlowerKind,
  RedFlowerLedgerEntry,
  Task,
  TaskBook,
  TaskSubmission,
  Wish,
  WishBook,
  WishRedemption,
} from "@red-flower-garden/domain";
import { getGardenStage } from "@red-flower-garden/domain";
import type {
  MemorialDecoration as PrismaMemorialDecoration,
  RedFlowerBalance as PrismaRedFlowerBalance,
  RedFlowerLedgerEntry as PrismaRedFlowerLedgerEntry,
  Task as PrismaTask,
  TaskSubmission as PrismaTaskSubmission,
  Wish as PrismaWish,
  WishRedemption as PrismaWishRedemption,
} from "@prisma/client";

function mapFlowerKind(value: string | null): RedFlowerKind | null {
  return value === "sunny" || value === "berry" || value === "sky" || value === "coral"
    ? value
    : null;
}

export function mapTask(task: PrismaTask): Task {
  return {
    id: task.id,
    title: task.title,
    flowerValue: task.flowerValue,
    kind: task.kind === "one_time" ? "one_time" : "repeating",
    status: task.status === "archived" ? "archived" : task.status === "test" ? "test" : "active",
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function mapTaskSubmission(submission: PrismaTaskSubmission): TaskSubmission {
  return {
    id: submission.id,
    taskId: submission.taskId,
    titleSnapshot: submission.titleSnapshot,
    flowerValueSnapshot: submission.flowerValueSnapshot,
    status: submission.status === "confirmed" ? "confirmed" : "pending",
    submittedAt: submission.submittedAt.toISOString(),
    confirmedAt: submission.confirmedAt?.toISOString() ?? null,
  };
}

export function mapTaskBook(input: {
  tasks: PrismaTask[];
  submissions: PrismaTaskSubmission[];
}): TaskBook {
  return {
    tasks: input.tasks.map(mapTask),
    submissions: input.submissions.map(mapTaskSubmission),
  };
}

export function mapWish(wish: PrismaWish): Wish {
  return {
    id: wish.id,
    title: wish.title,
    flowerCost: wish.flowerCost,
    kind: wish.kind === "repeating" ? "repeating" : "one_time",
    pinned: wish.pinned,
    status: wish.status === "archived" ? "archived" : wish.status === "test" ? "test" : "active",
    sortOrder: wish.sortOrder,
    createdAt: wish.createdAt.toISOString(),
    updatedAt: wish.updatedAt.toISOString(),
  };
}

export function mapWishRedemption(redemption: PrismaWishRedemption): WishRedemption {
  return {
    id: redemption.id,
    wishId: redemption.wishId,
    titleSnapshot: redemption.titleSnapshot,
    flowerCostSnapshot: redemption.flowerCostSnapshot,
    status: redemption.status === "approved" ? "approved" : "pending",
    requestedAt: redemption.requestedAt.toISOString(),
    approvedAt: redemption.approvedAt?.toISOString() ?? null,
  };
}

export function mapWishBook(input: {
  wishes: PrismaWish[];
  redemptions: PrismaWishRedemption[];
}): WishBook {
  return {
    wishes: input.wishes.map(mapWish),
    redemptions: input.redemptions.map(mapWishRedemption),
  };
}

export function mapBalance(balance: PrismaRedFlowerBalance): RedFlowerBalance {
  return {
    available: balance.available,
    cumulative: balance.cumulative,
    updatedAt: balance.updatedAt.toISOString(),
  };
}

export function mapLedgerEntry(entry: PrismaRedFlowerLedgerEntry): RedFlowerLedgerEntry {
  return {
    id: entry.id,
    type: entry.type === "wish_approved" ? "wish_approved" : "task_confirmed",
    deltaAvailable: entry.deltaAvailable,
    deltaCumulative: entry.deltaCumulative,
    flowerKind: mapFlowerKind(entry.flowerKind),
    occurredAt: entry.occurredAt.toISOString(),
    sourceId: entry.sourceId,
  };
}

export function mapRedFlowerAccount(input: {
  balance: PrismaRedFlowerBalance;
  ledger: PrismaRedFlowerLedgerEntry[];
}): RedFlowerAccount {
  return {
    balance: mapBalance(input.balance),
    ledger: input.ledger.map(mapLedgerEntry),
  };
}

export function mapGarden(input: {
  balance: PrismaRedFlowerBalance;
  decorations: PrismaMemorialDecoration[];
}): Garden {
  return {
    stage: getGardenStage(input.balance.cumulative),
    memorialDecorations: input.decorations.map((decoration) => ({
      id: decoration.id,
      wishRedemptionId: decoration.wishRedemptionId,
      kind: "wish_memorial",
      createdAt: decoration.createdAt.toISOString(),
    })),
  };
}
