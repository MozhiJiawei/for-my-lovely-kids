<!-- BEGIN COMPOUND CODEX TOOL MAP -->

## Tool Mapping

This section maps Claude Code plugin tool references to Codex behavior.
Only this block is managed automatically.

Tool mapping:

- Read: use shell reads (cat/sed) or rg
- Write: create files via shell redirection or apply_patch
- Edit/MultiEdit: use apply_patch
- Bash: use shell_command
- Grep: use rg (fallback: grep)
- Glob: use rg --files or find
- LS: use ls via shell_command
- WebFetch/WebSearch: use curl or Context7 for library docs
- AskUserQuestion/Question: present choices as a numbered list in chat and wait for a reply number. For multi-select (multiSelect: true), accept comma-separated numbers. Never skip or auto-configure — always wait for the user's response before proceeding.
- Task (subagent dispatch) / Subagent / Parallel: run sequentially in main thread; use multi_tool_use.parallel for tool calls
- TaskCreate/TaskUpdate/TaskList/TaskGet/TaskStop/TaskOutput (Claude Code task-tracking, current): use update_plan (Codex's task-tracking primitive)
- TodoWrite/TodoRead (Claude Code task-tracking, legacy — deprecated, replaced by Task\* tools): use update_plan
- Skill: open the referenced SKILL.md and follow it
- ExitPlanMode: ignore
<!-- END COMPOUND CODEX TOOL MAP -->

# Project Overview

- `apps/miniprogram`: WeChat Mini Program pages, styles, and lightweight API client code.
- `apps/api`: Fastify server, HTTP routes, auth, and persistence orchestration.
- `packages/domain`: pure domain rules; do not depend on WeChat APIs, Fastify, Prisma, or local storage.
- `prisma`: SQLite data model.
- `deploy`: Linux deployment, object storage, and data safety scripts. See `deploy/README.md` for operational commands.
- `data`, `tmp`, real `.env` files, production DB files, and secret files must not be committed.
- User-facing documentation should be written in Chinese. Agent-facing and internal technical documentation should be written in English. Preserve English technical terms when translation could introduce ambiguity.

# Quality Checks

Common commands:

```bash
corepack pnpm run typecheck
corepack pnpm run lint
corepack pnpm test
corepack pnpm run ci
```

`ci` includes Mini Program E2E. It skips by default when WeChat Developer Tools is unavailable; set `WECHAT_DEVTOOLS_REQUIRED=1` to make missing tools fail.

# Server Context

- The public API currently points to `http://39.105.78.135:3000`; the Mini Program profile lives in `apps/miniprogram/src/config/api.ts`.
- The Linux server app directory is `/opt/red-flower-garden`.
- The API runs in Docker: container `red-flower-garden-api`, image `red-flower-garden-api:local`, volume `red-flower-data`.
- The production SQLite path inside the container is `/data/red-flower-prod.db`.
- Deployment entrypoint: `deploy/deploy-api.sh`. The image carries runtime dependencies and the start command; API/domain source code is mounted read-only from `/opt/red-flower-garden` into the container. Ordinary backend code changes should sync the repository and restart/recreate the container with these mounts, not rebuild the image. Rebuild only when dependencies, Dockerfile/runtime packages, Prisma client generation requirements, or package metadata change; use `FORCE_REBUILD=1 bash deploy/deploy-api.sh` for that path.
- Server-side object storage config lives at `/etc/red-flower-garden/object-storage.env`; the repo only keeps `deploy/object-storage.env.example`.
- Current OSS bucket: `mozhi-red-flower-garden`; region: `oss-cn-guangzhou`; app-level prefix: `red-flower-garden/`. Backup and future image/object features should share this app root and use separate child prefixes.
- Backup, verification, local restore, OSS restore, and scheduled backup are internal `deploy` capabilities. Monitoring or maintenance pages should reuse those scripts or equivalent semantics instead of reimplementing data safety logic. See `deploy/README.md` for commands.

# Safety Rules

- Never commit SSH keys, AccessKeys, `deploy/api.env`, `deploy/object-storage.env`, production DB files, or backup files.
- Do not read or print secret values. When showing configuration, show only variable names or `<redacted>`.
- Mini Program actions that manage tasks, wishes, history records, red flowers, or other child-facing state must be protected by the existing parent-control flow. Reuse `apps/miniprogram/src/parent-control.ts` and the `parent-control-panel` component, including its unlock cache; do not introduce a separate passcode store or parallel confirmation logic.
- Do not directly copy a live SQLite file. Backups must use SQLite online backup semantics and integrity verification.
- Do not bypass the atomic scripts in `deploy` with ad hoc production deploy, backup, or restore flows.
- Run long-running or destructive remote operations step by step. Before each step, state the impact and exactly what that step will do.
