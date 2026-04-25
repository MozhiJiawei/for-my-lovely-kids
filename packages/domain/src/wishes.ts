import { domainError, domainOk, type DomainResult } from "./errors";
import { addWishMemorialDecoration, type Garden } from "./garden";
import { spendRedFlowers, type RedFlowerAccount } from "./red-flowers";

export type WishStatus = "active" | "archived" | "test";

export type Wish = {
  id: string;
  title: string;
  flowerCost: number;
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
  createdAt: string;
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
  decorationId: string;
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

  if (!title || !Number.isInteger(input.flowerCost) || input.flowerCost <= 0) {
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
      redemptions: wishBook.redemptions.map((candidate) =>
        candidate.id === redemption.id ? approvedRedemption : candidate,
      ),
    },
    redFlowers: nextRedFlowers.value,
    garden: addWishMemorialDecoration(garden, {
      decorationId: input.decorationId,
      wishRedemptionId: redemption.id,
      createdAt: input.approvedAt,
      cumulativeRedFlowers: nextRedFlowers.value.balance.cumulative,
    }),
    redemption: approvedRedemption,
  });
}
