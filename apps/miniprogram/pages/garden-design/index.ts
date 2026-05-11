import { loadState, resetTestData, submitTask, type PrototypeState } from "../../src/api/client";
import {
  getConfiguredApiBaseUrl,
  getPrototypeApiConfig,
  isPrototypeToolsVisible,
} from "../../src/config/api";
import {
  hasParentPasscode,
  isParentControlUnlocked,
  isValidParentPasscode,
  saveParentPasscode,
  validateParentPasscode,
} from "../../src/parent-control";

type TaskState = "ready" | "pending" | "done";
type TaskTabId = "habits" | "activeGoals";
type FlowerKind = "coral" | "sunny" | "berry" | "sky";
type ParentControlMode = "setup" | "confirmSetup" | "unlock" | "changeUnlock";
type ParentControlPurpose = "confirmTask" | "changePasscode";

type FlowerSlot = {
  slot: number;
  kind: FlowerKind;
};

type TaskPreview = {
  id: string;
  title: string;
  flowerValue: number;
  kind: "repeating" | "one_time";
  status: "active" | "test" | "archived";
  state: TaskState;
  actionText: string;
  stateText: string;
  completedAt: string | null;
};

type WishPreview = {
  id: string;
  title: string;
  cost: number;
  progress: number;
  enough: boolean;
  kind: "repeating" | "one_time";
  pinned: boolean;
};

type GardenDesignData = {
  tasks: TaskPreview[];
  visibleTasks: TaskPreview[];
  taskTabs: Array<{
    id: TaskTabId;
    label: string;
    active: boolean;
  }>;
  activeTaskTab: TaskTabId;
  wishes: WishPreview[];
  todayFlowers: number;
  availableFlowers: number;
  cumulativeFlowers: number;
  flowerSlots: FlowerSlot[];
  seedSlots: number[];
  dailyLine: string;
  showPrototypeTools: boolean;
  parentControlOpen: boolean;
  parentControlMode: ParentControlMode;
  parentControlTitle: string;
  passcodeDigits: string;
  passcodeError: string;
  passcodeKeys: string[];
  passcodeSlots: number[];
};

const maxVisibleFlowers = 10;
const flowerKinds: FlowerKind[] = ["coral", "sunny", "berry", "sky"];
const passcodeKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "cancel", "0", "delete"];
const passcodeSlots = [0, 1, 2, 3, 4, 5];
const pendingTaskIdsStoragePrefix = "redFlowerGarden.pendingTaskIds";
const taskTabLabels: Record<TaskTabId, string> = {
  habits: "我的好习惯",
  activeGoals: "我的小目标",
};

function taskCopy(state: TaskState): Pick<TaskPreview, "actionText" | "stateText"> {
  if (state === "done") {
    return {
      actionText: "开花啦",
      stateText: "已经开花",
    };
  }

  if (state === "pending") {
    return {
      actionText: "确认",
      stateText: "种子等家长确认",
    };
  }

  return {
    actionText: "完成啦",
    stateText: "今天的小任务",
  };
}

function todayKey(): string {
  return getBusinessDayKey(new Date().toISOString());
}

function isToday(value: string | null): boolean {
  if (!value) {
    return false;
  }

  return getBusinessDayKey(value) === todayKey();
}

function todayEarnedFlowers(state: PrototypeState): number {
  return state.redFlowers.ledger
    .filter(
      (entry) =>
        entry.type === "task_confirmed" && getBusinessDayKey(entry.occurredAt) === todayKey(),
    )
    .reduce((sum, entry) => sum + entry.deltaCumulative, 0);
}

function getBusinessDayKey(value: string): string {
  return new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function choosePersistedFallbackFlowerKind(seed: string): FlowerKind {
  let hash = 0;

  for (const char of seed) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x45d9f3b);
  }

  return flowerKinds[Math.abs(hash) % flowerKinds.length]!;
}

function flowerSlotsFromState(state: PrototypeState): FlowerSlot[] {
  const flowers: FlowerSlot[] = [];

  for (const entry of state.redFlowers.ledger) {
    if (
      entry.type !== "task_confirmed" ||
      entry.deltaCumulative <= 0 ||
      getBusinessDayKey(entry.occurredAt) !== todayKey()
    ) {
      continue;
    }

    const kind = entry.flowerKind ?? choosePersistedFallbackFlowerKind(entry.id);

    for (let index = 0; index < entry.deltaCumulative; index += 1) {
      if (flowers.length >= maxVisibleFlowers) {
        return flowers;
      }

      flowers.push({
        slot: flowers.length,
        kind,
      });
    }
  }

  return flowers;
}

