export const e2eReport = {
  reportDate: "2026-04-25T11:05:58.107Z",
  reportScope: "当前唯一真实 E2E 用例：微信开发者工具加载仓库根目录并显示小程序首页。",
  screenshotPath: "/e2e-artifacts/devtools-home.png",
  logPath: "tmp/e2e/reports/devtools-load.log",
  cases: [
    {
      id: "E2E-001",
      title: "微信开发者工具成功加载小程序首页",
      status: "通过",
      covers: "微信开发者工具 CLI 自动化启动、首页 marker 断言、APP 首页截图生成。",
      setup: "本机已安装微信开发者工具，仓库根目录存在 project.config.json。",
      action: "运行 e2e，调用微信开发者工具自动化接口并断言首页 marker。",
      expected: "automator 能读取 #e2e-home-marker，且文本严格等于 E2E_HOME_READY。",
      evidence: "截图和完整日志保存在 tmp/e2e/。",
    },
  ],
  logLines: [
    'Automator assertion passed: #e2e-home-marker text is "E2E_HOME_READY".',
    "Mini Program home screenshot captured: D:\\Agent Repo\\for-my-lovely-kids\\tmp\\e2e\\screenshots\\devtools-home.png",
  ],
};
