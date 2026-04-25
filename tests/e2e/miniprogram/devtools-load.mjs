import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import automator from "miniprogram-automator";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const projectPath = repoRoot;
const reportDir = path.join(repoRoot, "tmp", "e2e", "reports");
const screenshotDir = path.join(repoRoot, "tmp", "e2e", "screenshots");
const appArtifactDir = path.join(repoRoot, "apps", "miniprogram", "e2e-artifacts");
const screenshotPath = path.join(screenshotDir, "devtools-home.png");
const diagnosticScreenshotPath = path.join(screenshotDir, "devtools-diagnostic.png");
const appScreenshotPath = path.join(appArtifactDir, "devtools-home.png");
const logPath = path.join(reportDir, "devtools-load.log");
const reportPath = path.join(reportDir, "devtools-load.md");
const appReportDataPath = path.join(repoRoot, "apps", "miniprogram", "e2e-report-data.ts");
const required = process.env.WECHAT_DEVTOOLS_REQUIRED === "1";
let realtimeLogEnabled = false;

function timestamp() {
  return new Date().toISOString();
}

function appendLog(text) {
  if (realtimeLogEnabled) {
    fs.appendFileSync(logPath, text);
  }
  process.stdout.write(text);
}

function logLine(message = "") {
  appendLog(message ? `[${timestamp()}] ${message}\n` : "\n");
}

function logBlock(title, text) {
  logLine(title);
  if (text) {
    appendLog(`${text.endsWith("\n") ? text : `${text}\n`}`);
  }
}

function tsStringLiteral(value) {
  if (value.includes('"')) {
    return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
  }

  return JSON.stringify(value);
}

function withTimeout(promise, ms, label) {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
        } else {
          reject(new Error("Unable to allocate an automator port."));
        }
      });
    });
  });
}

function candidateCliPaths() {
  const candidates = [];

  if (process.env.WECHAT_DEVTOOLS_CLI) {
    candidates.push(process.env.WECHAT_DEVTOOLS_CLI);
  }

  if (process.platform === "win32") {
    const programFilesX86 = process.env["ProgramFiles(x86)"];
    const localAppData = process.env.LOCALAPPDATA;

    if (programFilesX86) {
      candidates.push(path.join(programFilesX86, "Tencent", "微信web开发者工具", "cli.bat"));
      candidates.push(path.join(programFilesX86, "Tencent", "微信开发者工具", "cli.bat"));
    }

    if (localAppData) {
      candidates.push(path.join(localAppData, "微信开发者工具", "cli.bat"));
      candidates.push(path.join(localAppData, "Programs", "微信开发者工具", "cli.bat"));
    }
  }

  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/wechatwebdevtools.app/Contents/Resources/app.nw/bin/cli",
      "/Applications/微信开发者工具.app/Contents/Resources/app.nw/bin/cli",
    );
  }

  return candidates;
}

function findCliPath() {
  return candidateCliPaths().find((candidate) => fs.existsSync(candidate));
}

function killProcessTree(pid, label) {
  if (!pid) {
    return;
  }

  if (process.platform === "win32") {
    spawn("taskkill.exe", ["/pid", String(pid), "/T", "/F"], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    logLine(`Killed process tree for ${label}: pid=${pid}`);
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
    logLine(`Killed process for ${label}: pid=${pid}`);
  } catch (error) {
    logLine(`Failed to kill process for ${label}: ${String(error)}`);
  }
}

function runCli(cliPath, commandName, extraArgs = []) {
  const command = process.platform === "win32" ? "cmd.exe" : cliPath;
  const cliArgs = [commandName, "--project", projectPath, ...extraArgs];
  const args = process.platform === "win32" ? ["/d", "/c", "call", cliPath, ...cliArgs] : cliArgs;

  return new Promise((resolve) => {
    logLine(`CLI start: ${commandName} ${extraArgs.join(" ")}`.trim());
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    const timer = setTimeout(() => {
      killProcessTree(child.pid, `cli ${commandName}`);
      output += `\nTimed out while running ${commandName}.\n`;
      logLine(`CLI timeout: ${commandName}`);
    }, 90_000);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      appendLog(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      appendLog(text);
    });
    child.stdin.write("y\n");
    child.stdin.end();
    child.on("close", (code) => {
      clearTimeout(timer);
      logLine(`CLI end: ${commandName}, exit=${code}`);
      resolve({ code, output });
    });
  });
}