function flowerSlotsFromTodayFlowers(todayFlowers: number): FlowerSlot[] {
  const count = Math.min(Math.max(todayFlowers, 0), maxVisibleFlowers);

  return Array.from({ length: count }, (_, slot) => ({
    slot,
    kind: flowerKinds[slot % flowerKinds.length]!,
  }));
}

function deriveTasks(state: PrototypeState, pendingTaskIds: Set<string>): TaskPreview[] {
  const confirmedSubmissionsByTaskId = new Map(
    state.taskBook.submissions
      .filter((submission) => submission.status === "confirmed")
      .map((submission) => [submission.taskId, submission]),
  );

  return state.taskBook.tasks
    .filter((task) => task.status === "active" || task.status === "test")
    .map((task) => {
      const confirmedSubmission = confirmedSubmissionsByTaskId.get(task.id);
      const taskState: TaskState =
        task.kind === "repeating"
          ? isToday(confirmedSubmission?.confirmedAt ?? null)
            ? "done"
            : pendingTaskIds.has(task.id)
              ? "pending"
              : "ready"
          : confirmedSubmission
            ? "done"
            : pendingTaskIds.has(task.id)
              ? "pending"
              : "ready";

      return {
        id: task.id,
        title: task.title.replace(/^\[测试\]\s*/, ""),
        flowerValue: task.flowerValue,
        kind: task.kind,
        status: task.status,
        state: taskState,
        completedAt: confirmedSubmission?.confirmedAt ?? null,
        ...taskCopy(taskState),
      };
    });
}

function taskTabs(activeTaskTab: TaskTabId): GardenDesignData["taskTabs"] {
  return (Object.keys(taskTabLabels) as TaskTabId[]).map((id) => ({
    id,
    label: taskTabLabels[id],
    active: id === activeTaskTab,
  }));
}

function visibleTasks(tasks: TaskPreview[], activeTaskTab: TaskTabId): TaskPreview[] {
  if (activeTaskTab === "habits") {
    return tasks.filter(
      (task) => task.kind === "repeating" && (task.status === "active" || task.status === "test"),
    );
  }

  if (activeTaskTab === "activeGoals") {
    return tasks.filter(
      (task) => task.kind === "one_time" && (task.status === "active" || task.status === "test"),
    );
  }

  return [];
}

function deriveWishes(state: PrototypeState): WishPreview[] {
  const availableFlowers = state.redFlowers.balance.available;
  const activeWishes = state.wishBook.wishes.filter(
    (wish) => wish.status === "active" || wish.status === "test",
  );
  const pinnedWishes = activeWishes.filter((wish) => wish.pinned);
  const unpinnedWishes = sortWishesForHome(activeWishes.filter((wish) => !wish.pinned));
  const homeWishes = [...pinnedWishes, ...unpinnedWishes];

  return homeWishes.slice(0, 3).map((wish) => {
    const progress = Math.min(Math.floor((availableFlowers / wish.flowerCost) * 100), 100);

    return {
      id: wish.id,
      title: wish.title.replace(/^\[测试\]\s*/, ""),
      cost: wish.flowerCost,
      progress,
      enough: availableFlowers >= wish.flowerCost,
      kind: wish.kind,
      pinned: wish.pinned,
    };
  });
}

function sortWishesForHome(
  wishes: PrototypeState["wishBook"]["wishes"],
): PrototypeState["wishBook"]["wishes"] {
  return [...wishes].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "one_time" ? -1 : 1;
    }

    if (left.flowerCost !== right.flowerCost) {
      return right.flowerCost - left.flowerCost;
    }

    return left.sortOrder - right.sortOrder;
  });
}

