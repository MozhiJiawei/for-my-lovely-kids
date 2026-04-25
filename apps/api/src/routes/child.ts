import { randomUUID } from "node:crypto";

import {
  approveWishRedemption,
  requestWishRedemption,
  submitTask,
} from "@red-flower-garden/domain";
import type { FastifyInstance } from "fastify";

import { assertPrototypeAuth } from "../auth/prototype-auth";
import {
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

    const result = await app.prisma.$transaction(async (tx) => {
      const state = await loadDomainState(tx);
      const next = submitTask(state.taskBook, {
        taskId,
        submissionId: randomUUID(),
        submittedAt: now,
      });

      if (!next.ok) {
        return next;
      }

      await saveTaskBookAndRedFlowers(tx, {
        taskBook: next.value.taskBook,
        redFlowers: state.redFlowers,
      });

      return next;
    });

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
            decorationId: randomUUID(),
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
