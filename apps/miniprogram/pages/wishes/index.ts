import { loadState, redeemWish, type PrototypeState } from "../../src/api/client";
import { getDefaultApiBaseUrl, prototypeApiTokens } from "../../src/config/api";

type WishKind = "repeating" | "one_time";

type WishListItem = {
  id: string;
  title: string;
  flowerCost: number;
  kind: WishKind;
  kindText: string;
  pinned: boolean;
  statusText: string;
  enough: boolean;
};

type WishesData = {
  availableFlowers: number;
  wishes: WishListItem[];
  message: string;
  loading: boolean;
};

const apiConfig = {
  baseUrl: getDefaultApiBaseUrl(),
  familyToken: prototypeApiTokens.familyToken,
  parentToken: prototypeApiTokens.parentToken,
};

const initialData: WishesData = {
  availableFlowers: 0,
  wishes: [],
  message: "把想实现的事先放进心愿篮。",
  loading: false,
};

let latestRefreshRequest = 0;

function kindText(kind: WishKind): string {
  return kind === "repeating" ? "可重复" : "一次性";
}

function activeWishes(state: PrototypeState): WishListItem[] {
  return state.wishBook.wishes
    .filter((wish) => wish.status === "active" || wish.status === "test")
    .map((wish) => ({
      id: wish.id,
      title: wish.title.replace(/^\[测试\]\s*/, ""),
      flowerCost: wish.flowerCost,
      kind: wish.kind,
      kindText: kindText(wish.kind),
      pinned: wish.pinned,
      statusText: wish.status === "test" ? "测试" : "正式",
      enough: state.redFlowers.balance.available >= wish.flowerCost,
    }));
}

function deriveDataFromState(state: PrototypeState): Partial<WishesData> {
  return {
    availableFlowers: state.redFlowers.balance.available,
    wishes: activeWishes(state),
  };
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
      const state = await loadState(apiConfig);

      if (requestId !== latestRefreshRequest) {
        return;
      }

      this.setData({
        ...deriveDataFromState(state),
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

  openCreateEditor() {
    wx.navigateTo({
      url: "/pages/wishes/edit",
    });
  },

  editWish(event: WechatMiniprogram.TouchEvent) {
    const wishId = String(event.currentTarget.dataset.id ?? "");

    if (!wishId) {
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

    latestRefreshRequest += 1;
    this.setData({
      loading: true,
      message: "正在兑换心愿。",
    });

    try {
      const response = await redeemWish(apiConfig, wishId);

      this.setData({
        ...deriveDataFromState(response.state),
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

  openDetail(event: WechatMiniprogram.TouchEvent) {
    const wishId = String(event.currentTarget.dataset.id ?? "");

    if (!wishId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/wishes/detail?id=${encodeURIComponent(wishId)}`,
    });
  },
});
