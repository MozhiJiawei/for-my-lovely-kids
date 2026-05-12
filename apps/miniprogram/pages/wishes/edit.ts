import {
  createWishImageUploadPolicy,
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
  descriptionInput: string;
  linkUrlInput: string;
  imageUrlInput: string;
  imageUploading: boolean;
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
  descriptionInput: "",
  linkUrlInput: "",
  imageUrlInput: "",
  imageUploading: false,
  modeText: "新增心愿",
  message: "记录心愿的图片、链接和描述，让以后兑现更清楚。",
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
      message: "需要家长确认后才能管理心愿。",
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
        message: "已取消家长确认，不能管理心愿。",
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
        descriptionInput: wish.description,
        linkUrlInput: wish.linkUrl,
        imageUrlInput: wish.imageUrl,
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

  updateDescription(event: WechatMiniprogram.Input) {
    formDirty = true;
    this.setData({
      descriptionInput: event.detail.value,
    });
  },

  updateLinkUrl(event: WechatMiniprogram.Input) {
    formDirty = true;
    this.setData({
      linkUrlInput: event.detail.value,
    });
  },

  updateImageUrl(event: WechatMiniprogram.Input) {
    formDirty = true;
    this.setData({
      imageUrlInput: event.detail.value,
    });
  },

  chooseWishImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (result) => {
        const filePath = result.tempFilePaths[0];

        if (filePath) {
          void this.uploadWishImage(filePath);
        }
      },
    });
  },

  removeWishImage() {
    formDirty = true;
    this.setData({
      imageUrlInput: "",
    });
  },

  async uploadWishImage(filePath: string) {
    formDirty = true;
    this.setData({
      imageUploading: true,
      message: "正在上传心愿图片。",
    });

    try {
      const policy = await createWishImageUploadPolicy(getPrototypeApiConfig(), {
        fileName: filePath,
        contentType: contentTypeForPath(filePath),
      });

      await uploadFile(policy.url, filePath, policy.formData);
      this.setData({
        imageUrlInput: policy.publicUrl,
        imageUploading: false,
        message: "图片已上传。",
      });
    } catch (error) {
      this.setData({
        imageUploading: false,
        message: error instanceof Error ? error.message : "图片上传失败。",
      });
    }
  },

  cancel() {
    wx.navigateBack();
  },

  async saveWish() {
    if (this.data.imageUploading) {
      this.setData({
        message: "图片还在上传，稍等一下再保存。",
      });
      return;
    }

    const allowed = await this.requireParentControl("保存心愿需要家长确认。");

    if (!allowed) {
      this.setData({
        message: "已取消家长确认，心愿没有保存。",
      });
      return;
    }

    const flowerCost = parsePositiveInteger(this.data.flowerCostInput);

    const imageUrl = this.data.imageUrlInput.trim();
    const linkUrl = this.data.linkUrlInput.trim();

    if (!this.data.titleInput.trim() || flowerCost === null) {
      this.setData({
        message: "请填写标题和正整数小红花。",
      });
      return;
    }

    if (!isOptionalHttpUrl(imageUrl) || !isOptionalHttpUrl(linkUrl)) {
      this.setData({
        message: "图片和链接需要以 http:// 或 https:// 开头。",
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
        description: this.data.descriptionInput,
        imageUrl,
        linkUrl,
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

function isOptionalHttpUrl(value: string): boolean {
  return !value || value.startsWith("https://") || value.startsWith("http://");
}

function contentTypeForPath(filePath: string): string {
  const lowerPath = filePath.toLowerCase();

  if (lowerPath.endsWith(".png")) {
    return "image/png";
  }

  if (lowerPath.endsWith(".webp")) {
    return "image/webp";
  }

  if (lowerPath.endsWith(".gif")) {
    return "image/gif";
  }

  return "image/jpeg";
}

function uploadFile(
  url: string,
  filePath: string,
  formData: Record<string, string>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url,
      filePath,
      name: "file",
      formData,
      success: (result) => {
        if (result.statusCode >= 200 && result.statusCode < 300) {
          resolve();
          return;
        }

        reject(new Error("图片上传失败，请稍后再试。"));
      },
      fail: () => {
        reject(new Error("图片上传失败，请检查网络。"));
      },
    });
  });
}
