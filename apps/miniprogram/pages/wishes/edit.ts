import {
  createWish,
  loadState,
  updateWish,
  type PrototypeState,
  type WishState,
} from "../../src/api/client";
import { getPrototypeApiConfig } from "../../src/config/api";

type WishKind = "repeating" | "one_time";
type ParentControlPanel = {
  request: (reason: string) => Promise<boolean>;
};

type WishEditData = {
  wishId: string;
  titleInput: string;
  flowerCostInput: string;
  kindInput: WishKind;
  pinnedInput: boolean;
  modeText: string;
  message: string;
  loading: boolean;
  parentControlReady: boolean;
};

const initialData: WishEditData = {
  wishId: "",
  titleInput: "",
  flowerCostInput: "6",
  kindInput: "one_time",
  pinnedInput: false,
  modeText: "新增心愿",
  message: "先记录标题和小红花，图片、链接和描述以后可以继续加。",
  loading: false,
  parentControlReady: false,
};

let latestLoadRequest = 0;
let formDirty = false;
let pendingWishId = "";

function parsePositiveInteger(value: string): number | null {
  const amount = Number(value);

  if (!Number.isInteger(amount) || amount <= 0) {
    return null;
  }

  return amount;
}

function wishFromState(state: PrototypeState, wishId: string): WishState | undefined {
  return state.wishBook.wishes.find((wish) => wish.id === wishId);
}

Page({
  data: initialData,

  onLoad(options: Record<string, string | undefined>) {
    const wishId = decodeURIComponent(options.id ?? "");

    pendingWishId = wishId;
    this.setData({
      wishId,
      modeText: wishId ? "编辑心愿" : "新增心愿",
      message: "需要家长验证后才能管理心愿。",
    });
  },

  onReady() {
    void this.prepareEditor(pendingWishId);
  },

  async prepareEditor(wishId: string) {
    const allowed = await this.requireParentControl(
      wishId ? "编辑心愿需要家长确认。" : "新增心愿需要家长确认。",
    );

    if (!allowed) {
      this.setData({
        message: "已取消家长验证，不能管理心愿。",
      });
      return;
    }

    this.setData({
      parentControlReady: true,
      message: wishId ? "正在读取心愿。" : "可以新增心愿。",
    });

    if (wishId) {
      void this.loadWish(wishId);
    }
  },

  async loadWish(wishId: string) {
    const requestId = latestLoadRequest + 1;
    latestLoadRequest = requestId;
    formDirty = false;

    this.setData({
      loading: true,
      message: "正在读取心愿。",
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

      const wish = wishFromState(state, wishId);

      if (!wish) {
        this.setData({
          loading: false,
          message: "没有找到这个心愿。",
        });
        return;
      }

      this.setData({
        loading: false,
        titleInput: wish.title.replace(/^\[测试\]\s*/, ""),
        flowerCostInput: String(wish.flowerCost),
        kindInput: wish.kind,
        pinnedInput: wish.pinned,
        message: "心愿已加载，可以修改。",
      });
    } catch {
      if (requestId !== latestLoadRequest) {
        return;
      }

      this.setData({
        loading: false,
        message: "暂时读不到这个心愿。",
      });
    }
  },

  updateTitle(event: WechatMiniprogram.Input) {
    formDirty = true;
    this.setData({
      titleInput: event.detail.value,
    });
  },

  updateFlowerCost(event: WechatMiniprogram.Input) {
    formDirty = true;
    this.setData({
      flowerCostInput: event.detail.value,
    });
  },

  decreaseFlowerCost() {
    formDirty = true;
    const flowerCost = parsePositiveInteger(this.data.flowerCostInput) ?? 1;

    this.setData({
      flowerCostInput: String(Math.max(1, flowerCost - 1)),
    });
  },

  increaseFlowerCost() {
    formDirty = true;
    const flowerCost = parsePositiveInteger(this.data.flowerCostInput) ?? 0;

    this.setData({
      flowerCostInput: String(flowerCost + 1),
    });
  },

  updateKind(event: WechatMiniprogram.TouchEvent) {
    formDirty = true;
    const kind = String(event.currentTarget.dataset.kind);

    this.setData({
      kindInput: kind === "repeating" ? "repeating" : "one_time",
    });
  },

  updatePinned(event: WechatMiniprogram.SwitchChange) {
    formDirty = true;
    this.setData({
      pinnedInput: event.detail.value,
    });
  },

  cancel() {
    wx.navigateBack();
  },

  async saveWish() {
    const allowed = await this.requireParentControl("保存心愿需要家长确认。");

    if (!allowed) {
      this.setData({
        message: "已取消家长验证，心愿没有保存。",
      });
      return;
    }

    const flowerCost = parsePositiveInteger(this.data.flowerCostInput);

    if (!this.data.titleInput.trim() || flowerCost === null) {
      this.setData({
        message: "请填写标题和正整数小红花。",
      });
      return;
    }

    this.setData({
      loading: true,
      message: "正在保存心愿。",
    });

    try {
      const input = {
        title: this.data.titleInput,
        flowerCost,
        kind: this.data.kindInput,
        pinned: this.data.pinnedInput,
      };

      if (this.data.wishId) {
        await updateWish(getPrototypeApiConfig(), this.data.wishId, input);
      } else {
        await createWish(getPrototypeApiConfig(), input);
      }

      this.setData({
        loading: false,
        message: "心愿已保存。",
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