function runPnpm(args, label) {
  const command = process.platform === "win32" ? "cmd.exe" : "corepack";
  const commandArgs =
    process.platform === "win32" ? ["/d", "/c", "corepack", "pnpm", ...args] : ["pnpm", ...args];

  return new Promise((resolve) => {
    logLine(`PNPM start: ${label}`);
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    const timer = setTimeout(() => {
      killProcessTree(child.pid, `pnpm ${label}`);
      output += `\nTimed out while running ${label}.\n`;
      logLine(`PNPM timeout: ${label}`);
    }, 90_000);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      appendLog(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      appendLog(text);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      logLine(`PNPM end: ${label}, exit=${code}`);
      resolve({ code, output });
    });
  });
}

function miniprogramPackageJsonPath() {
  return path.join(repoRoot, "apps", "miniprogram", "package.json");
}

function hasMiniProgramRuntimeDependencies() {
  const packageJson = JSON.parse(fs.readFileSync(miniprogramPackageJsonPath(), "utf8"));
  return Object.keys(packageJson.dependencies ?? {}).length > 0;
}

async function prepareMiniProgramNpm() {
  if (hasMiniProgramRuntimeDependencies()) {
    logLine("Mini Program runtime dependencies detected; packing npm with project script.");
  } else {
    logLine(
      "No Mini Program runtime dependencies detected; preparing miniprogram_npm placeholder.",
    );
  }

  return runPnpm(
    ["--filter", "@red-flower-garden/miniprogram", "run", "pack:npm"],
    "miniprogram pack:npm",
  );
}

async function waitForIdeServiceToClose() {
  logLine("Waiting for WeChat Developer Tools service to close.");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await new Promise((resolve) => {
      const child = spawn("cmd.exe", ["/d", "/c", "netstat", "-ano"], {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
      });
      child.on("close", () => {
        resolve(output);
      });
    });

    if (!result.includes(":49441")) {
      logLine("WeChat Developer Tools service port 49441 is closed.");
      return;
    }

    await wait(500);
  }

  logLine(
    "Timed out waiting for service port 49441 to close; continuing with a clean-start attempt.",
  );
}

async function getDevToolsProcessSnapshot() {
  if (process.platform !== "win32") {
    return [];
  }

  const command = [
    "$targets=@(Get-CimInstance Win32_Process | Where-Object {",
    "  (",
    "    $_.Name -eq 'wechatdevtools.exe' -or",
    "    (($_.Name -eq 'node.exe' -or $_.Name -eq 'cmd.exe') -and $_.CommandLine -like '*微信web开发者工具*')",
    "  )",
    "});",
    "$targets | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress",
  ].join("\n");

  const result = await new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", command], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ code, output });
    });
  });

  if (result.code !== 0 || !result.output.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(result.output);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    logLine(`Failed to parse DevTools process snapshot: ${String(error)}`);
    logBlock("Raw process snapshot output:", result.output);
    return [];
  }
}

async function terminateDevToolsProcesses(processes) {
  if (process.platform !== "win32" || processes.length === 0) {
    return;
  }

  const processIds = processes.map((processInfo) => processInfo.ProcessId).filter(Boolean);
  logLine(`Clean start: terminating ${processIds.length} pre-existing DevTools process(es).`);
  const command = [
    `$processIds=@(${processIds.join(",")});`,
    "$processIds | ForEach-Object {",
    "  $processId=$_;",
    "  $target=Get-Process -Id $_ -ErrorAction SilentlyContinue;",
    "  if ($target) {",
    '    try { Stop-Process -Id $processId -Force -ErrorAction Stop; Write-Output "stopped $($target.ProcessName) $processId" }',
    '    catch { Write-Output "failed $($target.ProcessName) ${processId}: $($_.Exception.Message)" }',
    "  } else {",
    '    Write-Output "already exited $processId"',
    "  }",
    "}",
  ].join("\n");

  const result = await new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", command], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ code, output });
    });
  });

  logBlock(`Clean start process cleanup exit=${result.code}.`, result.output);
  await wait(1000);
}

