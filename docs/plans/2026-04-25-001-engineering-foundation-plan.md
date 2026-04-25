---
date: 2026-04-25
status: completed
type: implementation-plan
sequence: 1
topic: red-flower-garden-engineering-foundation
origin: docs/brainstorms/red-flower-garden-prototype-requirements.md
---

# Engineering Foundation Plan

## Overview

This plan establishes the repository, dependency strategy, test layers, quality gates, and CI baseline for the Little Red Flower Garden prototype. It intentionally delivers minimal product behavior, but it must make later product work predictable, testable, and understandable.

This is the first plan in a four-plan sequence:

- 001. Engineering foundation
- 002. Domain model and minimal end-to-end prototype
- 003. Child garden experience productization
- 004. Parent management, deployment, and complete acceptance

---

## Problem Frame

The prototype must become a durable software project, not a throwaway demo. Later work will involve WeChat Mini Program UI, a reachable service, local persistence, domain rules, UI automation, and human-readable acceptance checks. The first step is to create a clean monorepo and quality baseline before product behavior expands.

Requirements carried from the origin document:

- R19. The mini program must not store business data on the phone.
- R20. All business data must be stored on a service that runs on Windows or macOS.
- R21. The prototype is for WeChat Mini Program development or experience-version use.
- R23. Use a lightweight shared access mechanism for the experience version, while deferring full account systems.

---

## Scope Boundaries

- This plan does not implement the real red-flower domain rules beyond smoke examples.
- This plan does not build polished child or parent UI.
- This plan does not deploy the service publicly.
- This plan does not require WeChat-login, account invitation, or multi-family support.
- This plan does not require full Mini Program UI automation coverage yet; it establishes the harness shape and a smoke path.

---

## Key Technical Decisions

- Use a TypeScript monorepo with `apps/miniprogram`, `apps/api`, and `packages/domain`: This keeps UI, service orchestration, and domain rules separate from the beginning.
- Use Fastify for `apps/api`: It supports TypeScript well and provides an inject-based testing path for stable API tests.
- Use Prisma with SQLite for persistence: It gives a readable schema, migration history, and a lightweight runtime suitable for Windows development and future Mac mini hosting.
- Use Vitest for unit and integration-style tests: One runner can cover domain tests and most service tests.
- Treat the Mini Program as a first-class workspace, not a generic web app: It needs `project.config.json`, a Mini Program-specific TypeScript configuration, API typings, npm build handling, and documented WeChat Developer Tools open steps.
- Use human-readable E2E markdown from the beginning: The first real users are family members, so acceptance must be understandable outside the code.
- Use CI as a required quality gate, even while the repo is small: The project should not accumulate untyped or untested foundations.

---

## Output Structure

    apps/
      api/
      miniprogram/
        sitemap.json
        tsconfig.json
    project.config.json
    packages/
      domain/
    docs/
      brainstorms/
      e2e/
      plans/
    tests/
      e2e/
        api/
        miniprogram/
    prisma/
      schema.prisma
      migrations/
    .github/
      workflows/

---

## Implementation Units

- U1. **Create Monorepo Skeleton**

**Goal:** Establish the repository layout and package boundaries that later plans will build on.

**Requirements:** R19, R20

**Dependencies:** None

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `apps/api/package.json`
- Create: `apps/miniprogram/package.json`
- Create: `apps/miniprogram/project.private.config.example.json`
- Create: `apps/miniprogram/sitemap.json`
- Create: `apps/miniprogram/tsconfig.json`
- Create: `packages/domain/package.json`
- Create: `project.config.json`
- Create: `README.md`

**Approach:**
- Use workspaces so each app/package can own its dependencies while sharing scripts and TypeScript settings.
- Define the architectural boundary in `README.md`: domain rules in `packages/domain`, API orchestration in `apps/api`, WeChat presentation in `apps/miniprogram`.
- Configure root `project.config.json` as the single WeChat Developer Tools entry with `miniprogramRoot` pointing at `apps/miniprogram/`, TypeScript support, npm build expectations, and an AppID placeholder strategy suitable for local development.
- Keep machine/user-specific WeChat Developer Tools settings out of git via `project.private.config.example.json` and documented local setup.

**Test scenarios:**
- Smoke: Installing dependencies from the repo root resolves all workspaces.
- Smoke: A root script can delegate to workspace scripts without path-specific manual setup.
- Smoke: WeChat Developer Tools can open the repository root using the committed project metadata after the developer supplies local private config.

**Verification:**
- The repository has clear app/package boundaries and a documented startup/testing path.

---

- U2. **Add Quality Gates**

**Goal:** Introduce repeatable quality checks before meaningful product code arrives.

**Requirements:** R20

**Dependencies:** U1

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc`
- Create: `.prettierignore`
- Create: `vitest.config.ts`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`

**Approach:**
- Configure root scripts for `lint`, `typecheck`, `test`, and `ci`.
- CI should run the same commands developers run locally.
- Keep the checks strict but not exotic: TypeScript strict mode, linting, formatting, and tests.
- Add Mini Program-specific local scripts for TypeScript checking and npm packaging. These scripts should validate the Mini Program project shape without requiring upload credentials.
- Do not require `miniprogram-ci` upload/preview in general GitHub CI unless upload private keys and stable runner IP allowlists are explicitly configured.

