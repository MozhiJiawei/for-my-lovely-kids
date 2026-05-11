import { loadState, resetTestData, submitTask, type PrototypeState } from "../../src/api/client";
import {
  getDefaultApiBaseUrl,
  isPrototypeToolsVisible,
  prototypeApiTokens,
} from "../../src/config/api";

type TaskState = "ready" | "done";
type TaskTabId = "habits" | "activeGoals";
type FlowerKind = "coral" | "sunny" | "berry" | "sky";

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
};

const maxVisibleFlowers = 10;
const seedSlots = Array.from({ length: maxVisibleFlowers }, (_, index) => index);
const flowerKinds: FlowerKind[] = ["coral", "sunny", "berry", "sky"];
const apiConfig = {
  baseUrl: getDefaultApiBaseUrl(),
  familyToken: prototypeApiTokens.familyToken,
  parentToken: prototypeApiTokens.parentToken,
};
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

  return {
    actionText: "我完成啦",
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

function deriveTasks(state: PrototypeState): TaskPreview[] {
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
            : "ready"
          : confirmedSubmission
            ? "done"
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
): Partial<GardenDesignData> {
  const cumulativeFlowers = state.redFlowers.balance.cumulative;
  const availableFlowers = state.redFlowers.balance.available;
  const todayFlowers = todayEarnedFlowers(state);
  const tasks = deriveTasks(state);
  const wishes = deriveWishes(state);

  return {
    tasks,
    visibleTasks: visibleTasks(tasks, activeTaskTab),
    taskTabs: taskTabs(activeTaskTab),
    wishes,
    todayFlowers,
    availableFlowers,
    cumulativeFlowers,
    flowerSlots:
      state.redFlowers.ledger.length > 0
        ? flowerSlotsFromState(state)
        : flowerSlotsFromTodayFlowers(todayFlowers),
    dailyLine:
      todayFlowers > 0
        ? `今天已经开出 ${Math.min(todayFlowers, maxVisibleFlowers)} 朵花啦。`
        : "今天也一起把小花园照亮吧。",
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
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
  seedSlots,
  dailyLine: "今天也一起把小花园照亮吧。",
  showPrototypeTools: false,
};

let latestRefreshRequest = 0;

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
      const state = await loadState(apiConfig);

      if (requestId !== latestRefreshRequest) {
        return;
      }

      this.setData({
        ...deriveDataFromState(state, this.data.activeTaskTab),
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
      const state = await resetTestData(apiConfig);
      const activeTaskTab: TaskTabId = "habits";

      this.setData({
        activeTaskTab,
        ...deriveDataFromState(state, activeTaskTab),
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

  async tapTask(event: WechatMiniprogram.TouchEvent) {
    const taskId = String(event.currentTarget.dataset.id ?? "");
    const completedTask = this.data.tasks.find(
      (task) => task.id === taskId && task.state === "ready",
    );

    if (!completedTask) {
      return;
    }

    try {
      const response = await submitTask(apiConfig, taskId);
      const todayFlowers = todayEarnedFlowers(response.state);
      const activeTaskTab = this.data.activeTaskTab;

      this.setData({
        activeTaskTab,
        ...deriveDataFromState(response.state, activeTaskTab),
        dailyLine: `开花啦！今天已经开出 ${Math.min(todayFlowers, maxVisibleFlowers)} 朵花。`,
      });
    } catch (error) {
      this.setData({
        dailyLine: `这朵花刚才没开成：${errorMessage(error)}`,
      });
    }
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
