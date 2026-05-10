import { randomUUID } from "node:crypto";

import {
  approveWishRedemption,
  confirmTaskSubmission,
  requestWishRedemption,
  submitTask,
  type RedFlowerKind,
} from "@red-flower-garden/domain";
import type { FastifyInstance } from "fastify";

import { assertPrototypeAuth } from "../auth/prototype-auth";
import {
  isDuplicateTaskCompletionPersistenceError,
  loadDomainState,
  saveTaskBookAndRedFlowers,
  saveWishBookRedFlowersAndGarden,
} from "../repositories/state";

type SubmitTaskBody = {
  taskId?: string;
};

type RequestWishBody = {
  wishId?: string;
};

const flowerKinds: RedFlowerKind[] = ["coral", "sunny", "berry", "sky"];

function chooseFlowerKind(seed: string): RedFlowerKind {
  let hash = 0;

  for (const char of seed) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x45d9f3b);
  }

  return flowerKinds[Math.abs(hash) % flowerKinds.length]!;
}

export async function registerChildRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: SubmitTaskBody }>("/api/child/task-submissions", async (request, reply) => {
    if (!assertPrototypeAuth(request, reply, "family")) {
      return;
    }

    const taskId = request.body?.taskId;

    if (!taskId) {
      return reply.code(400).send({
        error: {
          code: "INVALID_REQUEST",
          message: "taskId is required.",
        },
      });
    }

    const now = new Date().toISOString();

    let result;

    try {
      result = await app.prisma.$transaction(async (tx) => {
        const state = await loadDomainState(tx);
        const submitted = submitTask(state.taskBook, {
          taskId,
          submissionId: randomUUID(),
          submittedAt: now,
        });

        if (!submitted.ok) {
          return submitted;
        }

        const confirmed = confirmTaskSubmission(submitted.value.taskBook, state.redFlowers, {
          submissionId: submitted.value.submission.id,
          confirmedAt: now,
          ledgerEntryId: randomUUID(),
          flowerKind: chooseFlowerKind(submitted.value.submission.id),
        });

        if (!confirmed.ok) {
          return confirmed;
        }

        await saveTaskBookAndRedFlowers(tx, {
          taskBook: confirmed.value.taskBook,
          redFlowers: confirmed.value.redFlowers,
        });

        return confirmed;
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

    return {
      submission: result.value.submission,
      state: await loadDomainState(app.prisma),
    };
  });

  app.post<{ Body: RequestWishBody }>("/api/child/wish-redemptions", async (request, reply) => {
    if (!assertPrototypeAuth(request, reply, "family")) {
      return;
    }

    const wishId = request.body?.wishId;

    if (!wishId) {
      return reply.code(400).send({
        error: {
          code: "INVALID_REQUEST",
          message: "wishId is required.",
        },
      });
    }

    const now = new Date().toISOString();

    const result = await app.prisma.$transaction(async (tx) => {
      const state = await loadDomainState(tx);
      const next = requestWishRedemption(state.wishBook, {
        wishId,
        redemptionId: randomUUID(),
        requestedAt: now,
      });

      if (!next.ok) {
        return next;
      }

      await saveWishBookRedFlowersAndGarden(tx, {
        wishBook: next.value.wishBook,
        redFlowers: state.redFlowers,
        garden: state.garden,
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
  });

  app.post<{ Body: RequestWishBody }>(
    "/api/child/wish-redemptions/redeem",
    async (request, reply) => {
      if (!assertPrototypeAuth(request, reply, "family")) {
        return;
      }

      const wishId = request.body?.wishId;

      if (!wishId) {
        return reply.code(400).send({
          error: {
            code: "INVALID_REQUEST",
            message: "wishId is required.",
          },
        });
      }

      const now = new Date().toISOString();

      const result = await app.prisma.$transaction(async (tx) => {
        const state = await loadDomainState(tx);
        const requested = requestWishRedemption(state.wishBook, {
          wishId,
          redemptionId: randomUUID(),
          requestedAt: now,
        });

        if (!requested.ok) {
          return requested;
        }

        const approved = approveWishRedemption(
          requested.value.wishBook,
          state.redFlowers,
          state.garden,
          {
            redemptionId: requested.value.redemption.id,
            approvedAt: now,
            ledgerEntryId: randomUUID(),
          },
        );

        if (!approved.ok) {
          return approved;
        }

        await saveWishBookRedFlowersAndGarden(tx, {
          wishBook: approved.value.wishBook,
          redFlowers: approved.value.redFlowers,
          garden: approved.value.garden,
        });

        return approved;
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