function deriveDataFromState(
  state: PrototypeState,
  activeTaskTab: TaskTabId,
  pendingTaskIds: Set<string>,
): Partial<GardenDesignData> {
  const cumulativeFlowers = state.redFlowers.balance.cumulative;
  const availableFlowers = state.redFlowers.balance.available;
  const todayFlowers = todayEarnedFlowers(state);
  const tasks = deriveTasks(state, pendingTaskIds);
  const wishes = deriveWishes(state);
  const pendingSeedCount = tasks
    .filter((task) => task.state === "pending")
    .reduce((sum, task) => sum + task.flowerValue, 0);
  const flowerSlots =
    state.redFlowers.ledger.length > 0
      ? flowerSlotsFromState(state)
      : flowerSlotsFromTodayFlowers(todayFlowers);

  return {
    tasks,
    visibleTasks: visibleTasks(tasks, activeTaskTab),
    taskTabs: taskTabs(activeTaskTab),
    wishes,
    todayFlowers,
    availableFlowers,
    cumulativeFlowers,
    flowerSlots,
    seedSlots: Array.from(
      { length: Math.min(flowerSlots.length + pendingSeedCount, maxVisibleFlowers) },
      (_, index) => index,
    ),
    dailyLine:
      pendingSeedCount > 0
        ? `${pendingSeedCount} 颗小种子在等家长确认。`
        : todayFlowers > 0
          ? `今天已经开出 ${Math.min(todayFlowers, maxVisibleFlowers)} 朵花啦。`
          : "今天也一起把小花园照亮吧。",
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}

function pendingTaskIdsStorageKey(): string {
  return `${pendingTaskIdsStoragePrefix}.${normalizeStorageKey(getConfiguredApiBaseUrl())}.${todayKey()}`;
}

function normalizeStorageKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

function loadPendingTaskIds(): Set<string> {
  try {
    const value = wx.getStorageSync(pendingTaskIdsStorageKey()) as unknown;

    return new Set(Array.isArray(value) ? value.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function savePendingTaskIds(taskIds: Set<string>): void {
  try {
    wx.setStorageSync(pendingTaskIdsStorageKey(), Array.from(taskIds));
  } catch {
    // Pending child completions are intentionally local-only and can be rebuilt by tapping again.
  }
}

function prunePendingTaskIds(state: PrototypeState, pendingTaskIds: Set<string>): Set<string> {
  const openTaskIds = new Set(
    deriveTasks(state, new Set())
      .filter((task) => task.state === "ready")
      .map((task) => task.id),
  );

  return new Set(Array.from(pendingTaskIds).filter((taskId) => openTaskIds.has(taskId)));
}

function buildParentControlTitle(mode: ParentControlMode): string {
  if (mode === "setup") {
    return "设置家长密码";
  }

  if (mode === "confirmSetup") {
    return "再输入一次";
  }

  if (mode === "changeUnlock") {
    return "验证家长密码";
  }

  return "家长确认";
}

const initialData: GardenDesignData = {
  tasks: [],
  visibleTasks: [],
  taskTabs: taskTabs("habits"),
  activeTaskTab: "habits",
  wishes: [],
  todayFlowers: 0,
  availableFlowers: 0,
  cumulativeFlowers: 0,
  flowerSlots: [],
  seedSlots: [],
  dailyLine: "今天也一起把小花园照亮吧。",
  showPrototypeTools: false,
  parentControlOpen: false,
  parentControlMode: "unlock",
  parentControlTitle: "家长确认",
  passcodeDigits: "",
  passcodeError: "",
  passcodeKeys,
  passcodeSlots,
};

let latestRefreshRequest = 0;
let latestState: PrototypeState | null = null;
let pendingConfirmTaskId = "";
let setupPasscodeDraft = "";
let parentControlPurpose: ParentControlPurpose = "confirmTask";

Page({
  data: initialData,

  onLoad() {
    wx.setNavigationBarTitle({
      title: "小红花花园",
    });
    this.setData({
      showPrototypeTools: isPrototypeToolsVisible(),
    });
  },

  onShow() {
    void this.refreshState();
  },

  async refreshState() {
    const requestId = latestRefreshRequest + 1;
    latestRefreshRequest = requestId;

    try {
      const state = await loadState(getPrototypeApiConfig());

      if (requestId !== latestRefreshRequest) {
        return;
      }

      const pendingTaskIds = prunePendingTaskIds(state, loadPendingTaskIds());
      savePendingTaskIds(pendingTaskIds);
      latestState = state;
      this.setData({
        ...deriveDataFromState(state, this.data.activeTaskTab, pendingTaskIds),
      });
    } catch (error) {
      if (requestId !== latestRefreshRequest) {
        return;
      }

      this.setData({
        dailyLine: `花园暂时连不上：${errorMessage(error)}`,
      });
    }
  },

  async resetGardenData() {
    try {
      const state = await resetTestData(getPrototypeApiConfig());
      const activeTaskTab: TaskTabId = "habits";
      const pendingTaskIds = new Set<string>();
      savePendingTaskIds(pendingTaskIds);
      latestState = state;

      this.setData({
        activeTaskTab,
        ...deriveDataFromState(state, activeTaskTab, pendingTaskIds),
        dailyLine: "小花园已经重置好啦。",
      });
    } catch (error) {
      this.setData({
        dailyLine: `重置没有成功：${errorMessage(error)}`,
      });
    }
  },

  openPrototypeTools() {
    if (!this.data.showPrototypeTools) {
      return;
    }

    wx.navigateTo({
      url: "/pages/prototype/index",
    });
  },

  openParentSettings() {
    parentControlPurpose = "changePasscode";
    pendingConfirmTaskId = "";
    setupPasscodeDraft = "";

    if (!hasParentPasscode() || isParentControlUnlocked()) {
      const parentControlMode: ParentControlMode = "setup";
      this.setData({
        parentControlOpen: true,
        parentControlMode,
        parentControlTitle: "设置新的家长密码",
        passcodeDigits: "",
        passcodeError: hasParentPasscode() ? "请输入新的 6 位家长密码。" : "请设置 6 位家长密码。",
      });
      return;
    }

    const parentControlMode: ParentControlMode = "changeUnlock";
    this.setData({
      parentControlOpen: true,
      parentControlMode,
      parentControlTitle: buildParentControlTitle(parentControlMode),
      passcodeDigits: "",
      passcodeError: "先输入当前家长密码。",
    });
  },

  selectTaskTab(event: WechatMiniprogram.TouchEvent) {
    const activeTaskTab = String(event.currentTarget.dataset.id) as TaskTabId;

    if (!(activeTaskTab in taskTabLabels)) {
      return;
    }

    this.setData({
      activeTaskTab,
      taskTabs: taskTabs(activeTaskTab),
      visibleTasks: visibleTasks(this.data.tasks, activeTaskTab),
    });
  },

  noop() {
    return;
  },

  completeTask(event: WechatMiniprogram.TouchEvent) {
    const taskId = String(event.currentTarget.dataset.id ?? "");
    const task = this.data.tasks.find((candidate) => candidate.id === taskId);

    if (!task || task.state !== "ready") {
      return;
    }

    this.markTaskPending(taskId);
  },

  undoTaskCompletion(event: WechatMiniprogram.TouchEvent) {
    const taskId = String(event.currentTarget.dataset.id ?? "");
    const task = this.data.tasks.find((candidate) => candidate.id === taskId);

    if (!task || task.state !== "pending") {
      return;
    }

    this.clearPendingTask(taskId, "已经撤销，这颗种子先收起来。");
  },

  confirmTaskCompletion(event: WechatMiniprogram.TouchEvent) {
    const taskId = String(event.currentTarget.dataset.id ?? "");
    const task = this.data.tasks.find((candidate) => candidate.id === taskId);

    if (!task || task.state !== "pending") {
      return;
    }

    this.requestParentConfirm(taskId);
  },

  markTaskPending(taskId: string) {
    if (!latestState) {
      this.setData({
        dailyLine: "花园还没读好，等一下再点完成啦。",
      });
      return;
    }

    const pendingTaskIds = loadPendingTaskIds();
    pendingTaskIds.add(taskId);
    savePendingTaskIds(pendingTaskIds);

    this.setData({
      ...deriveDataFromState(latestState, this.data.activeTaskTab, pendingTaskIds),
    });
  },

  clearPendingTask(taskId: string, dailyLine: string) {
    if (!latestState) {
      return;
    }

    const pendingTaskIds = loadPendingTaskIds();
    pendingTaskIds.delete(taskId);
    savePendingTaskIds(pendingTaskIds);

    this.setData({
      ...deriveDataFromState(latestState, this.data.activeTaskTab, pendingTaskIds),
      dailyLine,
    });
  },

  requestParentConfirm(taskId: string) {
    parentControlPurpose = "confirmTask";
    pendingConfirmTaskId = taskId;

    if (isParentControlUnlocked()) {
      void this.confirmPendingTask();
      return;
    }

    const parentControlMode: ParentControlMode = hasParentPasscode() ? "unlock" : "setup";
    setupPasscodeDraft = "";
    this.setData({
      parentControlOpen: true,
      parentControlMode,
      parentControlTitle: buildParentControlTitle(parentControlMode),
      passcodeDigits: "",
      passcodeError: parentControlMode === "setup" ? "首次确认前，请先设置 6 位家长密码。" : "",
    });
  },

  async confirmPendingTask() {
    const taskId = pendingConfirmTaskId;

    if (!taskId) {
      return;
    }

    try {
      const response = await submitTask(getPrototypeApiConfig(), taskId);
      const todayFlowers = todayEarnedFlowers(response.state);
      const activeTaskTab = this.data.activeTaskTab;
      const pendingTaskIds = loadPendingTaskIds();
      pendingTaskIds.delete(taskId);
      savePendingTaskIds(pendingTaskIds);
      latestState = response.state;
      pendingConfirmTaskId = "";

      this.setData({
        activeTaskTab,
        parentControlOpen: false,
        ...deriveDataFromState(response.state, activeTaskTab, pendingTaskIds),
        dailyLine: `开花啦！今天已经开出 ${Math.min(todayFlowers, maxVisibleFlowers)} 朵花。`,
      });
    } catch (error) {
      this.setData({
        dailyLine: `这朵花刚才没开成：${errorMessage(error)}`,
      });
    }
  },

  tapPasscodeKey(event: WechatMiniprogram.TouchEvent) {
    const key = String(event.currentTarget.dataset.key ?? "");

    if (key === "cancel") {
      this.closeParentControl();
      return;
    }

    if (key === "delete") {
      this.setData({
        passcodeDigits: this.data.passcodeDigits.slice(0, -1),
        passcodeError: "",
      });
      return;
    }

    if (!/^\d$/.test(key) || this.data.passcodeDigits.length >= 6) {
      return;
    }

    const passcodeDigits = `${this.data.passcodeDigits}${key}`;
    this.setData({
      passcodeDigits,
      passcodeError: "",
    });

    if (passcodeDigits.length === 6) {
      this.handlePasscodeComplete(passcodeDigits);
    }
  },

  handlePasscodeComplete(passcode: string) {
    if (!isValidParentPasscode(passcode)) {
      this.setData({
        passcodeDigits: "",
        passcodeError: "请输入 6 位数字。",
      });
      return;
    }

    if (this.data.parentControlMode === "setup") {
      setupPasscodeDraft = passcode;
      const parentControlMode: ParentControlMode = "confirmSetup";
      this.setData({
        parentControlMode,
        parentControlTitle: buildParentControlTitle(parentControlMode),
        passcodeDigits: "",
        passcodeError: "再输入一次，确认家长密码。",
      });
      return;
    }

    if (this.data.parentControlMode === "confirmSetup") {
      if (passcode !== setupPasscodeDraft) {
        const parentControlMode: ParentControlMode = "setup";
        setupPasscodeDraft = "";
        this.setData({
          parentControlMode,
          parentControlTitle: buildParentControlTitle(parentControlMode),
          passcodeDigits: "",
          passcodeError: "两次输入不一致，请重新设置。",
        });
        return;
      }

      saveParentPasscode(passcode);
      this.finishParentControl();
      return;
    }

    if (this.data.parentControlMode === "changeUnlock") {
      if (!validateParentPasscode(passcode)) {
        this.setData({
          passcodeDigits: "",
          passcodeError: "密码不对，请再试一次。",
        });
        return;
      }

      const parentControlMode: ParentControlMode = "setup";
      this.setData({
        parentControlMode,
        parentControlTitle: "设置新的家长密码",
        passcodeDigits: "",
        passcodeError: "请输入新的 6 位家长密码。",
      });
      return;
    }

    if (!validateParentPasscode(passcode)) {
      this.setData({
        passcodeDigits: "",
        passcodeError: "密码不对，请再试一次。",
      });
      return;
    }

    this.finishParentControl();
  },

  finishParentControl() {
    if (parentControlPurpose === "changePasscode") {
      parentControlPurpose = "confirmTask";
      setupPasscodeDraft = "";
      this.setData({
        parentControlOpen: false,
        passcodeDigits: "",
        passcodeError: "",
        dailyLine: "家长密码已经更新。",
      });
      return;
    }

    void this.confirmPendingTask();
  },

  closeParentControl() {
    pendingConfirmTaskId = "";
    setupPasscodeDraft = "";
    parentControlPurpose = "confirmTask";
    this.setData({
      parentControlOpen: false,
      passcodeDigits: "",
      passcodeError: "",
    });
  },

  openWishDetail(event: WechatMiniprogram.TouchEvent) {
    const wishId = String(event.currentTarget.dataset.id ?? "");

    if (!wishId) {
      this.setData({
        dailyLine: "这个愿望还没有准备好。",
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/wishes/detail?id=${encodeURIComponent(wishId)}`,
    });
  },
});