async function cleanStartDevTools(cliPath) {
  const existingProcesses = await getDevToolsProcessSnapshot();
  logLine(`Clean start: found ${existingProcesses.length} pre-existing DevTools process(es).`);

  if (existingProcesses.length === 0) {
    logLine("Clean start: no existing DevTools process found; skipping quit/kill.");
    return "No pre-existing WeChat Developer Tools process found; skipped quit.\n";
  }

  logLine("Clean start: quitting existing WeChat Developer Tools session.");
  const quit = await runCli(cliPath, "quit");
  await waitForIdeServiceToClose();
  await terminateDevToolsProcesses(existingProcesses);
  return quit.output;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function connectAutomator(automatorPort) {
  let lastError;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      logLine(`Automator connect attempt ${attempt + 1}/12 on port ${automatorPort}.`);
      return await automator.connect({
        wsEndpoint: `ws://127.0.0.1:${automatorPort}`,
      });
    } catch (error) {
      lastError = error;
      logLine(`Automator connect attempt ${attempt + 1}/12 failed: ${String(error)}`);
      await wait(1000);
    }
  }

  throw lastError;
}

async function captureDevToolsWindowScreenshot() {
  logLine("Screenshot capture start: locating WeChat Developer Tools window.");
  if (process.platform !== "win32") {
    return {
      ok: false,
      output:
        "Developer Tools window screenshot capture is currently implemented for Windows local runs.",
    };
  }

  const command = [
    "$signature=@'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public class Win32 {",
    '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
    '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);',
    '  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);',
    '  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);',
    "}",
    "public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }",
    "'@;",
    "Add-Type $signature;",
    "$proc=Get-Process wechatdevtools -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*for-my-lovely-kids*微信开发者工具*' } | Select-Object -First 1;",
    "if (-not $proc) { throw 'WeChat Developer Tools window was not found.'; }",
    "$hwndTopMost=[IntPtr]::new(-1);",
    "$hwndNoTopMost=[IntPtr]::new(-2);",
    "$swpNoMove=0x0002;",
    "$swpNoSize=0x0001;",
    "$swpShowWindow=0x0040;",
    "[Win32]::ShowWindowAsync($proc.MainWindowHandle,9) | Out-Null;",
    "[Win32]::SetWindowPos($proc.MainWindowHandle,$hwndTopMost,0,0,0,0,$swpNoMove -bor $swpNoSize -bor $swpShowWindow) | Out-Null;",
    "[Win32]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null;",
    "Start-Sleep -Milliseconds 1800;",
    "Add-Type -AssemblyName System.Windows.Forms;",
    "Add-Type -AssemblyName System.Drawing;",
    "$rect=New-Object RECT;",
    "[Win32]::GetWindowRect($proc.MainWindowHandle,[ref]$rect) | Out-Null;",
    "$width=$rect.Right-$rect.Left;",
    "$height=$rect.Bottom-$rect.Top;",
    "if ($width -le 0 -or $height -le 0) { throw 'WeChat Developer Tools window bounds were invalid.'; }",
    "$bitmap=New-Object System.Drawing.Bitmap $width,$height;",
    "$graphics=[System.Drawing.Graphics]::FromImage($bitmap);",
    "$graphics.CopyFromScreen($rect.Left,$rect.Top,0,0,$bitmap.Size);",
    `$bitmap.Save('${diagnosticScreenshotPath.replaceAll("'", "''")}',[System.Drawing.Imaging.ImageFormat]::Png);`,
    "$graphics.Dispose();",
    "$bitmap.Dispose();",
    "[Win32]::SetWindowPos($proc.MainWindowHandle,$hwndNoTopMost,0,0,0,0,$swpNoMove -bor $swpNoSize) | Out-Null;",
  ].join("\n");

  const result = await new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", command], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ code, output });
    });
  });

  if (result.code !== 0) {
    logBlock("Screenshot capture failed output:", result.output);
    return {
      ok: false,
      output: `Screenshot capture failed:\n${result.output}`,
    };
  }

  logLine(`Screenshot capture succeeded: ${diagnosticScreenshotPath}`);
  return {
    ok: true,
    output: `Developer Tools diagnostic window screenshot captured: ${diagnosticScreenshotPath}`,
  };
}

