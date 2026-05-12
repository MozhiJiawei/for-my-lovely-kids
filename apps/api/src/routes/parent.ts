import { randomUUID } from "node:crypto";

import {
  archiveTask,
  approveWishRedemption,
  confirmTaskSubmission,
  createTask,
  createWish,
  getBusinessDayKey,
  updateTask,
  updateWish,
  type RedFlowerKind,
  type WishKind,
} from "@red-flower-garden/domain";
import type { FastifyInstance } from "fastify";

import { assertPrototypeAuth } from "../auth/prototype-auth";
import { balanceId } from "../repositories/database";
import {
  isDuplicateTaskCompletionPersistenceError,
  loadDomainState,
  saveTaskBook,
  saveTaskBookAndRedFlowers,
  saveWishBook,
  saveWishBookRedFlowersAndGarden,
} from "../repositories/state";

type CreateTaskBody = {
  title?: string;
  flowerValue?: number;
  kind?: "repeating" | "one_time";
};

type CreateWishBody = {
  title?: string;
  flowerCost?: number;
  kind?: WishKind;
  pinned?: boolean;
};

type ConfirmTasksBody = {
  submissionIds?: string[];
};

type UpdateHistoryTaskSubmissionBody = {
  flowerValue?: number;
};

type UpdateHistoryWishRedemptionBody = {
  flowerCost?: number;
};

const flowerKinds: RedFlowerKind[] = ["coral", "sunny", "berry", "sky"];

function chooseFlowerKind(seed: string): RedFlowerKind {
  let hash = 0;

  for (const char of seed) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x45d9f3b);
  }

  return flowerKinds[Math.abs(hash) % flowerKinds.length]!;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isCurrentBusinessDay(value: Date | string | null): boolean {
  if (!value) {
    return false;
  }

  return getBusinessDayKey(toIsoString(value)) === getBusinessDayKey(new Date().toISOString());
}

function positiveInteger(value: unknown): number | null {
  const amount = Number(value);

  return Number.isInteger(amount) && amount > 0 ? amount : null;
}

function sameInstant(left: Date | string | null, right: Date | string | null): boolean {
  if (!left || !right) {
    return false;
  }

  return new Date(left).getTime() === new Date(right).getTime();
}

