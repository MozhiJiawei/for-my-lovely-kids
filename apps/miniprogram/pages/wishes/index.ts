import { deleteWish, loadState, redeemWish, type PrototypeState } from "../../src/api/client";
import { getPrototypeApiConfig } from "../../src/config/api";

type WishKind = "repeating" | "one_time";
type ParentControlPanel = {
  request: (reason: string) => Promise<boolean>;
};

type WishListItem = {
  id: string;
  title: string;
  flowerCost: number;
  kind: WishKind;
  kindText: string;
  pinned: boolean;
  imageUrl: string;
  hasLink: boolean;
  hasDescription: boolean;
  statusText: string;
  enough: boolean;
  deleteOpen: boolean;
};

type WishesData = {
  availableFlowers: number;
  wishes: WishListItem[];
  message: string;
  loading: boolean;
};

const initialData: WishesData = {
  availableFlowers: 0,
  wishes: [],
  message: "把想实现的事先放进心愿篮。",
  loading: false,
};

let latestRefreshRequest = 0;
let touchStartX = 0;
let touchWishId = "";

function kindText(kind: WishKind): string {
  return kind === "repeating" ? "可重复" : "一次性";
}

function activeWishes(state: PrototypeState, currentWishes: WishListItem[]): WishListItem[] {
  const openDeleteIds = new Set(
    currentWishes.filter((wish) => wish.deleteOpen).map((wish) => wish.id),
  );

  return state.wishBook.wishes
    .filter((wish) => wish.status === "active" || wish.status === "test")
    .map((wish) => ({
      id: wish.id,
      title: wish.title.replace(/^\[测试\]\s*/, ""),
      flowerCost: wish.flowerCost,
      kind: wish.kind,
      kindText: kindText(wish.kind),
      pinned: wish.pinned,
      imageUrl: wish.imageUrl,
      hasLink: !!wish.linkUrl,
      hasDescription: !!wish.description,
      statusText: wish.status === "archived" ? "已实现" : "可兑换",
      enough: state.redFlowers.balance.available >= wish.flowerCost,
      deleteOpen: openDeleteIds.has(wish.id),
    }));
}

function deriveDataFromState(
  state: PrototypeState,
  currentWishes: WishListItem[],
): Partial<WishesData> {
  return {
    availableFlowers: state.redFlowers.balance.available,
    wishes: activeWishes(state, currentWishes),
  };
}

function closeDeleteForWishes(wishes: WishListItem[]): WishListItem[] {
  return wishes.map((wish) => ({
    ...wish,
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
      message: "正在读取心愿。",
    });

    try {
      const state = await loadState(getPrototypeApiConfig());

      if (requestId !== latestRefreshRequest) {
        return;
      }

      this.setData({
        ...deriveDataFromState(state, closeDeleteForWishes(this.data.wishes)),
        loading: false,
        message: "心愿已经准备好。",
      });
    } catch {
      if (requestId !== latestRefreshRequest) {
        return;
      }

      this.setData({
        loading: false,
        message: "暂时读不到心愿。",
      });
    }
  },

  noop() {
    return;
  },

  async openCreateEditor() {
    const allowed = await this.requireParentControl("新增或修改心愿需要家长确认。");

    if (!allowed) {
      this.setData({
        message: "已取消家长确认，心愿没有变化。",
      });
      return;
    }

    wx.navigateTo({
      url: "/pages/wishes/edit",
    });
  },

  async editWish(event: WechatMiniprogram.TouchEvent) {
    const wishId = String(event.currentTarget.dataset.id ?? "");

    if (!wishId) {
      return;
    }

    const allowed = await this.requireParentControl("编辑心愿需要家长确认。");

    if (!allowed) {
      this.setData({
        message: "已取消家长确认，心愿没有变化。",
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/wishes/edit?id=${encodeURIComponent(wishId)}`,
    });
  },

  async redeemWish(event: WechatMiniprogram.TouchEvent) {
    const wishId = String(event.currentTarget.dataset.id ?? "");
    const wish = this.data.wishes.find((candidate) => candidate.id === wishId);

    if (!wish) {
      return;
    }

    if (!wish.enough) {
      this.setData({
        message: "小红花还不够，先去花园开花吧。",
      });
      return;
    }

    const allowed = await this.requireParentControl("兑换心愿会花掉小红花，需要家长确认。");

    if (!allowed) {
      this.setData({
        message: "已取消家长确认，心愿没有兑换。",
      });
      return;
    }

    latestRefreshRequest += 1;
    this.setData({
      loading: true,
      message: "正在兑换心愿。",
    });

    try {
      const response = await redeemWish(getPrototypeApiConfig(), wishId);

      this.setData({
        ...deriveDataFromState(response.state, []),
        loading: false,
        message: "心愿实现啦。",
      });
    } catch (error) {
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "兑换失败。",
      });
    }
  },

  touchWishStart(event: WechatMiniprogram.TouchEvent) {
    touchStartX = event.touches[0]?.clientX ?? 0;
    touchWishId = String(event.currentTarget.dataset.id ?? "");
  },

  touchWishEnd(event: WechatMiniprogram.TouchEvent) {
    const endX = event.changedTouches[0]?.clientX ?? touchStartX;
    const deltaX = endX - touchStartX;

    if (!touchWishId || Math.abs(deltaX) < 36) {
      return;
    }

    const shouldOpen = deltaX < 0;
    this.setData({
      wishes: this.data.wishes.map((wish) => ({
        ...wish,
        deleteOpen: wish.id === touchWishId ? shouldOpen : false,
      })),
    });
  },

  closeDeleteActions() {
    this.setData({
      wishes: closeDeleteForWishes(this.data.wishes),
    });
  },

  async deleteWish(event: WechatMiniprogram.TouchEvent) {
    const wishId = String(event.currentTarget.dataset.id ?? "");
    const wish = this.data.wishes.find((candidate) => candidate.id === wishId);

    if (!wish) {
      return;
    }

    const allowed = await this.requireParentControl("删除心愿需要家长确认。");

    if (!allowed) {
      this.setData({
        message: "已取消家长确认，心愿没有变化。",
      });
      return;
    }

    wx.showModal({
      title: "删除心愿",
      content: `删除「${wish.title}」后，历史兑换记录会保留。`,
      confirmText: "删除",
      confirmColor: "#e24b45",
      success: (result) => {
        if (result.confirm) {
          void this.archiveWish(wishId);
        }
      },
    });
  },

  async archiveWish(wishId: string) {
    latestRefreshRequest += 1;
    this.setData({
      loading: true,
      message: "正在删除心愿。",
    });

    try {
      const response = await deleteWish(getPrototypeApiConfig(), wishId);

      this.setData({
        ...deriveDataFromState(response.state, []),
        loading: false,
        message: "心愿已删除，历史记录还在。",
      });
    } catch (error) {
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "删除失败。",
      });
    }
  },

  openDetail(event: WechatMiniprogram.TouchEvent) {
    const wishId = String(event.currentTarget.dataset.id ?? "");

    if (!wishId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/wishes/detail?id=${encodeURIComponent(wishId)}`,
    });
  },

  requireParentControl(reason: string): Promise<boolean> {
    const panel = this.selectComponent("#parentControl") as unknown as ParentControlPanel | null;

    return panel?.request(reason) ?? Promise.resolve(false);
  },
});