async function focusAndClickMiniProgramWindow() {
  if (process.platform !== "win32") {
    return;
  }

  logLine("Focusing WeChat Developer Tools window and clicking Mini Program surface.");
  const command = [
    "$signature=@'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public class Win32Focus {",
    '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
    '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);',
    '  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);',
    '  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);',
    '  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);',
    '  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);',
    "}",
    "public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }",
    "'@;",
    "Add-Type $signature;",
    "Add-Type -AssemblyName System.Windows.Forms;",
    "$proc=Get-Process wechatdevtools -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1;",
    "if (-not $proc) { throw 'WeChat Developer Tools window was not found.'; }",
    "$shell=New-Object -ComObject WScript.Shell;",
    "$shell.AppActivate($proc.Id) | Out-Null;",
    "$screen=[System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea;",
    "[Win32Focus]::ShowWindowAsync($proc.MainWindowHandle,9) | Out-Null;",
    "[Win32Focus]::SetWindowPos($proc.MainWindowHandle,[IntPtr]::new(-1),0,0,$screen.Width,$screen.Height,0x0040) | Out-Null;",
    "[Win32Focus]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null;",
    "Start-Sleep -Milliseconds 1200;",
    "$rect=New-Object RECT;",
    "[Win32Focus]::GetWindowRect($proc.MainWindowHandle,[ref]$rect) | Out-Null;",
    "$width=$rect.Right-$rect.Left;",
    "$height=$rect.Bottom-$rect.Top;",
    "if ($width -le 0 -or $height -le 0) { throw 'WeChat Developer Tools window bounds were invalid.'; }",
    "$clickX=[Math]::Min($rect.Right - 120, $rect.Left + [Math]::Floor($width * 0.88));",
    "$clickY=$rect.Top + [Math]::Floor($height * 0.50);",
    "[Win32Focus]::SetCursorPos($clickX,$clickY) | Out-Null;",
    "Start-Sleep -Milliseconds 200;",
    "$mouseLeftDown=0x0002;",
    "$mouseLeftUp=0x0004;",
    "[Win32Focus]::mouse_event($mouseLeftDown,0,0,0,[UIntPtr]::Zero);",
    "Start-Sleep -Milliseconds 80;",
    "[Win32Focus]::mouse_event($mouseLeftUp,0,0,0,[UIntPtr]::Zero);",
    'Write-Output "clicked $clickX,$clickY";',
    "Start-Sleep -Milliseconds 1200;",
    "[Win32Focus]::SetWindowPos($proc.MainWindowHandle,[IntPtr]::new(-2),0,0,$screen.Width,$screen.Height,0x0040) | Out-Null;",
  ].join("\n");

  const result = await new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", command], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ code, output });
    });
  });

  if (result.code !== 0) {
    logBlock("Failed to focus/click WeChat Developer Tools window:", result.output);
  } else {
    logBlock("WeChat Developer Tools window focused and clicked.", result.output);
  }
}

