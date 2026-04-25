---
title: WeChat Mini Program DevTools E2E Pitfalls
date: 2026-04-25
category: developer-experience
module: Mini Program E2E
problem_type: developer_experience
component: testing_framework
severity: medium
applies_when:
  - Running WeChat Mini Program E2E tests through WeChat Developer Tools CLI
  - Capturing human-reviewable screenshots from miniprogram-automator
  - Making local CI gates verify a real Mini Program launch
tags: [wechat-miniprogram, e2e, devtools, automator, screenshots, ci]
---

# WeChat Mini Program DevTools E2E Pitfalls

## Context

We added a real Mini Program E2E case for this repo: WeChat Developer Tools must load the repository-root project, automator must read the home-page marker `E2E_HOME_READY`, and the run must produce a human-reviewable home-page screenshot and log.

Several early passes were misleading because the test depended on manual behavior outside the script. The automator assertion could pass while the DevTools UI stayed gray until a person clicked the APP/simulator surface. Screenshots were also initially captured from the wrong surface, so they looked like desktop or DevTools window evidence rather than app evidence.

## Guidance

Treat WeChat Developer Tools E2E as two separate proofs:

1. Machine proof: use automator to assert stable app state.
2. Human proof: produce a screenshot only after the app surface has been made active by the script.

For this repo, the durable flow lives in `tests/e2e/miniprogram/devtools-load.mjs`:

```js
const marker = await page.$("#e2e-home-marker");
const text = await marker.text();

if (text !== "E2E_HOME_READY") {
  throw new Error("Home marker did not match");
}

await marker.tap();
await focusAndClickMiniProgramWindow();
const base64Screenshot = await miniProgram.screenshot();
fs.writeFileSync(screenshotPath, base64Screenshot, "base64");
```

The important pieces are:

- Use a deterministic marker in the app (`#e2e-home-marker` with `E2E_HOME_READY`) as the pass/fail signal.
- Let the script perform the click that a human would otherwise perform. In this repo that means an automator `tap()` plus a Windows API click on the DevTools Mini Program surface.
- Capture screenshots through `miniProgram.screenshot()` as base64, then write the file from Node. Asking automator to write directly to a path was flaky.
- Delete old screenshot/report artifacts before each run and require the current screenshot to exist before reporting success.
- Keep diagnostic DevTools window screenshots separate from app screenshots. A gray DevTools window is useful failure evidence, not a passing artifact.
- Put generated E2E logs/screenshots under `tmp/e2e/` and app-visible screenshot copies under `apps/miniprogram/e2e-artifacts/`; ignore both in git.
- Generate the in-app report fixture (`apps/miniprogram/e2e-report-data.ts`) from the E2E run so the Mini Program report page reflects the latest real result.

## Why This Matters

WeChat Developer Tools CLI can report that automation is enabled while the UI surface still has not rendered. If a human clicks the simulator during investigation, the next screenshot may succeed and make the test look deterministic when it is not.

That creates three bad outcomes:

- Local gates pass only because a person unknowingly helped the test.
- Human-review evidence is stale, gray, or from the wrong window.
- The in-app report can claim success even when the latest E2E was not actually run.

The fix is to make every required external action explicit in the script and visible in the log. The log should show steps like process cleanup, automator marker assertion, scripted click coordinates, screenshot capture, and report generation.

## When to Apply

- When a Mini Program E2E test uses WeChat Developer Tools CLI or `miniprogram-automator`.
- When `cli auto` succeeds but screenshots hang, return late, or show a gray DevTools surface.
- When a test only passes after someone clicks the simulator or APP pane.
- When a report needs both code-level assertions and human-reviewable screenshots.
- When wiring E2E into `ci:local` or another local gate that depends on an installed DevTools GUI.

## Examples

### Do not use DevTools window screenshots as passing evidence

Window-level screenshots are useful for diagnostics, but they can capture a gray DevTools workbench or unrelated desktop surface. Keep them under a diagnostic name:

```js
const diagnosticScreenshotPath = path.join(screenshotDir, "devtools-diagnostic.png");
```

The passing screenshot should be the Mini Program app screenshot:

```js
const screenshotPath = path.join(screenshotDir, "devtools-home.png");
const appScreenshotPath = path.join(appArtifactDir, "devtools-home.png");
```

### Do not let stale screenshots satisfy the run

Clean artifacts first:

```js
for (const artifactPath of [screenshotPath, appScreenshotPath, logPath, reportPath]) {
  if (fs.existsSync(artifactPath)) {
    fs.rmSync(artifactPath, { force: true });
  }
}
```

Then require the current screenshot for success:

```js
const passed =
  build.code === 0 &&
  automatorResult.passed &&
  automatorResult.screenshotOk &&
  fs.existsSync(screenshotPath);
```

### Do not rely on DevTools `build-npm` for this E2E path

The DevTools `build-npm` command stalled at `Fetching AppID (touristappid) permissions`. Since the Mini Program currently has no runtime npm dependencies, use the repo script to prepare `miniprogram_npm` instead:

```js
return runPnpm(
  ["--filter", "@red-flower-garden/miniprogram", "run", "pack:npm"],
  "miniprogram pack:npm",
);
```

### Keep clean start scoped to old processes

Do not blindly kill every DevTools process after starting a new run. Snapshot existing DevTools PIDs first, call `quit`, then terminate only those pre-existing PIDs. Otherwise, the cleanup step can kill the freshly launched automation session.

### Make the local gate explicit

The real local gate should run the actual E2E script, not only a weaker DevTools presence check:

```json
{
  "scripts": {
    "ci:local": "eslint . --max-warnings=0 && prettier . --check && tsc -p packages/domain/tsconfig.json --noEmit && tsc -p apps/api/tsconfig.json --noEmit && tsc -p apps/miniprogram/tsconfig.json --noEmit && vitest run && node scripts/run-e2e-devtools-load.mjs",
    "e2e": "node scripts/run-e2e-devtools-load.mjs"
  }
}
```

## Related

- `tests/e2e/miniprogram/devtools-load.mjs`
- `apps/miniprogram/pages/smoke/index.wxml`
- `apps/miniprogram/pages/e2e-report/index.ts`
- `apps/miniprogram/e2e-report-data.ts`
- `docs/e2e/red-flower-garden-acceptance.md`
