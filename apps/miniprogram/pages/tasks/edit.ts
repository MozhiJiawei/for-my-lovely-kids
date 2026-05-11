import {
  createTask,
  loadState,
  updateTask,
  type PrototypeState,
  type TaskState,
} from "../../src/api/client";
import { getPrototypeApiConfig } from "../../src/config/api";

type TaskKind = "repeating" | "one_time";
type ParentControlPanel = {
  request: (reason: string) => Promise<boolean>;
};

type TaskEditData = {
  taskId: string;
  titleInput: string;
  flowerValueInput: string;
  kindInput: TaskKind;
  modeText: string;
  message: string;
  loading: boolean;
  parentControlReady: boolean;
};

type PreviousTaskPage = {
  refreshFromState?: (state: PrototypeState) => void;
};

const initialData: TaskEditData = {
  taskId: "",
  titleInput: "",
  flowerValueInput: "2",
  kindInput: "repeating",
  modeText: "新增习惯/目标",
  message: "习惯每天都能完成一次，目标完成后会进入历史。",
  loading: false,
  parentControlReady: false,
};

let latestLoadRequest = 0;
let formDirty = false;
let pendingTaskId = "";

function parsePositiveInteger(value: string): number | null {
  const amount = Number(value);

  if (!Number.isInteger(amount) || amount <= 0) {
    return null;
  }

  return amount;
}

function taskFromState(state: PrototypeState, taskId: string): TaskState | undefined {
  return state.taskBook.tasks.find((task) => task.id === taskId);
}

Page({
  data: initialData,

  onLoad(options: Record<string, string | undefined>) {
    const taskId = decodeURIComponent(options.id ?? "");

    pendingTaskId = taskId;
    this.setData({
      taskId,
      modeText: taskId ? "编辑习惯/目标" : "新增习惯/目标",
      message: "需要家长验证后才能管理任务。",
    });
  },

  onReady() {
    void this.prepareEditor(pendingTaskId);
  },

  async prepareEditor(taskId: string) {
    const allowed = await this.requireParentControl(
      taskId ? "编辑任务需要家长确认。" : "新增任务需要家长确认。",
    );

    if (!allowed) {
      this.setData({
        message: "已取消家长验证，不能管理任务。",
      });
      return;
    }

    this.setData({
      parentControlReady: true,
      message: taskId ? "正在读取任务。" : "可以新增习惯或目标。",
    });

    if (taskId) {
      void this.loadTask(taskId);
    }
  },

  async loadTask(taskId: string) {
    const requestId = latestLoadRequest + 1;
    latestLoadRequest = requestId;
    formDirty = false;

    this.setData({
      loading: true,
      message: "正在读取任务。",
    });

    try {
      const state = await loadState(getPrototypeApiConfig());

      if (requestId !== latestLoadRequest) {
        return;
      }

      if (formDirty) {
        this.setData({
          loading: false,
        });
        return;
      }

      const task = taskFromState(state, taskId);

      if (!task || task.status === "archived") {
        this.setData({
          loading: false,
          message: "没有找到这个任务。",
        });
        return;
      }

      this.setData({
        loading: false,
        titleInput: task.title.replace(/^\[测试\]\s*/, ""),
        flowerValueInput: String(task.flowerValue),
        kindInput: task.kind,
        message: "任务已加载，可以修改。",
      });
    } catch {
      if (requestId !== latestLoadRequest) {
        return;
      }

      this.setData({
        loading: false,
        message: "暂时读不到这个任务。",
      });
    }
  },

  updateTitle(event: WechatMiniprogram.Input) {
    formDirty = true;
    this.setData({
      titleInput: event.detail.value,
    });
  },

  updateFlowerValue(event: WechatMiniprogram.Input) {
    formDirty = true;
    this.setData({
      flowerValueInput: event.detail.value,
    });
  },

  decreaseFlowerValue() {
    formDirty = true;
    const flowerValue = parsePositiveInteger(this.data.flowerValueInput) ?? 1;

    this.setData({
      flowerValueInput: String(Math.max(1, flowerValue - 1)),
    });
  },

  increaseFlowerValue() {
    formDirty = true;
    const flowerValue = parsePositiveInteger(this.data.flowerValueInput) ?? 0;

    this.setData({
      flowerValueInput: String(flowerValue + 1),
    });
  },

  updateKind(event: WechatMiniprogram.TouchEvent) {
    formDirty = true;
    const kind = String(event.currentTarget.dataset.kind);

    this.setData({
      kindInput: kind === "one_time" ? "one_time" : "repeating",
    });
  },

  cancel() {
    wx.navigateBack();
  },

  async saveTask() {
    const allowed = await this.requireParentControl("保存任务需要家长确认。");

    if (!allowed) {
      this.setData({
        message: "已取消家长验证，任务没有保存。",
      });
      return;
    }

    const flowerValue = parsePositiveInteger(this.data.flowerValueInput);

    if (!this.data.titleInput.trim() || flowerValue === null) {
      this.setData({
        message: "请填写标题和正整数小红花。",
      });
      return;
    }

    this.setData({
      loading: true,
      message: "正在保存任务。",
    });

    try {
      const input = {
        title: this.data.titleInput,
        flowerValue,
        kind: this.data.kindInput,
      };
      const response = this.data.taskId
        ? await updateTask(getPrototypeApiConfig(), this.data.taskId, input)
        : await createTask(getPrototypeApiConfig(), input);

      const pages = getCurrentPages();
      const previousPage = pages[pages.length - 2] as PreviousTaskPage | undefined;
      previousPage?.refreshFromState?.(response.state);

      this.setData({
        loading: false,
        message: "任务已保存。",
      });

      wx.navigateBack();
    } catch (error) {
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "保存失败。",
      });
    }
  },

  requireParentControl(reason: string): Promise<boolean> {
    const panel = this.selectComponent("#parentControl") as unknown as ParentControlPanel | null;

    return panel?.request(reason) ?? Promise.resolve(false);
  },
});