async function captureMiniProgramScreenshot(miniProgram) {
  logLine("Mini Program screenshot capture start.");
  logLine("Mini Program screenshot protocol call start.");
  const base64Screenshot = await miniProgram.screenshot();
  logLine(
    `Mini Program screenshot protocol call returned ${base64Screenshot?.length ?? 0} base64 chars.`,
  );

  if (!base64Screenshot) {
    return {
      ok: false,
      output: "Mini Program screenshot capture failed: DevTools returned no screenshot data.",
    };
  }

  fs.writeFileSync(screenshotPath, base64Screenshot, "base64");

  if (!fs.existsSync(screenshotPath) || fs.statSync(screenshotPath).size === 0) {
    return {
      ok: false,
      output: "Mini Program screenshot capture failed: screenshot file was not created.",
    };
  }

  fs.copyFileSync(screenshotPath, appScreenshotPath);
  logLine(`Mini Program screenshot capture succeeded: ${screenshotPath}`);
  return {
    ok: true,
    output: `Mini Program home screenshot captured: ${screenshotPath}`,
  };
}

async function assertHomeMarker(cliPath) {
  let miniProgram;

  try {
    const automatorPort = await getFreePort();
    logLine(`Allocated automator port: ${automatorPort}`);
    const auto = await runCli(cliPath, "auto", [
      "--auto-port",
      String(automatorPort),
      "--trust-project",
    ]);

    if (auto.code !== 0 && !auto.output.includes(`Port ${automatorPort} is in use`)) {
      return {
        passed: false,
        screenshotOk: false,
        output: `Automator setup failed while enabling automation.\n${auto.output}`,
      };
    }

    logLine("Automator connecting.");
    miniProgram = await withTimeout(connectAutomator(automatorPort), 20_000, "Automator connect");

    logLine("Automator relaunching /pages/smoke/index.");
    const page = await withTimeout(
      miniProgram.reLaunch("/pages/smoke/index"),
      20_000,
      "Automator relaunch",
    );
    logLine("Automator waiting for page readiness.");
    await withTimeout(page.waitFor(1000), 5_000, "Automator page wait");

    logLine("Automator querying #e2e-home-marker.");
    const marker = await page.$("#e2e-home-marker");
    if (!marker) {
      return {
        passed: false,
        screenshotOk: false,
        output: "Automator assertion failed: #e2e-home-marker was not found.",
      };
    }

    const text = await marker.text();
    const expected = "E2E_HOME_READY";
    logLine(`Automator marker text: ${text}`);

    if (text !== expected) {
      return {
        passed: false,
        screenshotOk: false,
        output: `Automator assertion failed: expected marker text "${expected}", got "${text}".`,
      };
    }

    logLine("Automator tapping marker before native screenshot.");
    await withTimeout(marker.tap(), 10_000, "Automator marker tap");
    await focusAndClickMiniProgramWindow();

    const miniProgramScreenshot = await withTimeout(
      captureMiniProgramScreenshot(miniProgram),
      180_000,
      "Mini Program screenshot",
    );
    return {
      passed: miniProgramScreenshot.ok,
      screenshotOk: miniProgramScreenshot.ok,
      output: `Automator assertion passed: #e2e-home-marker text is "${expected}".\n${miniProgramScreenshot.output}`,
    };
  } catch (error) {
    logLine(`Automator flow failed: ${String(error)}`);
    const devToolsScreenshot = await withTimeout(
      captureDevToolsWindowScreenshot(),
      30_000,
      "Developer Tools screenshot after failure",
    ).catch((screenshotError) => ({
      ok: false,
      output: `Screenshot capture after failure also failed: ${String(screenshotError)}`,
    }));
    return {
      passed: false,
      screenshotOk: devToolsScreenshot.ok,
      output: `Automator assertion failed before marker check.\n${devToolsScreenshot.output}\n${String(error)}`,
    };
  } finally {
    if (miniProgram) {
      logLine("Automator closing miniProgram session.");
      await withTimeout(miniProgram.close(), 10_000, "Automator close").catch(() => {});
      logLine("Automator close completed or timed out.");
    }
  }
}

fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(screenshotDir, { recursive: true });
fs.mkdirSync(appArtifactDir, { recursive: true });

for (const artifactPath of [
  screenshotPath,
  diagnosticScreenshotPath,
  appScreenshotPath,
  logPath,
  reportPath,
]) {
  if (fs.existsSync(artifactPath)) {
    fs.rmSync(artifactPath, { force: true });
  }
}

