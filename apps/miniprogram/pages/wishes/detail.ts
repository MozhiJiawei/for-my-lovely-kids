import { loadState, redeemWish, type PrototypeState } from "../../src/api/client";
import { getDefaultApiBaseUrl, prototypeApiTokens } from "../../src/config/api";

type WishDetailData = {
  wishId: string;
  title: string;
  flowerCost: number;
  kindText: string;
  pinnedText: string;
  progress: number;
  availableFlowers: number;
  enough: boolean;
  canRedeem: boolean;
  redemptions: Array<{
    id: string;
    statusText: string;
    timeText: string;
  }>;
  message: string;
  loading: boolean;
};

const apiConfig = {
  baseUrl: getDefaultApiBaseUrl(),
  familyToken: prototypeApiTokens.familyToken,
  parentToken: prototypeApiTokens.parentToken,
};

const initialData: WishDetailData = {
  wishId: "",
  title: "心愿",
  flowerCost: 0,
  kindText: "",
  pinnedText: "",
  progress: 0,
  availableFlowers: 0,
  enough: false,
  canRedeem: false,
  redemptions: [],
  message: "正在读取心愿。",
  loading: false,
};

function formatTime(value: string | null): string {
  if (!value) {
    return "等待实现";
  }

  return value.slice(0, 10);
}

function deriveDataFromState(state: PrototypeState, wishId: string): Partial<WishDetailData> {
  const wish = state.wishBook.wishes.find((candidate) => candidate.id === wishId);
  const availableFlowers = state.redFlowers.balance.available;

  if (!wish) {
    return {
      availableFlowers,
      message: "没有找到这个心愿。",
    };
  }

  return {
    title: wish.title.replace(/^\[测试\]\s*/, ""),
    flowerCost: wish.flowerCost,
    kindText: wish.kind === "repeating" ? "可重复心愿" : "一次性心愿",
    pinnedText: wish.pinned ? "首页置顶" : "按算法展示",
    progress: Math.min(Math.floor((availableFlowers / wish.flowerCost) * 100), 100),
    availableFlowers,
    enough: availableFlowers >= wish.flowerCost,
    canRedeem:
      (wish.status === "active" || wish.status === "test") && availableFlowers >= wish.flowerCost,
    redemptions: state.wishBook.redemptions
      .filter((redemption) => redemption.wishId === wish.id)
      .reverse()
      .map((redemption) => ({
        id: redemption.id,
        statusText: redemption.status === "approved" ? "已实现" : "待批准",
        timeText: formatTime(redemption.approvedAt ?? redemption.requestedAt),
      })),
    message: wish.status === "archived" ? "这个一次性心愿已经实现。" : "心愿详情已准备好。",
  };
}

Page({
  data: initialData,

  onLoad(options: Record<string, string | undefined>) {
    const wishId = decodeURIComponent(options.id ?? "");
    this.setData({
      wishId,
    });
    void this.refreshState();
  },

  async refreshState() {
    this.setData({
      loading: true,
      message: "正在读取心愿。",
    });

    try {
      const state = await loadState(apiConfig);
      this.setData({
        ...deriveDataFromState(state, this.data.wishId),
        loading: false,
      });
    } catch {
      this.setData({
        loading: false,
        message: "暂时读不到这个心愿。",
      });
    }
  },

  async redeemCurrentWish() {
    if (!this.data.wishId || !this.data.canRedeem) {
      this.setData({
        message: this.data.enough ? "这个心愿已经不能兑换了。" : "小红花还不够。",
      });
      return;
    }

    this.setData({
      loading: true,
      message: "正在兑换心愿。",
    });

    try {
      const response = await redeemWish(apiConfig, this.data.wishId);

      this.setData({
        ...deriveDataFromState(response.state, this.data.wishId),
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

  openWishList() {
    wx.switchTab({
      url: "/pages/wishes/index",
    });
  },
});
