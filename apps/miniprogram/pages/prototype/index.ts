import {
  approveWish,
  confirmTasks,
  createTask,
  createWish,
  loadState,
  redeemWish,
  resetTestData,
  submitTask,
  type PrototypeState,
} from "../../src/api/client";

type PrototypeData = {
  apiBaseUrl: string;
  familyToken: string;
  parentToken: string;
  loadSummary: string;
  availableFlowers: number;
  cumulativeFlowers: number;
  taskStatusText: string;
  wishStatusText: string;
  ledgerLines: string[];
  decorationCount: number;
  pendingSubmissions: Array<{
    id: string;
    title: string;
    flowerValue: number;
    selected: boolean;
  }>;
  confirmedSubmissions: Array<{
    id: string;
    title: string;
    flowerValue: number;
  }>;
  taskOptions: Array<{
    id: string;
    title: string;
    flowerValue: number;
    statusText: string;
    selected: boolean;
  }>;
  taskOptionIds: string[];
  taskOptionFlowerValues: number[];
  selectedTaskIndex: number;
  taskTitle: string;
  taskFlowerValue: number;
  newTaskTitle: string;
  newTaskFlowerValue: string;
  newTaskKind: "repeating" | "one_time";
  wishOptions: Array<{
    id: string;
    title: string;
    flowerCost: number;
    statusText: string;
    selected: boolean;
  }>;
  wishOptionIds: string[];
  wishOptionFlowerCosts: number[];
  selectedWishIndex: number;
  wishTitle: string;
  wishFlowerCost: number;
  newWishTitle: string;
  newWishFlowerCost: string;
  pendingRedemptions: Array<{
    id: string;
    title: string;
    flowerCost: number;
    selected: boolean;
  }>;
  approvedRedemptions: Array<{
    id: string;
    title: string;
    flowerCost: number;
  }>;
  decorations: Array<{
    id: string;
    wishRedemptionId: string;
  }>;
  message: string;
  loading: boolean;
  taskId: string;
  pendingSubmissionId: string;
  wishId: string;
  pendingRedemptionId: string;
};

const initialData: PrototypeData = {
  apiBaseUrl: "http://7.246.192.74:3000",
  familyToken: "family-dev-token",
  parentToken: "parent-dev-token",
  loadSummary: "还没有成功读取服务状态。",
  availableFlowers: 0,
  cumulativeFlowers: 0,
  taskStatusText: "正在读取任务",
  wishStatusText: "正在读取愿望",
  ledgerLines: [],
  decorationCount: 0,
  pendingSubmissions: [],
  confirmedSubmissions: [],
  taskOptions: [],
  taskOptionIds: [],
  taskOptionFlowerValues: [],
  selectedTaskIndex: 0,
  taskTitle: "",
  taskFlowerValue: 0,
  newTaskTitle: "认真刷牙",
  newTaskFlowerValue: "2",
  newTaskKind: "repeating",
  wishOptions: [],
  wishOptionIds: [],
  wishOptionFlowerCosts: [],
  selectedWishIndex: 0,
  wishTitle: "",
  wishFlowerCost: 0,
  newWishTitle: "周末坐旋转木马",
  newWishFlowerCost: "10",
  pendingRedemptions: [],
  approvedRedemptions: [],
  decorations: [],
  message: "请先启动后端 API，再读取服务状态。",
  loading: false,
  taskId: "",
  pendingSubmissionId: "",
  wishId: "",
  pendingRedemptionId: "",
};

function getConfig(data: PrototypeData) {
  return {
    baseUrl: data.apiBaseUrl.trim(),
    familyToken: data.familyToken.trim(),
    parentToken: data.parentToken.trim(),
  };
}

function parsePositiveInteger(value: string): number | null {
  const amount = Number(value);

  if (!Number.isInteger(amount) || amount <= 0) {
    return null;
  }

  return amount;
}

function ledgerLine(entry: PrototypeState["redFlowers"]["ledger"][number]): string {
  const sign = entry.deltaAvailable > 0 ? "+" : "";

  return `${sign}${entry.deltaAvailable} 可用 / +${entry.deltaCumulative} 累计`;
}

