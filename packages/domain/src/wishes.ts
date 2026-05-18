import { domainError, domainOk, type DomainResult } from "./errors";
import type { Garden } from "./garden";
import { spendRedFlowers, type RedFlowerAccount } from "./red-flowers";

export type WishStatus = "active" | "archived" | "test";
export type WishKind = "repeating" | "one_time";

export type Wish = {
  id: string;
  title: string;
  flowerCost: number;
  kind: WishKind;
  pinned: boolean;
  description: string;
  imageUrl: string;
  linkUrl: string;
  status: WishStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type WishRedemptionStatus = "pending" | "approved";

export type WishRedemption = {
  id: string;
  wishId: string;
  titleSnapshot: string;
  flowerCostSnapshot: number;
  status: WishRedemptionStatus;
  requestedAt: string;
  approvedAt: string | null;
};

export type WishBook = {
  wishes: Wish[];
  redemptions: WishRedemption[];
};

export type CreateWishInput = {
  wishId: string;
  title: string;
  flowerCost: number;
  kind: WishKind;
  pinned: boolean;
  description?: string;
  imageUrl?: string;
  linkUrl?: string;
  createdAt: string;
};

export type UpdateWishInput = {
  wishId: string;
  title: string;
  flowerCost: number;
  kind: WishKind;
  pinned: boolean;
  description?: string;
  imageUrl?: string;
  linkUrl?: string;
  updatedAt: string;
};

export type ArchiveWishInput = {
  wishId: string;
  archivedAt: string;
};

export type RequestWishRedemptionInput = {
  wishId: string;
  redemptionId: string;
  requestedAt: string;
};

export type ApproveWishRedemptionInput = {
  redemptionId: string;
  approvedAt: string;
  ledgerEntryId: string;
};

export type ApproveWishRedemptionValue = {
  wishBook: WishBook;
  redFlowers: RedFlowerAccount;
  garden: Garden;
  redemption: WishRedemption;
};

export function createWish(
  wishBook: WishBook,
  input: CreateWishInput,
): DomainResult<{
  wishBook: WishBook;
  wish: Wish;
}> {
  const title = input.title.trim();

  const detail = normalizeWishDetail(input);

  if (!title || !detail.ok || !isValidWishCore(input.flowerCost, input.kind)) {
    return domainError("INVALID_WISH", "Wish title and flower cost are required.");
  }

  const activeWishCount = wishBook.wishes.filter((wish) => wish.status === "active").length;

  if (activeWishCount >= 3) {
    return domainError("ACTIVE_WISH_LIMIT_REACHED", "Only three active wishes are allowed.");
  }

  const wish: Wish = {
    id: input.wishId,
    title,
    flowerCost: input.flowerCost,
    kind: input.kind,
    pinned: input.pinned,
    description: detail.value.description,
    imageUrl: detail.value.imageUrl,
    linkUrl: detail.value.linkUrl,
    status: "active",
    sortOrder: activeWishCount + 1,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };

  return domainOk({
    wishBook: {
      ...wishBook,
      wishes: [...wishBook.wishes, wish],
    },
    wish,
  });
}

export function updateWish(
  wishBook: WishBook,
  input: UpdateWishInput,
): DomainResult<{
  wishBook: WishBook;
  wish: Wish;
}> {
  const title = input.title.trim();
  const wish = wishBook.wishes.find((candidate) => candidate.id === input.wishId);

  if (!wish) {
    return domainError("WISH_NOT_FOUND", "Wish does not exist.");
  }

  const detail = normalizeWishDetail(input);

  if (!title || !detail.ok || !isValidWishCore(input.flowerCost, input.kind)) {
    return domainError("INVALID_WISH", "Wish title and flower cost are required.");
  }

  const updatedWish: Wish = {
    ...wish,
    title,
    flowerCost: input.flowerCost,
    kind: input.kind,
    pinned: input.pinned,
    description: detail.value.description,
    imageUrl: detail.value.imageUrl,
    linkUrl: detail.value.linkUrl,
    updatedAt: input.updatedAt,
  };

  return domainOk({
    wishBook: {
      ...wishBook,
      wishes: wishBook.wishes.map((candidate) =>
        candidate.id === updatedWish.id ? updatedWish : candidate,
      ),
    },
    wish: updatedWish,
  });
}

export function archiveWish(
  wishBook: WishBook,
  input: ArchiveWishInput,
): DomainResult<{
  wishBook: WishBook;
  wish: Wish;
}> {
  const wish = wishBook.wishes.find((candidate) => candidate.id === input.wishId);

  if (!wish) {
    return domainError("WISH_NOT_FOUND", "Wish does not exist.");
  }

  if (wish.status === "archived") {
    return domainError("WISH_ALREADY_ARCHIVED", "Wish has already been deleted.");
  }

  const archivedWish: Wish = {
    ...wish,
    pinned: false,
    status: "archived",
    updatedAt: input.archivedAt,
  };

  return domainOk({
    wishBook: {
      ...wishBook,
      wishes: wishBook.wishes.map((candidate) =>
        candidate.id === archivedWish.id ? archivedWish : candidate,
      ),
    },
    wish: archivedWish,
  });
}

export function requestWishRedemption(
  wishBook: WishBook,
  input: RequestWishRedemptionInput,
): DomainResult<{
  wishBook: WishBook;
  redemption: WishRedemption;
}> {
  const wish = wishBook.wishes.find((candidate) => candidate.id === input.wishId);

  if (!wish) {
    return domainError("WISH_NOT_FOUND", "Wish does not exist.");
  }

  if (wish.status === "archived") {
    return domainError("WISH_NOT_ACTIVE", "Wish is not active.");
  }

  if (wish.kind === "one_time" && hasExistingRedemptionForWish(wishBook, wish.id)) {
    return domainError("WISH_ALREADY_REDEEMED", "One-time wish has already been redeemed.");
  }

  const redemption: WishRedemption = {
    id: input.redemptionId,
    wishId: wish.id,
    titleSnapshot: wish.title,
    flowerCostSnapshot: wish.flowerCost,
    status: "pending",
    requestedAt: input.requestedAt,
    approvedAt: null,
  };

  return domainOk({
    wishBook: {
      ...wishBook,
      redemptions: [...wishBook.redemptions, redemption],
    },
    redemption,
  });
}

export function approveWishRedemption(
  wishBook: WishBook,
  redFlowers: RedFlowerAccount,
  garden: Garden,
  input: ApproveWishRedemptionInput,
): DomainResult<ApproveWishRedemptionValue> {
  const redemption = wishBook.redemptions.find((candidate) => candidate.id === input.redemptionId);

  if (!redemption) {
    return domainError("WISH_REDEMPTION_NOT_FOUND", "Wish redemption does not exist.");
  }

  if (redemption.status === "approved") {
    return domainError("WISH_ALREADY_APPROVED", "Wish redemption has already been approved.");
  }

  const approvedWish = wishBook.wishes.find((candidate) => candidate.id === redemption.wishId);

  if (!approvedWish) {
    return domainError("WISH_NOT_FOUND", "Wish does not exist.");
  }

  if (approvedWish.status === "archived") {
    return domainError("WISH_NOT_ACTIVE", "Wish is not active.");
  }

  if (
    approvedWish.kind === "one_time" &&
    wishBook.redemptions.some(
      (candidate) =>
        candidate.id !== redemption.id &&
        candidate.wishId === approvedWish.id &&
        candidate.status === "approved",
    )
  ) {
    return domainError("WISH_ALREADY_REDEEMED", "One-time wish has already been redeemed.");
  }

  const nextRedFlowers = spendRedFlowers(redFlowers, {
    amount: redemption.flowerCostSnapshot,
    occurredAt: input.approvedAt,
    ledgerEntryId: input.ledgerEntryId,
    sourceId: redemption.id,
  });

  if (!nextRedFlowers.ok) {
    return nextRedFlowers;
  }

  const approvedRedemption: WishRedemption = {
    ...redemption,
    status: "approved",
    approvedAt: input.approvedAt,
  };

  return domainOk({
    wishBook: {
      ...wishBook,
      wishes: approvedWish
        ? wishBook.wishes.map((candidate) =>
            candidate.id === approvedWish.id && approvedWish.kind === "one_time"
              ? { ...candidate, status: "archived", pinned: false, updatedAt: input.approvedAt }
              : candidate,
          )
        : wishBook.wishes,
      redemptions: wishBook.redemptions.map((candidate) =>
        candidate.id === redemption.id ? approvedRedemption : candidate,
      ),
    },
    redFlowers: nextRedFlowers.value,
    garden,
    redemption: approvedRedemption,
  });
}

function isWishKind(value: string): value is WishKind {
  return value === "repeating" || value === "one_time";
}

function isValidWishCore(flowerCost: number, kind: string): kind is WishKind {
  return Number.isInteger(flowerCost) && flowerCost > 0 && isWishKind(kind);
}

function normalizeWishDetail(input: {
  description?: string;
  imageUrl?: string;
  linkUrl?: string;
}):
  | { ok: true; value: { description: string; imageUrl: string; linkUrl: string } }
  | { ok: false } {
  const description = (input.description ?? "").trim();
  const imageUrl = (input.imageUrl ?? "").trim();
  const linkUrl = (input.linkUrl ?? "").trim();

  if (description.length > 1000 || !isOptionalHttpUrl(imageUrl) || !isOptionalHttpUrl(linkUrl)) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      description,
      imageUrl,
      linkUrl,
    },
  };
}

function isOptionalHttpUrl(value: string): boolean {
  return !value || value.startsWith("https://") || value.startsWith("http://");
}

function hasExistingRedemptionForWish(wishBook: WishBook, wishId: string): boolean {
  return wishBook.redemptions.some(
    (redemption) =>
      redemption.wishId === wishId &&
      (redemption.status === "pending" || redemption.status === "approved"),
  );
}
