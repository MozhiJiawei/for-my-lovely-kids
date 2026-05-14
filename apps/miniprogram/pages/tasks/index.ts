import { deleteTask, loadState, type PrototypeState } from "../../src/api/client";
import { getPrototypeApiConfig } from "../../src/config/api";

type TaskKind = "repeating" | "one_time";
type ParentControlPanel = {
  request: (reason: string) => Promise<boolean>;
};

type TaskListItem = {
  id: string;
  title: string;
  flowerValue: number;
  kind: TaskKind;
  kindText: string;
  statusText: string;
  completedToday: boolean;
  deleteOpen: boolean;
  selected: boolean;
};

type TasksData = {
  tasks: TaskListItem[];
  habits: TaskListItem[];
  goals: TaskListItem[];
  backfillSelecting: boolean;
  selectedHabitCount: number;
  message: string;
  loading: boolean;
};

const initialData: TasksData = {
  tasks: [],
  habits: [],
  goals: [],
  backfillSelecting: false,
  selectedHabitCount: 0,
  message: "把每天的小习惯和一次性目标放在这里。",
  loading: false,
};

let latestRefreshRequest = 0;
let touchStartX = 0;
let touchTaskId = "";
let selectedHabitIds = new Set<string>();

function todayKey(): string {
  return getBusinessDayKey(new Date().toISOString());
}