function deriveDataFromState(
  state: PrototypeState,
  currentData?: PrototypeData,
): Partial<PrototypeData> {
  const selectableTasks = state.taskBook.tasks.filter(
    (candidate) => candidate.status === "active" || candidate.status === "test",
  );
  const currentTaskIndex = currentData
    ? selectableTasks.findIndex((task) => task.id === currentData.taskId)
    : -1;
  const selectedTaskIndex = currentTaskIndex >= 0 ? currentTaskIndex : 0;
  const task = selectableTasks[selectedTaskIndex];
  const pendingSubmission = state.taskBook.submissions.find(
    (submission) => submission.status === "pending",
  );
  const confirmedSubmission = state.taskBook.submissions.find(
    (submission) => submission.status === "confirmed",
  );
  const selectableWishes = state.wishBook.wishes.filter(
    (candidate) => candidate.status === "active" || candidate.status === "test",
  );
  const currentWishIndex = currentData
    ? selectableWishes.findIndex((wish) => wish.id === currentData.wishId)
    : -1;
  const selectedWishIndex = currentWishIndex >= 0 ? currentWishIndex : 0;
  const wish = selectableWishes[selectedWishIndex];
  const pendingRedemption = state.wishBook.redemptions.find(
    (redemption) => redemption.status === "pending",
  );
  const approvedRedemption = state.wishBook.redemptions.find(
    (redemption) => redemption.status === "approved",
  );

  return {
    availableFlowers: state.redFlowers.balance.available,
    cumulativeFlowers: state.redFlowers.balance.cumulative,
    taskOptions: selectableTasks.map((candidate, index) => ({
      id: candidate.id,
      title: candidate.title,
      flowerValue: candidate.flowerValue,
      statusText: candidate.status === "test" ? "测试" : "正式",
      selected: index === selectedTaskIndex,
    })),
    taskOptionIds: selectableTasks.map((candidate) => candidate.id),
    taskOptionFlowerValues: selectableTasks.map((candidate) => candidate.flowerValue),
    selectedTaskIndex,
    taskTitle: task?.title ?? "",
    taskFlowerValue: task?.flowerValue ?? 0,
    taskId: task?.id ?? "",
    pendingSubmissionId: pendingSubmission?.id ?? "",
    taskStatusText: pendingSubmission
      ? "等家长看看"
      : confirmedSubmission
        ? "开花啦"
        : "可以提交任务",
    pendingSubmissions: state.taskBook.submissions
      .filter((submission) => submission.status === "pending")
      .map((submission) => ({
        id: submission.id,
        title: submission.titleSnapshot,
        flowerValue: submission.flowerValueSnapshot,
        selected: currentData
          ? currentData.pendingSubmissions.some(
              (candidate) => candidate.id === submission.id && candidate.selected,
            )
          : true,
      })),
    confirmedSubmissions: state.taskBook.submissions
      .filter((submission) => submission.status === "confirmed")
      .map((submission) => ({
        id: submission.id,
        title: submission.titleSnapshot,
        flowerValue: submission.flowerValueSnapshot,
      })),
    wishOptions: selectableWishes.map((candidate, index) => ({
      id: candidate.id,
      title: candidate.title,
      flowerCost: candidate.flowerCost,
      statusText: candidate.status === "test" ? "测试" : "正式",
      selected: index === selectedWishIndex,
    })),
    wishOptionIds: selectableWishes.map((candidate) => candidate.id),
    wishOptionFlowerCosts: selectableWishes.map((candidate) => candidate.flowerCost),
    selectedWishIndex,
    wishTitle: wish?.title ?? "",
    wishFlowerCost: wish?.flowerCost ?? 0,
    wishId: wish?.id ?? "",
    pendingRedemptionId: pendingRedemption?.id ?? "",
    wishStatusText: pendingRedemption
      ? "愿望已申请，等家长批准"
      : approvedRedemption
        ? "愿望实现啦"
        : "可以申请愿望",
    pendingRedemptions: state.wishBook.redemptions
      .filter((redemption) => redemption.status === "pending")
      .map((redemption) => ({
        id: redemption.id,
        title: redemption.titleSnapshot,
        flowerCost: redemption.flowerCostSnapshot,
        selected: currentData
          ? currentData.pendingRedemptions.some(
              (candidate) => candidate.id === redemption.id && candidate.selected,
            )
          : true,
      })),
    approvedRedemptions: state.wishBook.redemptions
      .filter((redemption) => redemption.status === "approved")
      .map((redemption) => ({
        id: redemption.id,
        title: redemption.titleSnapshot,
        flowerCost: redemption.flowerCostSnapshot,
      })),
    decorations: state.garden.memorialDecorations.map((decoration) => ({
      id: decoration.id,
      wishRedemptionId: decoration.wishRedemptionId,
    })),
    decorationCount: state.garden.memorialDecorations.length,
    ledgerLines: state.redFlowers.ledger.map(ledgerLine).reverse(),
  };
}

