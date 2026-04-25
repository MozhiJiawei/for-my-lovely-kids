---
date: 2026-04-25
status: active
type: development-standard
topic: testing-standards
---

# Testing Standards

## Test Locations

Keep tests close to the boundary they verify.

- Domain and module-level unit tests live next to the source they exercise.
  - Example: `packages/domain/src/red-flower-rules.test.ts`
  - Example: `apps/api/src/health.test.ts`
- API flow tests that cross HTTP routes, repositories, Prisma, and SQLite live under `tests/e2e/api`.
  - Example: `tests/e2e/api/red-flower-flow.test.ts`
- Mini Program automation and WeChat Developer Tools smoke tests live under `tests/e2e/miniprogram`.
  - Example: `tests/e2e/miniprogram/devtools-load.mjs`

## Boundary Rules

- Put a test next to source when it validates one package or one module's local behavior.
- Put a test under `tests/e2e` when it validates a user or system flow across multiple runtime boundaries.
- API E2E tests may use Fastify `inject` for deterministic speed, but they must assert persisted database state when the behavior depends on durability.
- Mini Program tests should reset server-side fixtures before running and should not depend on phone-local business state.

## CI Entry Point

- `corepack pnpm run ci` is the single quality gate.
- Keep lower-level scripts such as `test` and `e2e` as reusable building blocks, not alternative CI gates.
- Environment-dependent E2E checks should run from `ci` and skip with an explicit message when their local dependency is unavailable.
- To make the WeChat Developer Tools E2E mandatory on a capable runner, set `WECHAT_DEVTOOLS_REQUIRED=1`.

## Red Flower Garden Expectations

- Domain tests must cover the red-flower state machine: pending submissions, parent confirmation, available versus cumulative flowers, insufficient balance, and memorial decoration creation.
- API E2E tests must cover the same critical rules through real API routes and SQLite persistence.
- Error-path API tests must assert the structured error envelope: `{ error: { code, message } }`.
