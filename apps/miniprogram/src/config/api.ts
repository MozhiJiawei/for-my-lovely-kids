export type ApiBackendKey = "local" | "public";

export const apiBackendProfiles: Array<{
  key: ApiBackendKey;
  label: string;
  description: string;
  baseUrl: string;
}> = [
  {
    key: "public",
    label: "公网服务器",
    description: "云服务器 39.105.78.135",
    baseUrl: "http://39.105.78.135:3000",
  },
  {
    key: "local",
    label: "本机服务",
    description: "开发机 127.0.0.1",
    baseUrl: "http://127.0.0.1:3000",
  },
];

export const prototypeApiTokens = {
  familyToken: "red-flower-family-test-2026",
  parentToken: "red-flower-parent-test-2026",
};

export function getDefaultApiBaseUrl(): string {
  return getApiBaseUrl("public");
}

export function getApiBaseUrl(key: ApiBackendKey): string {
  return (
    apiBackendProfiles.find((profile) => profile.key === key)?.baseUrl ?? getDefaultApiBaseUrl()
  );
}

export function isLocalApiBaseUrl(baseUrl: string): boolean {
  const trimmed = baseUrl.trim().toLowerCase();
  const withoutProtocol = trimmed.replace(/^[a-z][a-z\d+.-]*:\/\//, "");
  const hostAndPort = withoutProtocol.split(/[/?#]/)[0] ?? "";
  const host =
    hostAndPort.startsWith("[") && hostAndPort.includes("]")
      ? hostAndPort.slice(1, hostAndPort.indexOf("]"))
      : hostAndPort.split(":")[0];

  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function isPrototypeToolsVisible(): boolean {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion !== "release";
  } catch {
    return true;
  }
}
