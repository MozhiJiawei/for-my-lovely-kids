import { loadState, type PrototypeState } from "../../src/api/client";
import { getPrototypeApiConfig } from "../../src/config/api";

type TaskDetailData = {
  taskId: string;
  title: string;
  kindText: string;
  statusText: string;
  flowerValue: number;
  completedCount: number;
  lastCompletedText: string;
  message: string;
  loading: boolean;
};

const initialData: TaskDetailData = {
  taskId: "",
  title: "习惯/目标",
  kindText: "",
  statusText: "",
  flowerValue: 0,
  completedCount: 0,
  lastCompletedText: "暂无",
  message: "正在读取记录。",
  loading: false,
};

function stripTestPrefix(value: string): string {
  return value.replace(/^\[测试\]\s*/, "");
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");

  return `${date.getFullYear()}年${month}月${day}日 ${hour}:${minute}`;
}

function statusText(status: string): string {
  if (status === "archived") {
    return "已完成";
  }

  return status === "test" ? "进行中" : "进行中";
}

function deriveDataFromState(state: PrototypeState, taskId: string): Partial<TaskDetailData> {
  const task = state.taskBook.tasks.find((candidate) => candidate.id === taskId);

  if (!task) {
    return {
      message: "没有找到这条习惯/目标记录。",
    };
  }

  const confirmedSubmissions = state.taskBook.submissions
    .filter(
      (submission) =>
        submission.taskId === taskId &&
        submission.status === "confirmed" &&
        submission.confirmedAt !== null,
    )
    .sort((left, right) => right.confirmedAt!.localeCompare(left.confirmedAt!));

  return {
    title: stripTestPrefix(task.title),
    kindText: task.kind === "one_time" ? "目标" : "习惯",
    statusText: statusText(task.status),
    flowerValue: task.flowerValue,
    completedCount: confirmedSubmissions.length,
    lastCompletedText: formatDateTime(confirmedSubmissions[0]?.confirmedAt ?? null) || "暂无",
    message: "每一次完成，都会留在成长历程里。",
  };
}

Page({
  data: initialData,

  onLoad(options: Record<string, string | undefined>) {
    const taskId = decodeURIComponent(options.id ?? "");

    this.setData({
      taskId,
    });
    void this.refreshState();
  },

  async refreshState() {
    this.setData({
      loading: true,
      message: "正在读取记录。",
    });

    try {
      const state = await loadState(getPrototypeApiConfig());

      this.setData({
        ...deriveDataFromState(state, this.data.taskId),
        loading: false,
      });
    } catch {
      this.setData({
        loading: false,
        message: "暂时读不到记录。",
      });
    }
  },
});
