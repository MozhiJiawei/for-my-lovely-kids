# Little Red Flower Garden

红花花园是一个微信小程序体验版原型。孩子在小程序里完成任务、等待家长确认、积累小红花并兑换愿望；所有业务数据由服务端保存，手机端只负责展示和提交操作。

## Project Layout

- `project.config.json`: 微信开发者工具入口配置。可以直接用开发者工具打开仓库根目录。
- `apps/miniprogram`: 原生微信小程序展示层。只放小程序页面、组件、样式、轻量请求封装和小程序专用依赖。
- `apps/api`: Fastify 服务端。负责 HTTP 接口、持久化编排、鉴权/访问机制和运行入口。
- `packages/domain`: 纯领域规则。不得依赖微信 API、Fastify、Prisma 或本地存储。
- `prisma`: 后续服务端持久化 schema 和迁移目录。
- `data`: 本地 SQLite 业务数据目录。该目录不进入版本库，备份时请复制这里的 `.db` 文件。
- `docs/e2e`: 人能读懂的验收场景。
- `tmp/e2e`: 本地 E2E 测试临时产物，如运行报告、截图和日志。该目录不进入版本库。
- `tests/e2e/miniprogram/devtools-load.mjs`: 唯一自动化 E2E 测试入口。

## Requirements

- Node.js 22 or newer.
- pnpm 10. Use `corepack pnpm ...` if the global `pnpm` shim is not available.
- WeChat Developer Tools for Mini Program development.

## Install

```bash
corepack pnpm install
```

## Quality Gate

```bash
corepack pnpm run ci
```

This runs linting, formatting checks, TypeScript checks, and tests. GitHub Actions runs the same gate on pushes to `main` and pull requests.

The same gate also invokes the real Mini Program startup E2E. It uses WeChat Developer Tools automation to launch the Mini Program, assert the `E2E_HOME_READY` home marker, and generate human-review evidence under `tmp/e2e/`. If Developer Tools is not installed, this E2E step skips by default with an explicit message. If the tool is installed in a non-standard location, set `WECHAT_DEVTOOLS_CLI` to the full `cli.bat` or `cli` path.

GitHub Actions also runs `e2e`. Hosted runners normally skip it because WeChat Developer Tools is not installed there. On a Windows or macOS runner with Developer Tools installed, set `WECHAT_DEVTOOLS_REQUIRED=1` to make missing/unusable Developer Tools fail CI.

## API

```bash
corepack pnpm run dev:api
```

When `DATABASE_URL` is not set, the API stores local SQLite data in `data/red-flower-dev.db`.
Back up that file before moving machines or clearing local data. The API also exposes a smoke
health route at `GET /health`.

Docker deployment scripts live in `deploy/`. On the Linux server, run:

```bash
bash deploy/deploy-api.sh
```

See `deploy/README.md` for server deploy, backup, restore, and prototype reset commands.

## Mini Program

1. Open the repository root directory in WeChat Developer Tools:
   `D:\Agent Repo\for-my-lovely-kids`
2. Copy `apps/miniprogram/project.private.config.example.json` to `project.private.config.json` if you want local private settings.
3. Fill in your local AppID in WeChat Developer Tools or the private config file.
4. Run checks from the repo root:

```bash
corepack pnpm run miniprogram:typecheck
corepack pnpm run miniprogram:pack-npm
```

The Mini Program owns Mini Program-compatible npm dependencies under `apps/miniprogram`. WeChat npm build output belongs in `apps/miniprogram/miniprogram_npm` and is ignored by git.

More setup details are in `docs/development/wechat-miniprogram-setup.md`.
