import { deleteTask, loadState, type PrototypeState } from "../../src/api/client";
import { getPrototypeApiConfig } from "../../src/config/api";

type TaskKind = "repeating" | "one_time";

type TaskListItem = {
  id: string;
  title: string;
  flowerValue: number;
  kind: TaskKind;
  kindText: string;
  statusText: string;
  completedToday: boolean;
  deleteOpen: boolean;
};

type TasksData = {
  tasks: TaskListItem[];
  habits: TaskListItem[];
  goals: TaskListItem[];
  message: string;
  loading: boolean;
};

const initialData: TasksData = {
  tasks: [],
  habits: [],
  goals: [],
  message: "把每天的小习惯和一次性目标放在这里。",
  loading: false,
};

let latestRefreshRequest = 0;
let touchStartX = 0;
let touchTaskId = "";

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
      statusText: task.status === "test" ? "测试" : "正式",
      completedToday: confirmedTodayTaskIds.has(task.id),
      deleteOpen: openDeleteIds.has(task.id),
    }));
}

function deriveDataFromState(
  state: PrototypeState,
  currentTasks: TaskListItem[],
): Partial<TasksData> {
  const tasks = activeTasks(state, currentTasks);

  return {
    tasks,
    habits: tasks.filter((task) => task.kind === "repeating"),
    goals: tasks.filter((task) => task.kind === "one_time"),
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

  openCreateEditor() {
    wx.navigateTo({
      url: "/pages/tasks/edit",
    });
  },

  noop() {
    return;
  },

  editTask(event: WechatMiniprogram.TouchEvent) {
    const taskId = String(event.currentTarget.dataset.id ?? "");

    if (!taskId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/tasks/edit?id=${encodeURIComponent(taskId)}`,
    });
  },

  touchTaskStart(event: WechatMiniprogram.TouchEvent) {
    touchStartX = event.touches[0]?.clientX ?? 0;
    touchTaskId = String(event.currentTarget.dataset.id ?? "");
  },

  touchTaskEnd(event: WechatMiniprogram.TouchEvent) {
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

  deleteTask(event: WechatMiniprogram.TouchEvent) {
    const taskId = String(event.currentTarget.dataset.id ?? "");
    const task = this.data.tasks.find((candidate) => candidate.id === taskId);

    if (!task) {
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
});