**Test scenarios:**
- Quality gate: `lint` fails on obvious lint errors.
- Quality gate: `typecheck` fails on type errors.
- Quality gate: `test` runs at least one workspace test.
- Mini Program gate: `apps/miniprogram` typecheck and npm packaging scripts run locally without depending on global repo-root `node_modules` behavior.

**Verification:**
- A clean checkout can run the same quality gate locally and in CI.

---

- U3. **Add Minimal Service And Domain Smoke Tests**

**Goal:** Prove the chosen tooling works before implementing real domain behavior.

**Requirements:** R20

**Dependencies:** U1, U2

**Files:**
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/src/index.test.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/health.test.ts`

**Approach:**
- Add a minimal domain export and a health route.
- Keep service creation testable by separating Fastify app construction from server listening.

**Test scenarios:**
- Unit: A domain smoke function returns the expected stable value.
- API: `GET /health` returns a successful response through Fastify's test injection path.

**Verification:**
- Domain and API tests both pass through the root test command.

---

- U4. **Add Mini Program Tooling Baseline**

**Goal:** Make native WeChat Mini Program development, local preview, npm packaging, TypeScript, and future automation explicit from the first iteration.

**Requirements:** R20, R21

**Dependencies:** U1, U2

**Files:**
- Modify: `apps/miniprogram/package.json`
- Modify: `apps/miniprogram/tsconfig.json`
- Modify: `project.config.json`
- Modify: `README.md`
- Create: `docs/development/wechat-miniprogram-setup.md`

**Approach:**
- Add `miniprogram-api-typings` for official Mini Program API types.
- Decide and document the npm layout: `apps/miniprogram` owns Mini Program-compatible dependencies and runs the WeChat npm build into `miniprogram_npm`.
- Add scripts for local Mini Program typecheck and npm packaging, with clear notes about packages that cannot run in Mini Program because they depend on Node built-ins, dynamic `require`, `window`, or native addons.
- Document `miniprogram-ci` as the future preview/upload tool, including private key path, robot number, IP allowlist, and why upload/preview is not part of default CI yet.

**Test scenarios:**
- Tooling: Mini Program API types are available in page/component TypeScript files.
- Tooling: The documented npm packaging command produces the expected Mini Program npm output location.
- Documentation: A developer can identify where to put their AppID and WeChat Developer Tools private config without committing secrets.

**Verification:**
- The Mini Program workspace can be opened and prepared for local development before any product page is implemented.

---

- U5. **Create Acceptance Test Scaffolding**

**Goal:** Establish where human-readable and automated E2E tests live.

**Requirements:** AE1, AE2, AE3, AE4

**Dependencies:** U1, U2

**Files:**
- Create: `docs/e2e/red-flower-garden-acceptance.md`
- Create: `tests/e2e/miniprogram/devtools-load.mjs`

**Approach:**
- Document acceptance scenarios in plain Chinese so a parent/developer can execute them manually.
- Keep a single automated E2E entry under `tests/e2e/`; avoid placeholder test directories or duplicate script entrypoints.

**Test scenarios:**
- Documentation: AE1 through AE4 are listed as named scenarios with setup, action, and expected result.
- Scaffolding: Test folders explain which later plan will populate each layer.

**Verification:**
- The project has a visible testing strategy before core behavior is implemented.

---

## System-Wide Impact

- **Interaction graph:** This plan defines project boundaries only; runtime interaction remains minimal.
- **Error propagation:** Establish API test shape now so later errors can be verified through stable response formats.
- **State lifecycle risks:** No production state yet; SQLite and Prisma scaffolding are introduced for later persistence.
- **API surface parity:** Future child and parent APIs should be tested through the same service construction pattern.
- **Integration coverage:** Human E2E docs and API E2E folders create the acceptance backbone for later plans.
- **Unchanged invariants:** No origin product behavior is considered complete in this plan.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Tooling becomes heavier than the prototype warrants | Keep the stack boring: TypeScript, Fastify, Prisma, SQLite, Vitest, ESLint, Prettier |
| Mini Program monorepo npm behavior surprises implementers | Put Mini Program-compatible dependencies under `apps/miniprogram` and document npm packaging from the start |
| WeChat upload/preview credentials leak into CI | Keep `miniprogram-ci` upload/preview out of default CI until private key and IP allowlist handling are deliberately configured |
| Mini Program automation is brittle too early | Add only smoke scaffolding here; require stable UI automation in plan 002 |
| Developers bypass checks while moving fast | Make root `ci` the single documented quality gate |

---

## Documentation / Operational Notes

- `README.md` should describe how to install dependencies, run quality checks, start the API, and open the Mini Program project.
- `docs/development/wechat-miniprogram-setup.md` should describe WeChat Developer Tools setup, AppID/private config handling, npm build, TypeScript typings, and future `miniprogram-ci` prerequisites.
- `docs/e2e/red-flower-garden-acceptance.md` should stay human-readable and should not be replaced by code-only tests.

---

## Sources & References

- Origin document: `docs/brainstorms/red-flower-garden-prototype-requirements.md`
- Follow-up plan: `docs/plans/2026-04-25-002-domain-minimal-e2e-plan.md`
