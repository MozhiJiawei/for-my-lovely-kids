export type ApiBackendKey = "local" | "public";

export type ApiBackendProfile = {
  key: ApiBackendKey;
  label: string;
  description: string;
  baseUrl: string;
};

const apiBackendKeyStorageKey = "redFlowerGarden.apiBackendKey";
const apiBaseUrlStorageKey = "redFlowerGarden.apiBaseUrl";

export const apiBackendProfiles: ApiBackendProfile[] = [
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

export type PrototypeApiConfig = {
  baseUrl: string;
  familyToken: string;
  parentToken: string;
};

export function getDefaultApiBaseUrl(): string {
  return getConfiguredApiBaseUrl();
}

export function getApiBaseUrl(key: ApiBackendKey): string {
  return (
    apiBackendProfiles.find((profile) => profile.key === key)?.baseUrl ??
    apiBackendProfiles.find((profile) => profile.key === "public")!.baseUrl
  );
}

export function getConfiguredApiBackendKey(): ApiBackendKey {
  const savedBackendKey = readStorageString(apiBackendKeyStorageKey);

  return isApiBackendKey(savedBackendKey) ? savedBackendKey : "public";
}

export function getConfiguredApiBaseUrl(): string {
  return (
    readStorageString(apiBaseUrlStorageKey)?.trim() || getApiBaseUrl(getConfiguredApiBackendKey())
  );
}

export function getPrototypeApiConfig(): PrototypeApiConfig {
  return {
    baseUrl: getConfiguredApiBaseUrl(),
    familyToken: prototypeApiTokens.familyToken,
    parentToken: prototypeApiTokens.parentToken,
  };
}

export function saveConfiguredApiBackend(key: ApiBackendKey, baseUrl = getApiBaseUrl(key)): void {
  writeStorageString(apiBackendKeyStorageKey, key);
  writeStorageString(apiBaseUrlStorageKey, baseUrl.trim() || getApiBaseUrl(key));
}

export function inferApiBackendKey(baseUrl: string): ApiBackendKey {
  const normalized = normalizeApiBaseUrl(baseUrl);
  const profile = apiBackendProfiles.find(
    (candidate) => normalizeApiBaseUrl(candidate.baseUrl) === normalized,
  );

  if (profile) {
    return profile.key;
  }

  return isLocalApiBaseUrl(baseUrl) ? "local" : "public";
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

function isApiBackendKey(value: string | undefined): value is ApiBackendKey {
  return value === "local" || value === "public";
}

function normalizeApiBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "").toLowerCase();
}

function readStorageString(key: string): string | undefined {
  try {
    if (typeof wx === "undefined") {
      return undefined;
    }

    const value = wx.getStorageSync(key) as unknown;

    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function writeStorageString(key: string, value: string): void {
  try {
    if (typeof wx === "undefined") {
      return;
    }

    wx.setStorageSync(key, value);
  } catch {
    // Local storage is a convenience for developer switching; requests can still use in-memory data.
  }
}