realtimeLogEnabled = true;
const startedAt = new Date().toISOString();
logLine(`E2E started: ${startedAt}`);
logLine(`Project: ${projectPath}`);

const cliPath = findCliPath();

if (!cliPath) {
  const message =
    "WeChat Developer Tools CLI was not found. Set WECHAT_DEVTOOLS_CLI to cli.bat/cli path.";
  if (required) {
    console.error(message);
    process.exit(1);
  }

  console.warn(`${message} Skipping E2E case.`);
  process.exit(0);
}

logLine(`CLI: ${cliPath}`);
logLine("Step clean-start begin.");
const cleanStart = await cleanStartDevTools(cliPath);
logLine("Step clean-start end.");
logLine("Step prepare-miniprogram-npm begin.");
const build = await prepareMiniProgramNpm();
logLine(`Step prepare-miniprogram-npm end: exit=${build.code}.`);
logLine("Step automator begin.");
const automatorResult =
  build.code === 0
    ? await assertHomeMarker(cliPath)
    : {
        passed: false,
        screenshotOk: false,
        output: "Skipped automator assertion because setup failed.",
      };
logLine(
  `Step automator end: passed=${automatorResult.passed}, screenshotOk=${automatorResult.screenshotOk}.`,
);

await wait(500);

const passed =
  build.code === 0 &&
  automatorResult.passed &&
  automatorResult.screenshotOk &&
  fs.existsSync(screenshotPath);
const log = [
  `Started: ${startedAt}`,
  `Project: ${projectPath}`,
  `CLI: ${cliPath}`,
  "",
  "## clean-start",
  cleanStart,
  "",
  "## prepare-miniprogram-npm",
  build.output,
  "",
  "## automator",
  automatorResult.output,
].join("\n");

fs.writeFileSync(logPath, log);

const logLines = automatorResult.output.split(/\r?\n/).filter(Boolean).slice(0, 8);

const serializedLogLines = logLines.map((line) => `    ${tsStringLiteral(line)},`).join("\n");
const appReportData = `export const e2eReport = {
  reportDate: ${JSON.stringify(startedAt)},
  reportScope: "当前唯一真实 E2E 用例：微信开发者工具加载仓库根目录并显示小程序首页。",
  screenshotPath: ${JSON.stringify(fs.existsSync(appScreenshotPath) ? "/e2e-artifacts/devtools-home.png" : "")},
  logPath: "tmp/e2e/reports/devtools-load.log",
  cases: [
    {
      id: "E2E-001",
      title: "微信开发者工具成功加载小程序首页",
      status: ${JSON.stringify(passed ? "通过" : "失败")},
      covers: "微信开发者工具 CLI 自动化启动、首页 marker 断言、APP 首页截图生成。",
      setup: "本机已安装微信开发者工具，仓库根目录存在 project.config.json。",
      action: "运行 e2e，调用微信开发者工具自动化接口并断言首页 marker。",
      expected: "automator 能读取 #e2e-home-marker，且文本严格等于 E2E_HOME_READY。",
      evidence: "截图和完整日志保存在 tmp/e2e/。",
    },
  ],
  logLines: [
${serializedLogLines}
  ],
};
`;

fs.writeFileSync(appReportDataPath, appReportData);

const report = `# E2E-001 WeChat Developer Tools Loads Home Page

## Status

${passed ? "Passed" : "Failed"}

## Purpose

Verify that WeChat Developer Tools can load the Mini Program project from the repository root and display the app home page.

## Evidence

- Screenshot: \`${path.relative(repoRoot, screenshotPath)}\`
- App-visible screenshot copy: \`${path.relative(repoRoot, appScreenshotPath)}\`
- Log: \`${path.relative(repoRoot, logPath)}\`

## Key Log

\`\`\`text
${log.slice(0, 4000)}
\`\`\`
`;

fs.writeFileSync(reportPath, report);
process.stdout.write(log);

if (!passed) {
  process.exit(1);
}

console.log(`\nE2E report written: ${reportPath}`);
