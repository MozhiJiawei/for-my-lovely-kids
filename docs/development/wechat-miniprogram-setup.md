# WeChat Mini Program Engineering Practices

This project treats the WeChat Mini Program as a native Mini Program workspace, not as a browser web app.

## Official References

- Project configuration: https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.html
- npm support: https://developers.weixin.qq.com/miniprogram/dev/devtools/npm.html
- CI tools overview: https://developers.weixin.qq.com/miniprogram/dev/devtools/ci.html
- API typings: https://github.com/wechat-miniprogram/api-typings
- miniprogram-ci package: https://www.npmjs.com/package/miniprogram-ci

## Adopted Baseline

- Root `project.config.json` is committed because WeChat Developer Tools should be able to open the repository root.
- `project.private.config.json` and `apps/miniprogram/project.private.config.json` are ignored because they can contain developer-local AppID and tool settings.
- `appid` in committed config uses `touristappid`; real AppIDs belong in local private config or WeChat Developer Tools.
- `compileType` is `miniprogram`.
- The root config uses `miniprogramRoot: "apps/miniprogram/"`.
- TypeScript compiler support is enabled through `setting.useCompilerPlugins`.
- Mini Program npm build is configured manually so dependencies owned by `apps/miniprogram/package.json` are packed into `apps/miniprogram/miniprogram_npm`.

## Local Setup

1. Install dependencies from the repository root:

   ```bash
   corepack pnpm install
   ```

2. Create local private config if you need local AppID/tool settings:

   ```bash
   cp apps/miniprogram/project.private.config.example.json project.private.config.json
   ```

3. Replace the example AppID with your local Mini Program AppID if you have one. Use `touristappid` only for local exploration where WeChat Developer Tools allows it.

4. Open the repository root in WeChat Developer Tools. The root `project.config.json` points the tool at `apps/miniprogram/`.

## TypeScript

The Mini Program workspace installs `miniprogram-api-typings`, the official WeChat Mini Program API type package. `apps/miniprogram/tsconfig.json` includes those types so page and component TypeScript files can use `wx`, `App`, `Page`, and related APIs with type checking.

Run:

```bash
corepack pnpm run miniprogram:typecheck
```

## npm Packaging

Mini Program runtime dependencies must be compatible with the Mini Program JavaScript environment. Avoid packages that require Node built-ins, native addons, browser globals such as `window`, or dynamic module loading that the Mini Program packer cannot statically analyze.

The adopted rule is:

- Put Mini Program runtime dependencies in `apps/miniprogram/package.json`.
- Run the Mini Program npm packaging command from the repository root:

  ```bash
  corepack pnpm run miniprogram:pack-npm
  ```

- Treat `apps/miniprogram/miniprogram_npm` as generated output and do not commit it.

When runtime dependencies exist, `apps/miniprogram/scripts/pack-npm.mjs` delegates to `miniprogram-ci.packNpmManually` with `packageJsonPath` pointing at the Mini Program package file and output rooted at the Mini Program directory.

## miniprogram-ci Preview And Upload

`miniprogram-ci` is documented now but not part of default GitHub CI. Preview and upload require deliberate secret handling:

- A code upload private key downloaded by a Mini Program administrator.
- A robot number.
- IP allowlist configuration in the Mini Program administration console.
- A stable secret path or CI secret injection strategy.

Until those are decided, default CI validates the project with linting, formatting, TypeScript, tests, and local npm packaging shape only.

## Developer Tools Load Check

Run the single project CI gate after installing WeChat Developer Tools:

```bash
corepack pnpm run ci
```

This invokes the real startup E2E after lint, formatting, typecheck, and Vitest. The script runs WeChat Developer Tools against the repository root, enables automation, launches `/pages/smoke/index`, asserts that `#e2e-home-marker` has text `E2E_HOME_READY`, and writes human-review evidence to `tmp/e2e/`.

If WeChat Developer Tools is not installed, the E2E step skips by default with an explicit message. On a Windows or macOS self-hosted runner with Developer Tools installed, set `WECHAT_DEVTOOLS_REQUIRED=1` to make the E2E step required.

If Developer Tools is installed in a non-standard path, set:

```bash
WECHAT_DEVTOOLS_CLI="C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat"
```

Hosted GitHub runners usually do not have WeChat Developer Tools installed, so `e2e` skips when the CLI is missing. On a Windows or macOS self-hosted runner with Developer Tools installed, set `WECHAT_DEVTOOLS_REQUIRED=1` to make this check a required CI gate.

## E2E Artifacts

Stable, human-readable acceptance scenarios live in `docs/e2e/`.

Temporary outputs from local E2E runs live in `tmp/e2e/` and are ignored by git. Put generated Markdown reports, screenshots, traces, and exported logs there. If a report becomes a lasting product requirement or release artifact, summarize the decision in `docs/e2e/` instead of committing the raw run output.

## Data Boundary

The Mini Program must not persist business data such as tasks, wishes, balances, submissions, or redemption records on the phone. Later product code may cache non-authoritative display state only when it can be refreshed from the API. The service remains the source of truth.