function getBusinessDayKey(value: string): string {
  return new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function kindText(kind: TaskKind): string {
  return kind === "repeating" ? "习惯" : "目标";
}

function activeTasks(state: PrototypeState, currentTasks: TaskListItem[]): TaskListItem[] {
  const openDeleteIds = new Set(
    currentTasks.filter((task) => task.deleteOpen).map((task) => task.id),
  );
  const confirmedTodayTaskIds = new Set(
    state.taskBook.submissions
      .filter(
        (submission) =>
          submission.status === "confirmed" &&
          submission.confirmedAt !== null &&
          getBusinessDayKey(submission.confirmedAt) === todayKey(),
      )
      .map((submission) => submission.taskId),
  );

  return state.taskBook.tasks
    .filter((task) => task.status === "active" || task.status === "test")
    .map((task) => ({
      id: task.id,
      title: task.title.replace(/^\[测试\]\s*/, ""),
      flowerValue: task.flowerValue,
      kind: task.kind,
      kindText: kindText(task.kind),
      statusText: task.kind === "one_time" ? "待达成" : "待完成",
      completedToday: confirmedTodayTaskIds.has(task.id),
      deleteOpen: openDeleteIds.has(task.id),
      selected: selectedHabitIds.has(task.id),
    }));
}

function deriveDataFromState(
  state: PrototypeState,
  currentTasks: TaskListItem[],
): Partial<TasksData> {
  const tasks = activeTasks(state, currentTasks);
  const validHabitIds = new Set(
    tasks.filter((task) => task.kind === "repeating").map((task) => task.id),
  );
  selectedHabitIds = new Set(Array.from(selectedHabitIds).filter((id) => validHabitIds.has(id)));

  return {
    tasks,
    habits: tasks.filter((task) => task.kind === "repeating"),
    goals: tasks.filter((task) => task.kind === "one_time"),
    selectedHabitCount: selectedHabitIds.size,
  };
}

function closeDeleteForTasks(tasks: TaskListItem[]): TaskListItem[] {
  return tasks.map((task) => ({
    ...task,
    deleteOpen: false,
  }));
}

Page({
  data: initialData,

  onShow() {
    void this.refreshState();
  },

  async refreshState() {
    const requestId = latestRefreshRequest + 1;
    latestRefreshRequest = requestId;

    this.setData({
      loading: true,
      message: "正在读取习惯和目标。",
    });

    try {
      const state = await loadState(getPrototypeApiConfig());

      if (requestId !== latestRefreshRequest) {
        return;
      }

      this.setData({
        ...deriveDataFromState(state, closeDeleteForTasks(this.data.tasks)),
        loading: false,
        message: "习惯和目标已经准备好。",
      });
    } catch {
      if (requestId !== latestRefreshRequest) {
        return;
      }

      this.setData({
        loading: false,
        message: "暂时读不到习惯和目标。",
      });
    }
  },

  refreshFromState(state: PrototypeState) {
    this.setData({
      ...deriveDataFromState(state, []),
      loading: false,
      message: "习惯和目标已经更新。",
    });
  },

  async openCreateEditor() {
    const allowed = await this.requireParentControl("新增或修改任务需要家长确认。");

    if (!allowed) {
      this.setData({
        message: "已取消家长确认，任务没有变化。",
      });
      return;
    }

    wx.navigateTo({
      url: "/pages/tasks/edit",
    });
  },

  noop() {
    return;
  },

  async editTask(event: WechatMiniprogram.TouchEvent) {
    const taskId = String(event.currentTarget.dataset.id ?? "");

    if (!taskId) {
      return;
    }

    const allowed = await this.requireParentControl("编辑任务需要家长确认。");

    if (!allowed) {
      this.setData({
        message: "已取消家长确认，任务没有变化。",
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/tasks/edit?id=${encodeURIComponent(taskId)}`,
    });
  },

  async openBackfill(event: WechatMiniprogram.TouchEvent) {
    const taskId = String(event.currentTarget.dataset.id ?? "");
    const task = this.data.habits.find((candidate) => candidate.id === taskId);

    if (!task) {
      return;
    }

    const allowed = await this.requireParentControl("补录习惯打卡需要家长确认。");

    if (!allowed) {
      this.setData({
        message: "已取消家长确认，习惯打卡没有补录。",
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/tasks/backfill?ids=${encodeURIComponent(taskId)}`,
    });
  },

  startBatchBackfill() {
    selectedHabitIds = new Set();
    this.setData({
      backfillSelecting: true,
      selectedHabitCount: 0,
      tasks: this.data.tasks.map((task) => ({ ...task, selected: false, deleteOpen: false })),
      habits: this.data.habits.map((task) => ({ ...task, selected: false, deleteOpen: false })),
      goals: this.data.goals.map((task) => ({ ...task, selected: false, deleteOpen: false })),
      message: "选择要一起补录的习惯。",
    });
  },

  cancelBatchBackfill() {
    selectedHabitIds = new Set();
    this.setData({
      backfillSelecting: false,
      selectedHabitCount: 0,
      tasks: this.data.tasks.map((task) => ({ ...task, selected: false })),
      habits: this.data.habits.map((task) => ({ ...task, selected: false })),
      goals: this.data.goals.map((task) => ({ ...task, selected: false })),
      message: "习惯和目标已经准备好。",
    });
  },

  toggleHabitSelection(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.backfillSelecting) {
      return;
    }

    const taskId = String(event.currentTarget.dataset.id ?? "");

    if (!taskId || !this.data.habits.some((habit) => habit.id === taskId)) {
      return;
    }

    if (selectedHabitIds.has(taskId)) {
      selectedHabitIds.delete(taskId);
    } else {
      selectedHabitIds.add(taskId);
    }

    this.setData({
      tasks: this.data.tasks.map((task) => ({
        ...task,
        selected: selectedHabitIds.has(task.id),
      })),
      habits: this.data.habits.map((task) => ({
        ...task,
        selected: selectedHabitIds.has(task.id),
      })),
      selectedHabitCount: selectedHabitIds.size,
      message:
        selectedHabitIds.size > 0
          ? `已选择 ${selectedHabitIds.size} 个习惯。`
          : "选择要一起补录的习惯。",
    });
  },

  async openBatchBackfill() {
    const habitIds = Array.from(selectedHabitIds);

    if (habitIds.length === 0) {
      this.setData({
        message: "请先选择要补录的习惯。",
      });
      return;
    }

    const allowed = await this.requireParentControl("批量补录习惯打卡需要家长确认。");

    if (!allowed) {
      this.setData({
        message: "已取消家长确认，习惯打卡没有补录。",
      });
      return;
    }

    selectedHabitIds = new Set();
    this.setData({
      backfillSelecting: false,
      selectedHabitCount: 0,
      tasks: this.data.tasks.map((task) => ({ ...task, selected: false })),
      habits: this.data.habits.map((task) => ({ ...task, selected: false })),
    });

    wx.navigateTo({
      url: `/pages/tasks/backfill?ids=${encodeURIComponent(habitIds.join(","))}`,
    });
  },

  touchTaskStart(event: WechatMiniprogram.TouchEvent) {
    if (this.data.backfillSelecting) {
      return;
    }

    touchStartX = event.touches[0]?.clientX ?? 0;
    touchTaskId = String(event.currentTarget.dataset.id ?? "");
  },

  touchTaskEnd(event: WechatMiniprogram.TouchEvent) {
    if (this.data.backfillSelecting) {
      return;
    }

    const endX = event.changedTouches[0]?.clientX ?? touchStartX;
    const deltaX = endX - touchStartX;

    if (!touchTaskId || Math.abs(deltaX) < 36) {
      return;
    }

    const shouldOpen = deltaX < 0;
    this.setData({
      tasks: this.data.tasks.map((task) => ({
        ...task,
        deleteOpen: task.id === touchTaskId ? shouldOpen : false,
      })),
      habits: this.data.habits.map((task) => ({
        ...task,
        deleteOpen: task.id === touchTaskId ? shouldOpen : false,
      })),
      goals: this.data.goals.map((task) => ({
        ...task,
        deleteOpen: task.id === touchTaskId ? shouldOpen : false,
      })),
    });
  },

  closeDeleteActions() {
    const tasks = closeDeleteForTasks(this.data.tasks);

    this.setData({
      tasks,
      habits: tasks.filter((task) => task.kind === "repeating"),
      goals: tasks.filter((task) => task.kind === "one_time"),
    });
  },

  async deleteTask(event: WechatMiniprogram.TouchEvent) {
    const taskId = String(event.currentTarget.dataset.id ?? "");
    const task = this.data.tasks.find((candidate) => candidate.id === taskId);

    if (!task) {
      return;
    }

    const allowed = await this.requireParentControl("删除任务需要家长确认。");

    if (!allowed) {
      this.setData({
        message: "已取消家长确认，任务没有变化。",
      });
      return;
    }

    wx.showModal({
      title: "删除任务",
      content: `删除「${task.title}」后，历史完成记录会保留。`,
      confirmText: "删除",
      confirmColor: "#e24b45",
      success: (result) => {
        if (result.confirm) {
          void this.archiveTask(taskId);
        }
      },
    });
  },

  async archiveTask(taskId: string) {
    latestRefreshRequest += 1;
    this.setData({
      loading: true,
      message: "正在删除任务。",
    });

    try {
      const response = await deleteTask(getPrototypeApiConfig(), taskId);

      this.setData({
        ...deriveDataFromState(response.state, []),
        loading: false,
        message: "任务已删除，历史记录还在。",
      });
    } catch (error) {
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "删除失败。",
      });
    }
  },

  requireParentControl(reason: string): Promise<boolean> {
    const panel = this.selectComponent("#parentControl") as unknown as ParentControlPanel | null;

    return panel?.request(reason) ?? Promise.resolve(false);
  },
});