Page({
  data: initialData,

  onLoad() {
    wx.setNavigationBarTitle({
      title: "小红花原型",
    });
    void this.refreshState();
  },

  updateApiBaseUrl(event: WechatMiniprogram.Input) {
    this.setData({
      apiBaseUrl: event.detail.value,
    });
  },

  updateFamilyToken(event: WechatMiniprogram.Input) {
    this.setData({
      familyToken: event.detail.value,
    });
  },

  updateParentToken(event: WechatMiniprogram.Input) {
    this.setData({
      parentToken: event.detail.value,
    });
  },

  updateNewTaskTitle(event: WechatMiniprogram.Input) {
    this.setData({
      newTaskTitle: event.detail.value,
    });
  },

  updateNewTaskFlowerValue(event: WechatMiniprogram.Input) {
    this.setData({
      newTaskFlowerValue: event.detail.value,
    });
  },

  updateNewTaskKind(event: WechatMiniprogram.RadioGroupChange) {
    this.setData({
      newTaskKind: event.detail.value === "one_time" ? "one_time" : "repeating",
    });
  },

  selectTask(event: WechatMiniprogram.TouchEvent) {
    const selectedTaskIndex = Number(event.currentTarget.dataset.index);
    const task = this.data.taskOptions[selectedTaskIndex];
    const taskId = task?.id ?? "";

    this.setData({
      selectedTaskIndex,
      taskId,
      taskTitle: task?.title ?? "",
      taskFlowerValue: task?.flowerValue ?? 0,
      taskOptions: this.data.taskOptions.map((option, index) => ({
        ...option,
        selected: index === selectedTaskIndex,
      })),
      message: taskId ? "已选择任务。" : "没有可选择的任务。",
    });
  },

  togglePendingSubmission(event: WechatMiniprogram.TouchEvent) {
    const submissionId = String(event.currentTarget.dataset.id ?? "");

    this.setData({
      pendingSubmissions: this.data.pendingSubmissions.map((submission) =>
        submission.id === submissionId
          ? { ...submission, selected: !submission.selected }
          : submission,
      ),
    });
  },

  updateNewWishTitle(event: WechatMiniprogram.Input) {
    this.setData({
      newWishTitle: event.detail.value,
    });
  },

  updateNewWishFlowerCost(event: WechatMiniprogram.Input) {
    this.setData({
      newWishFlowerCost: event.detail.value,
    });
  },

  selectWish(event: WechatMiniprogram.TouchEvent) {
    const selectedWishIndex = Number(event.currentTarget.dataset.index);
    const wish = this.data.wishOptions[selectedWishIndex];
    const wishId = wish?.id ?? "";

    this.setData({
      selectedWishIndex,
      wishId,
      wishTitle: wish?.title ?? "",
      wishFlowerCost: wish?.flowerCost ?? 0,
      wishOptions: this.data.wishOptions.map((option, index) => ({
        ...option,
        selected: index === selectedWishIndex,
      })),
      message: wishId ? "已选择愿望。" : "没有可选择的愿望。",
    });
  },

  selectPendingRedemption(event: WechatMiniprogram.TouchEvent) {
    const redemptionId = String(event.currentTarget.dataset.id ?? "");

    this.setData({
      pendingRedemptions: this.data.pendingRedemptions.map((redemption) => ({
        ...redemption,
        selected: redemption.id === redemptionId,
      })),
      pendingRedemptionId: redemptionId,
      message: redemptionId ? "已选择待批准愿望。" : "没有可批准的愿望。",
    });
  },

  async refreshState() {
    this.setData({
      loading: true,
      message: "正在读取服务状态。",
    });

    try {
      const state = await loadState(getConfig(this.data));

      this.setData({
        ...deriveDataFromState(state, this.data),
        loading: false,
        loadSummary: `最近读取：${state.taskBook.tasks.length} 个任务，${state.wishBook.wishes.length} 个愿望。`,
        message: `已读取后端服务状态：${state.taskBook.tasks.length} 个任务，${state.wishBook.wishes.length} 个愿望。`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取失败。";
      this.setData({
        loading: false,
        loadSummary: message,
        message,
      });
    }
  },

  async resetTestData() {
    this.setData({
      loading: true,
      message: "正在重置测试数据。",
    });

    try {
      const state = await resetTestData(getConfig(this.data));

      this.setData({
        ...deriveDataFromState(state, this.data),
        loading: false,
        loadSummary: `最近读取：${state.taskBook.tasks.length} 个任务，${state.wishBook.wishes.length} 个愿望。`,
        message: `测试数据已加载：${state.taskBook.tasks.length} 个任务，${state.wishBook.wishes.length} 个愿望。`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? `${error.message}（请确认后端以 NODE_ENV=test 启动，或直接用读取服务状态）`
          : "重置测试数据失败。";
      this.setData({
        loading: false,
        loadSummary: message,
        message,
      });
    }
  },

  async saveTask() {
    const flowerValue = parsePositiveInteger(this.data.newTaskFlowerValue);

    if (!this.data.newTaskTitle.trim() || flowerValue === null) {
      this.setData({
        message: "请填写任务名称和正整数小红花奖励。",
      });
      return;
    }

    this.setData({
      loading: true,
      message: "正在保存任务。",
    });

    try {
      const response = await createTask(getConfig(this.data), {
        title: this.data.newTaskTitle,
        flowerValue,
        kind: this.data.newTaskKind,
      });

      this.setData({
        ...deriveDataFromState(response.state, this.data),
        loading: false,
        message: "任务已保存，可以提交了。",
      });
    } catch (error) {
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "保存任务失败。",
      });
    }
  },

  async saveWish() {
    const flowerCost = parsePositiveInteger(this.data.newWishFlowerCost);

    if (!this.data.newWishTitle.trim() || flowerCost === null) {
      this.setData({
        message: "请填写愿望名称和正整数小红花价格。",
      });
      return;
    }

    this.setData({
      loading: true,
      message: "正在保存愿望。",
    });

    try {
      const response = await createWish(getConfig(this.data), {
        title: this.data.newWishTitle,
        flowerCost,
      });

      this.setData({
        ...deriveDataFromState(response.state, this.data),
        loading: false,
        message: "愿望已保存，可以申请了。",
      });
    } catch (error) {
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "保存愿望失败。",
      });
    }
  },

  async submitTask() {
    this.setData({
      loading: true,
      message: "正在提交任务。",
    });

    try {
      const response = await submitTask(getConfig(this.data), this.data.taskId);

      this.setData({
        ...deriveDataFromState(response.state, this.data),
        loading: false,
        message: "任务已提交，正式小红花还没有增加。",
      });
    } catch (error) {
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "提交失败。",
      });
    }
  },

  async confirmSelectedTasks() {
    const submissionIds = this.data.pendingSubmissions
      .filter((submission) => submission.selected)
      .map((submission) => submission.id);

    if (submissionIds.length === 0) {
      this.setData({
        message: "请先选择要确认的任务。",
      });
      return;
    }

    this.setData({
      loading: true,
      message: "正在确认任务。",
    });

    try {
      const state = await confirmTasks(getConfig(this.data), submissionIds);

      this.setData({
        ...deriveDataFromState(state, this.data),
        loading: false,
        message: `家长已确认 ${submissionIds.length} 个任务，可用和累计小红花都增加了。`,
      });
    } catch (error) {
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "确认失败。",
      });
    }
  },

  async redeemWish() {
    this.setData({
      loading: true,
      message: "正在兑换愿望。",
    });

    try {
      const response = await redeemWish(getConfig(this.data), this.data.wishId);

      this.setData({
        ...deriveDataFromState(response.state, this.data),
        loading: false,
        message: "愿望已兑换，可用小红花已扣除。",
      });
    } catch (error) {
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "兑换失败。",
      });
    }
  },

  async approveWish() {
    const redemptionId =
      this.data.pendingRedemptions.find((redemption) => redemption.selected)?.id ??
      this.data.pendingRedemptionId;

    if (!redemptionId) {
      this.setData({
        message: "请先选择要批准的愿望。",
      });
      return;
    }

    this.setData({
      loading: true,
      message: "正在批准愿望。",
    });

    try {
      const response = await approveWish(getConfig(this.data), redemptionId);

      this.setData({
        ...deriveDataFromState(response.state, this.data),
        loading: false,
        message: "愿望已批准，只扣可用小红花，累计小红花不变。",
      });
    } catch (error) {
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "批准失败。",
      });
    }
  },
});
