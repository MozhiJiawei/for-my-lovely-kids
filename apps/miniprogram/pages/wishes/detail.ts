import { loadState, redeemWish, type PrototypeState } from "../../src/api/client";
import { getPrototypeApiConfig } from "../../src/config/api";

type ParentControlPanel = {
  request: (reason: string) => Promise<boolean>;
};

type WishDetailData = {
  wishId: string;
  title: string;
  flowerCost: number;
  kindText: string;
  pinnedText: string;
  description: string;
  imageUrl: string;
  linkUrl: string;
  readonly: boolean;
  progress: number;
  availableFlowers: number;
  enough: boolean;
  canRedeem: boolean;
  message: string;
  loading: boolean;
};

const initialData: WishDetailData = {
  wishId: "",
  title: "心愿",
  flowerCost: 0,
  kindText: "",
  pinnedText: "",
  description: "",
  imageUrl: "",
  linkUrl: "",
  readonly: false,
  progress: 0,
  availableFlowers: 0,
  enough: false,
  canRedeem: false,
  message: "正在读取心愿。",
  loading: false,
};

function deriveDataFromState(
  state: PrototypeState,
  wishId: string,
  readonly: boolean,
): Partial<WishDetailData> {
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
    description: wish.description,
    imageUrl: wish.imageUrl,
    linkUrl: wish.linkUrl,
    progress: Math.min(Math.floor((availableFlowers / wish.flowerCost) * 100), 100),
    availableFlowers,
    enough: availableFlowers >= wish.flowerCost,
    canRedeem:
      !readonly &&
      (wish.status === "active" || wish.status === "test") &&
      availableFlowers >= wish.flowerCost,
    message: wish.status === "archived" ? "这个一次性心愿已经实现。" : "心愿详情已准备好。",
  };
}

Page({
  data: initialData,

  onLoad(options: Record<string, string | undefined>) {
    const wishId = decodeURIComponent(options.id ?? "");
    this.setData({
      wishId,
      readonly: options.readonly === "1",
    });
    void this.refreshState();
  },

  async refreshState() {
    this.setData({
      loading: true,
      message: "正在读取心愿。",
    });

    try {
      const state = await loadState(getPrototypeApiConfig());
      this.setData({
        ...deriveDataFromState(state, this.data.wishId, this.data.readonly),
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
    if (this.data.readonly) {
      return;
    }

    if (!this.data.wishId || !this.data.canRedeem) {
      this.setData({
        message: this.data.enough ? "这个心愿已经不能兑换了。" : "小红花还不够。",
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

    this.setData({
      loading: true,
      message: "正在兑换心愿。",
    });

    try {
      const response = await redeemWish(getPrototypeApiConfig(), this.data.wishId);

      this.setData({
        ...deriveDataFromState(response.state, this.data.wishId, this.data.readonly),
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

  editWish() {
    if (!this.data.wishId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/wishes/edit?id=${encodeURIComponent(this.data.wishId)}`,
    });
  },

  copyWishLink() {
    if (!this.data.linkUrl) {
      return;
    }

    wx.setClipboardData({
      data: this.data.linkUrl,
      success: () => {
        this.setData({
          message: "链接已复制。",
        });
      },
    });
  },

  requireParentControl(reason: string): Promise<boolean> {
    const panel = this.selectComponent("#parentControl") as unknown as ParentControlPanel | null;

    return panel?.request(reason) ?? Promise.resolve(false);
  },
});
