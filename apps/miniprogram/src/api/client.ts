export type TaskSubmissionState = {
  id: string;
  taskId: string;
  titleSnapshot: string;
  flowerValueSnapshot: number;
  status: "pending" | "confirmed";
  submittedAt: string;
  confirmedAt: string | null;
};

export type TaskState = {
  id: string;
  title: string;
  flowerValue: number;
  kind: "repeating" | "one_time";
  status: "active" | "archived" | "test";
  createdAt: string;
  updatedAt: string;
};

export type WishState = {
  id: string;
  title: string;
  flowerCost: number;
  kind: "repeating" | "one_time";
  pinned: boolean;
  description: string;
  imageUrl: string;
  linkUrl: string;
  status: "active" | "archived" | "test";
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type WishRedemptionState = {
  id: string;
  wishId: string;
  titleSnapshot: string;
  flowerCostSnapshot: number;
  status: "pending" | "approved";
  requestedAt: string;
  approvedAt: string | null;
};

export type MemorialDecorationState = {
  id: string;
  wishRedemptionId: string;
  kind: "wish_memorial";
};

export type RedFlowerLedgerLine = {
  id: string;
  type: "task_confirmed" | "wish_approved";
  deltaAvailable: number;
  deltaCumulative: number;
  flowerKind: "coral" | "sunny" | "berry" | "sky" | null;
  occurredAt: string;
  sourceId: string;
};

export type PrototypeState = {
  taskBook: {
    tasks: TaskState[];
    submissions: TaskSubmissionState[];
  };
  wishBook: {
    wishes: WishState[];
    redemptions: WishRedemptionState[];
  };
  redFlowers: {
    balance: {
      available: number;
      cumulative: number;
    };
    ledger: RedFlowerLedgerLine[];
  };
  garden: {
    memorialDecorations: MemorialDecorationState[];
  };
};

type ApiConfig = {
  baseUrl: string;
  familyToken: string;
  parentToken: string;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export type WishImageUploadPolicy = {
  url: string;
  objectKey: string;
  publicUrl: string;
  formData: Record<string, string>;
};

export class PrototypeApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export function loadState(config: ApiConfig): Promise<PrototypeState> {
  return request<PrototypeState>({
    config,
    path: "/api/state",
    method: "GET",
    tokenKind: "family",
  });
}

export function resetTestData(config: ApiConfig): Promise<PrototypeState> {
  if (!isLocalApiBaseUrl(config.baseUrl)) {
    return Promise.reject(new PrototypeApiError("现在不能重置小花园。", "LOCAL_RESET_ONLY"));
  }

  return request<PrototypeState>({
    config,
    path: "/__test/reset",
    method: "POST",
    tokenKind: "parent",
    data: {},
  });
}

export function createTask(
  config: ApiConfig,
  input: {
    title: string;
    flowerValue: number;
    kind: "repeating" | "one_time";
  },
): Promise<{ state: PrototypeState }> {
  return request<{ state: PrototypeState }>({
    config,
    path: "/api/parent/tasks",
    method: "POST",
    tokenKind: "parent",
    data: input,
  });
}

export function updateTask(
  config: ApiConfig,
  taskId: string,
  input: {
    title: string;
    flowerValue: number;
    kind: "repeating" | "one_time";
  },
): Promise<{ state: PrototypeState }> {
  return request<{ state: PrototypeState }>({
    config,
    path: `/api/parent/tasks/${taskId}`,
    method: "POST",
    tokenKind: "parent",
    data: input,
  });
}

export function deleteTask(config: ApiConfig, taskId: string): Promise<{ state: PrototypeState }> {
  return request<{ state: PrototypeState }>({
    config,
    path: `/api/parent/tasks/${taskId}/delete`,
    method: "POST",
    tokenKind: "parent",
    data: {},
  });
}

export function createWish(
  config: ApiConfig,
  input: {
    title: string;
    flowerCost: number;
    kind: "repeating" | "one_time";
    pinned: boolean;
    description?: string;
    imageUrl?: string;
    linkUrl?: string;
  },
): Promise<{ state: PrototypeState }> {
  return request<{ state: PrototypeState }>({
    config,
    path: "/api/parent/wishes",
    method: "POST",
    tokenKind: "parent",
    data: input,
  });
}

export function updateWish(
  config: ApiConfig,
  wishId: string,
  input: {
    title: string;
    flowerCost: number;
    kind: "repeating" | "one_time";
    pinned: boolean;
    description?: string;
    imageUrl?: string;
    linkUrl?: string;
  },
): Promise<{ state: PrototypeState }> {
  return request<{ state: PrototypeState }>({
    config,
    path: `/api/parent/wishes/${wishId}`,
    method: "POST",
    tokenKind: "parent",
    data: input,
  });
}

export function createWishImageUploadPolicy(
  config: ApiConfig,
  input: { fileName: string; contentType: string },
): Promise<WishImageUploadPolicy> {
  return request<WishImageUploadPolicy>({
    config,
    path: "/api/parent/wish-image-uploads",
    method: "POST",
    tokenKind: "parent",
    data: input,
  });
}

export function submitTask(
  config: ApiConfig,
  taskId: string,
): Promise<{ submission: TaskSubmissionState; state: PrototypeState }> {
  return request<{ submission: TaskSubmissionState; state: PrototypeState }>({
    config,
    path: "/api/child/task-submissions",
    method: "POST",
    tokenKind: "family",
    data: { taskId },
  });
}

export function confirmTask(config: ApiConfig, submissionId: string): Promise<PrototypeState> {
  return confirmTasks(config, [submissionId]);
}

export function confirmTasks(config: ApiConfig, submissionIds: string[]): Promise<PrototypeState> {
  return request<PrototypeState>({
    config,
    path: "/api/parent/task-confirmations",
    method: "POST",
    tokenKind: "parent",
    data: { submissionIds },
  });
}

export function backfillHabitCheckin(
  config: ApiConfig,
  input: { taskId: string; completionDate: string },
): Promise<{ submission: TaskSubmissionState; state: PrototypeState }> {
  return request<{ submission: TaskSubmissionState; state: PrototypeState }>({
    config,
    path: "/api/parent/habit-checkins/backfill",
    method: "POST",
    tokenKind: "parent",
    data: input,
  });
}

export function backfillHabitCheckins(
  config: ApiConfig,
  input: { taskIds: string[]; completionDates: string[] },
): Promise<{ submissions: TaskSubmissionState[]; state: PrototypeState }> {
  return request<{ submissions: TaskSubmissionState[]; state: PrototypeState }>({
    config,
    path: "/api/parent/habit-checkins/backfill-batch",
    method: "POST",
    tokenKind: "parent",
    data: input,
  });
}

export function requestWish(config: ApiConfig, wishId: string): Promise<{ state: PrototypeState }> {
  return request<{ state: PrototypeState }>({
    config,
    path: "/api/child/wish-redemptions",
    method: "POST",
    tokenKind: "family",
    data: { wishId },
  });
}

export function redeemWish(
  config: ApiConfig,
  wishId: string,
): Promise<{ redemption: WishRedemptionState; state: PrototypeState }> {
  return request<{ redemption: WishRedemptionState; state: PrototypeState }>({
    config,
    path: "/api/child/wish-redemptions/redeem",
    method: "POST",
    tokenKind: "family",
    data: { wishId },
  });
}

export function approveWish(
  config: ApiConfig,
  redemptionId: string,
): Promise<{ state: PrototypeState }> {
  return request<{ state: PrototypeState }>({
    config,
    path: `/api/parent/wish-redemptions/${redemptionId}/approve`,
    method: "POST",
    tokenKind: "parent",
  });
}

export function updateHistoryTaskSubmission(
  config: ApiConfig,
  submissionId: string,
  input: { flowerValue: number },
): Promise<{ state: PrototypeState }> {
  return request<{ state: PrototypeState }>({
    config,
    path: `/api/parent/history/task-submissions/${submissionId}`,
    method: "POST",
    tokenKind: "parent",
    data: input,
  });
}

export function deleteHistoryTaskSubmission(
  config: ApiConfig,
  submissionId: string,
): Promise<{ state: PrototypeState }> {
  return request<{ state: PrototypeState }>({
    config,
    path: `/api/parent/history/task-submissions/${submissionId}/delete`,
    method: "POST",
    tokenKind: "parent",
    data: {},
  });
}

export function updateHistoryWishRedemption(
  config: ApiConfig,
  redemptionId: string,
  input: { flowerCost: number },
): Promise<{ state: PrototypeState }> {
  return request<{ state: PrototypeState }>({
    config,
    path: `/api/parent/history/wish-redemptions/${redemptionId}`,
    method: "POST",
    tokenKind: "parent",
    data: input,
  });
}

export function deleteHistoryWishRedemption(
  config: ApiConfig,
  redemptionId: string,
): Promise<{ state: PrototypeState }> {
  return request<{ state: PrototypeState }>({
    config,
    path: `/api/parent/history/wish-redemptions/${redemptionId}/delete`,
    method: "POST",
    tokenKind: "parent",
    data: {},
  });
}

function request<T>(input: {
  config: ApiConfig;
  path: string;
  method: "GET" | "POST";
  tokenKind: "family" | "parent";
  data?: unknown;
}): Promise<T> {
  return requestWithBaseUrls(buildCandidateBaseUrls(input.config.baseUrl), input, 0);
}

function requestWithBaseUrls<T>(
  baseUrls: string[],
  input: {
    config: ApiConfig;
    path: string;
    method: "GET" | "POST";
    tokenKind: "family" | "parent";
    data?: unknown;
  },
  index: number,
): Promise<T> {
  const baseUrl = baseUrls[index] ?? input.config.baseUrl;

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}${input.path}`,
      method: input.method,
      data: input.data as WechatMiniprogram.IAnyObject | string | ArrayBuffer,
      timeout: 8000,
      header: {
        "content-type": "application/json",
        [input.tokenKind === "family" ? "x-family-token" : "x-parent-token"]:
          input.tokenKind === "family" ? input.config.familyToken : input.config.parentToken,
      },
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const body = response.data as ApiErrorBody;
          reject(
            new PrototypeApiError(
              body.error?.message ?? "请求失败，请稍后再试。",
              body.error?.code ?? `HTTP_${response.statusCode}`,
            ),
          );
          return;
        }

        resolve(response.data as T);
      },
      fail() {
        if (index + 1 < baseUrls.length) {
          requestWithBaseUrls<T>(baseUrls, input, index + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        reject(new PrototypeApiError("暂时连不上小花园，请稍后再试。", "NETWORK_ERROR"));
      },
    });
  });
}

function buildCandidateBaseUrls(baseUrl: string): string[] {
  const trimmed = baseUrl.replace(/\/$/, "");
  const urls = [trimmed];

  if (trimmed.includes("127.0.0.1")) {
    urls.push(trimmed.replace("127.0.0.1", "localhost"));
  }

  if (trimmed.includes("localhost")) {
    urls.push(trimmed.replace("localhost", "127.0.0.1"));
  }

  if (!trimmed.includes("localhost") && !trimmed.includes("127.0.0.1")) {
    urls.push("http://localhost:3000", "http://127.0.0.1:3000");
  }

  return Array.from(new Set(urls));
}
import { isLocalApiBaseUrl } from "../config/api";
