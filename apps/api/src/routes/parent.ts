import { randomUUID } from "node:crypto";

import {
  approveWishRedemption,
  confirmTaskSubmission,
  createTask,
  createWish,
} from "@red-flower-garden/domain";
import type { FastifyInstance } from "fastify";

import { assertPrototypeAuth } from "../auth/prototype-auth";
import {
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
};

type ConfirmTasksBody = {
  submissionIds?: string[];
};

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

    const result = await app.prisma.$transaction(async (tx) => {
      let state = await loadDomainState(tx);

      for (const submissionId of submissionIds) {
        const next = confirmTaskSubmission(state.taskBook, state.redFlowers, {
          submissionId,
          confirmedAt: new Date().toISOString(),
          ledgerEntryId: randomUUID(),
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

    if (!result.ok) {
      return reply.code(400).send({ error: result.error });
    }

    return loadDomainState(app.prisma);
  });

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
          decorationId: randomUUID(),
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