export async function registerParentRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateTaskBody }>("/api/parent/tasks", async (request, reply) => {
    if (!assertPrototypeAuth(request, reply, "parent")) {
      return;
    }

    const body = request.body ?? {};
    const now = new Date().toISOString();

    const result = await app.prisma.$transaction(async (tx) => {
      const state = await loadDomainState(tx);
      const next = createTask(state.taskBook, {
        taskId: randomUUID(),
        title: body.title ?? "",
        flowerValue: Number(body.flowerValue),
        kind: body.kind ?? "repeating",
        createdAt: now,
      });

      if (!next.ok) {
        return next;
      }

      await saveTaskBook(tx, next.value.taskBook);

      return next;
    });

    if (!result.ok) {
      return reply.code(400).send({ error: result.error });
    }

    return {
      task: result.value.task,
      state: await loadDomainState(app.prisma),
    };
  });

  app.post<{ Params: { id: string }; Body: CreateTaskBody }>(
    "/api/parent/tasks/:id",
    async (request, reply) => {
      if (!assertPrototypeAuth(request, reply, "parent")) {
        return;
      }

      const body = request.body ?? {};
      const now = new Date().toISOString();

      const result = await app.prisma.$transaction(async (tx) => {
        const state = await loadDomainState(tx);
        const next = updateTask(state.taskBook, {
          taskId: request.params.id,
          title: body.title ?? "",
          flowerValue: Number(body.flowerValue),
          kind: body.kind === "one_time" ? "one_time" : "repeating",
          updatedAt: now,
        });

        if (!next.ok) {
          return next;
        }

        await saveTaskBook(tx, next.value.taskBook);

        return next;
      });

      if (!result.ok) {
        return reply.code(400).send({ error: result.error });
      }

      return {
        task: result.value.task,
        state: await loadDomainState(app.prisma),
      };
    },
  );

  app.post<{ Params: { id: string } }>("/api/parent/tasks/:id/delete", async (request, reply) => {
    if (!assertPrototypeAuth(request, reply, "parent")) {
      return;
    }

    const now = new Date().toISOString();

    const result = await app.prisma.$transaction(async (tx) => {
      const state = await loadDomainState(tx);
      const next = archiveTask(state.taskBook, {
        taskId: request.params.id,
        archivedAt: now,
      });

      if (!next.ok) {
        return next;
      }

      await saveTaskBook(tx, next.value.taskBook);

      return next;
    });

    if (!result.ok) {
      return reply.code(400).send({ error: result.error });
    }

    return {
      task: result.value.task,
      state: await loadDomainState(app.prisma),
    };
  });

  app.post<{ Body: CreateWishBody }>("/api/parent/wishes", async (request, reply) => {
    if (!assertPrototypeAuth(request, reply, "parent")) {
      return;
    }

    const body = request.body ?? {};
    const now = new Date().toISOString();

    const result = await app.prisma.$transaction(async (tx) => {
      const state = await loadDomainState(tx);
      const next = createWish(state.wishBook, {
        wishId: randomUUID(),
        title: body.title ?? "",
        flowerCost: Number(body.flowerCost),
        kind: body.kind === "repeating" ? "repeating" : "one_time",
        pinned: body.pinned === true,
        createdAt: now,
      });

      if (!next.ok) {
        return next;
      }

      await saveWishBook(tx, next.value.wishBook);

      return next;
    });

    if (!result.ok) {
      return reply.code(400).send({ error: result.error });
    }

    return {
      wish: result.value.wish,
      state: await loadDomainState(app.prisma),
    };
  });

  app.post<{ Params: { id: string }; Body: CreateWishBody }>(
    "/api/parent/wishes/:id",
    async (request, reply) => {
      if (!assertPrototypeAuth(request, reply, "parent")) {
        return;
      }

      const body = request.body ?? {};
      const now = new Date().toISOString();

      const result = await app.prisma.$transaction(async (tx) => {
        const state = await loadDomainState(tx);
        const next = updateWish(state.wishBook, {
          wishId: request.params.id,
          title: body.title ?? "",
          flowerCost: Number(body.flowerCost),
          kind: body.kind === "repeating" ? "repeating" : "one_time",
          pinned: body.pinned === true,
          updatedAt: now,
        });

        if (!next.ok) {
          return next;
        }

        await saveWishBook(tx, next.value.wishBook);

        return next;
      });

      if (!result.ok) {
        return reply.code(400).send({ error: result.error });
      }

      return {
        wish: result.value.wish,
        state: await loadDomainState(app.prisma),
      };
    },
  );

  app.post<{ Body: ConfirmTasksBody }>("/api/parent/task-confirmations", async (request, reply) => {
    if (!assertPrototypeAuth(request, reply, "parent")) {
      return;
    }

    const submissionIds = request.body?.submissionIds ?? [];

    if (submissionIds.length === 0) {
      return reply.code(400).send({
        error: {
          code: "INVALID_REQUEST",
          message: "submissionIds is required.",
        },
      });
    }

    let result;

    try {
      result = await app.prisma.$transaction(async (tx) => {
        let state = await loadDomainState(tx);

        for (const submissionId of submissionIds) {
          const next = confirmTaskSubmission(state.taskBook, state.redFlowers, {
            submissionId,
            confirmedAt: new Date().toISOString(),
            ledgerEntryId: randomUUID(),
            flowerKind: chooseFlowerKind(submissionId),
          });

          if (!next.ok) {
            return next;
          }

          state = {
            ...state,
            taskBook: next.value.taskBook,
            redFlowers: next.value.redFlowers,
          };
        }

        await saveTaskBookAndRedFlowers(tx, state);

        return {
          ok: true as const,
          value: state,
        };
      });
    } catch (error) {
      if (isDuplicateTaskCompletionPersistenceError(error)) {
        return reply.code(400).send({
          error: {
            code: "TASK_ALREADY_CONFIRMED",
            message: "Task has already been completed for this day.",
          },
        });
      }

      throw error;
    }

    if (!result.ok) {
      return reply.code(400).send({ error: result.error });
    }

    return loadDomainState(app.prisma);
  });

  app.post<{ Params: { id: string }; Body: UpdateHistoryTaskSubmissionBody }>(
    "/api/parent/history/task-submissions/:id",
    async (request, reply) => {
      if (!assertPrototypeAuth(request, reply, "parent")) {
        return;
      }

      const flowerValue = positiveInteger(request.body?.flowerValue);

      if (flowerValue === null) {
        return reply.code(400).send({
          error: {
            code: "INVALID_HISTORY_RECORD",
            message: "flowerValue must be a positive integer.",
          },
        });
      }

      const result = await app.prisma.$transaction(async (tx) => {
        const submission = await tx.taskSubmission.findUnique({
          where: { id: request.params.id },
        });

        if (
          !submission ||
          submission.status !== "confirmed" ||
          !isCurrentBusinessDay(submission.confirmedAt)
        ) {
          return {
            ok: false as const,
            code: "HISTORY_RECORD_NOT_EDITABLE",
            message: "Only today's confirmed task records can be edited.",
          };
        }

        const ledger = await tx.redFlowerLedgerEntry.findFirst({
          where: { sourceId: submission.id, type: "task_confirmed" },
        });

        if (!ledger) {
          return {
            ok: false as const,
            code: "HISTORY_LEDGER_NOT_FOUND",
            message: "Matching task ledger entry does not exist.",
          };
        }

        const delta = flowerValue - submission.flowerValueSnapshot;
        const now = new Date();

        await tx.taskSubmission.update({
          where: { id: submission.id },
          data: { flowerValueSnapshot: flowerValue },
        });
        await tx.redFlowerLedgerEntry.update({
          where: { id: ledger.id },
          data: {
            deltaAvailable: flowerValue,
            deltaCumulative: flowerValue,
          },
        });
        await tx.redFlowerBalance.update({
          where: { id: balanceId },
          data: {
            available: { increment: delta },
            cumulative: { increment: delta },
            updatedAt: now,
          },
        });

        return { ok: true as const };
      });

      if (!result.ok) {
        return reply.code(400).send({
          error: {
            code: result.code,
            message: result.message,
          },
        });
      }

      return { state: await loadDomainState(app.prisma) };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/parent/history/task-submissions/:id/delete",
    async (request, reply) => {
      if (!assertPrototypeAuth(request, reply, "parent")) {
        return;
      }

      const result = await app.prisma.$transaction(async (tx) => {
        const submission = await tx.taskSubmission.findUnique({
          where: { id: request.params.id },
          include: { task: true },
        });

        if (
          !submission ||
          submission.status !== "confirmed" ||
          !isCurrentBusinessDay(submission.confirmedAt)
        ) {
          return {
            ok: false as const,
            code: "HISTORY_RECORD_NOT_EDITABLE",
            message: "Only today's confirmed task records can be deleted.",
          };
        }

        const ledger = await tx.redFlowerLedgerEntry.findFirst({
          where: { sourceId: submission.id, type: "task_confirmed" },
        });

        if (!ledger) {
          return {
            ok: false as const,
            code: "HISTORY_LEDGER_NOT_FOUND",
            message: "Matching task ledger entry does not exist.",
          };
        }

        const now = new Date();

        await tx.redFlowerBalance.update({
          where: { id: balanceId },
          data: {
            available: { decrement: ledger.deltaAvailable },
            cumulative: { decrement: ledger.deltaCumulative },
            updatedAt: now,
          },
        });
        await tx.redFlowerLedgerEntry.delete({ where: { id: ledger.id } });
        await tx.taskSubmission.delete({ where: { id: submission.id } });

        if (
          submission.task.kind === "one_time" &&
          submission.task.status === "archived" &&
          sameInstant(submission.task.updatedAt, submission.confirmedAt)
        ) {
          const remainingConfirmed = await tx.taskSubmission.count({
            where: {
              taskId: submission.taskId,
              status: "confirmed",
            },
          });

          if (remainingConfirmed === 0) {
            await tx.task.update({
              where: { id: submission.taskId },
              data: { status: "active", updatedAt: now },
            });
          }
        }

        return { ok: true as const };
      });

      if (!result.ok) {
        return reply.code(400).send({
          error: {
            code: result.code,
            message: result.message,
          },
        });
      }

      return { state: await loadDomainState(app.prisma) };
    },
  );

  app.post<{ Params: { id: string }; Body: UpdateHistoryWishRedemptionBody }>(
    "/api/parent/history/wish-redemptions/:id",
    async (request, reply) => {
      if (!assertPrototypeAuth(request, reply, "parent")) {
        return;
      }

      const flowerCost = positiveInteger(request.body?.flowerCost);

      if (flowerCost === null) {
        return reply.code(400).send({
          error: {
            code: "INVALID_HISTORY_RECORD",
            message: "flowerCost must be a positive integer.",
          },
        });
      }

      const result = await app.prisma.$transaction(async (tx) => {
        const redemption = await tx.wishRedemption.findUnique({
          where: { id: request.params.id },
        });

        if (
          !redemption ||
          redemption.status !== "approved" ||
          !isCurrentBusinessDay(redemption.approvedAt)
        ) {
          return {
            ok: false as const,
            code: "HISTORY_RECORD_NOT_EDITABLE",
            message: "Only today's approved wish records can be edited.",
          };
        }

        const ledger = await tx.redFlowerLedgerEntry.findFirst({
          where: { sourceId: redemption.id, type: "wish_approved" },
        });

        if (!ledger) {
          return {
            ok: false as const,
            code: "HISTORY_LEDGER_NOT_FOUND",
            message: "Matching wish ledger entry does not exist.",
          };
        }

        const delta = flowerCost - redemption.flowerCostSnapshot;
        const now = new Date();

        await tx.wishRedemption.update({
          where: { id: redemption.id },
          data: { flowerCostSnapshot: flowerCost },
        });
        await tx.redFlowerLedgerEntry.update({
          where: { id: ledger.id },
          data: {
            deltaAvailable: -flowerCost,
            deltaCumulative: 0,
          },
        });
        await tx.redFlowerBalance.update({
          where: { id: balanceId },
          data: {
            available: { decrement: delta },
            updatedAt: now,
          },
        });

        return { ok: true as const };
      });

      if (!result.ok) {
        return reply.code(400).send({
          error: {
            code: result.code,
            message: result.message,
          },
        });
      }

      return { state: await loadDomainState(app.prisma) };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/parent/history/wish-redemptions/:id/delete",
    async (request, reply) => {
      if (!assertPrototypeAuth(request, reply, "parent")) {
        return;
      }

      const result = await app.prisma.$transaction(async (tx) => {
        const redemption = await tx.wishRedemption.findUnique({
          where: { id: request.params.id },
          include: { wish: true },
        });

        if (
          !redemption ||
          redemption.status !== "approved" ||
          !isCurrentBusinessDay(redemption.approvedAt)
        ) {
          return {
            ok: false as const,
            code: "HISTORY_RECORD_NOT_EDITABLE",
            message: "Only today's approved wish records can be deleted.",
          };
        }

        const ledger = await tx.redFlowerLedgerEntry.findFirst({
          where: { sourceId: redemption.id, type: "wish_approved" },
        });

        if (!ledger) {
          return {
            ok: false as const,
            code: "HISTORY_LEDGER_NOT_FOUND",
            message: "Matching wish ledger entry does not exist.",
          };
        }

        const now = new Date();

        await tx.redFlowerBalance.update({
          where: { id: balanceId },
          data: {
            available: { decrement: ledger.deltaAvailable },
            updatedAt: now,
          },
        });
        await tx.memorialDecoration.deleteMany({
          where: { wishRedemptionId: redemption.id },
        });
        await tx.redFlowerLedgerEntry.delete({ where: { id: ledger.id } });
        await tx.wishRedemption.delete({ where: { id: redemption.id } });

        if (
          redemption.wish.kind === "one_time" &&
          redemption.wish.status === "archived" &&
          sameInstant(redemption.wish.updatedAt, redemption.approvedAt)
        ) {
          const remainingApproved = await tx.wishRedemption.count({
            where: {
              wishId: redemption.wishId,
              status: "approved",
            },
          });

          if (remainingApproved === 0) {
            await tx.wish.update({
              where: { id: redemption.wishId },
              data: { status: "active", updatedAt: now },
            });
          }
        }

        return { ok: true as const };
      });

      if (!result.ok) {
        return reply.code(400).send({
          error: {
            code: result.code,
            message: result.message,
          },
        });
      }

      return { state: await loadDomainState(app.prisma) };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/parent/wish-redemptions/:id/approve",
    async (request, reply) => {
      if (!assertPrototypeAuth(request, reply, "parent")) {
        return;
      }

      const result = await app.prisma.$transaction(async (tx) => {
        const state = await loadDomainState(tx);
        const next = approveWishRedemption(state.wishBook, state.redFlowers, state.garden, {
          redemptionId: request.params.id,
          approvedAt: new Date().toISOString(),
          ledgerEntryId: randomUUID(),
        });

        if (!next.ok) {
          return next;
        }

        await saveWishBookRedFlowersAndGarden(tx, {
          wishBook: next.value.wishBook,
          redFlowers: next.value.redFlowers,
          garden: next.value.garden,
        });

        return next;
      });

      if (!result.ok) {
        return reply.code(400).send({ error: result.error });
      }

      return {
        redemption: result.value.redemption,
        state: await loadDomainState(app.prisma),
      };
    },
  );
}
