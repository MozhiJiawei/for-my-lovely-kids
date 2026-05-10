import { domainError, domainOk, type DomainResult } from "./errors";

export type RedFlowerBalance = {
  available: number;
  cumulative: number;
  updatedAt: string;
};

export type RedFlowerLedgerEntryType = "task_confirmed" | "wish_approved";
export type RedFlowerKind = "coral" | "sunny" | "berry" | "sky";

export type RedFlowerLedgerEntry = {
  id: string;
  type: RedFlowerLedgerEntryType;
  deltaAvailable: number;
  deltaCumulative: number;
  flowerKind: RedFlowerKind | null;
  occurredAt: string;
  sourceId: string;
};

export type RedFlowerAccount = {
  balance: RedFlowerBalance;
  ledger: RedFlowerLedgerEntry[];
};

type RedFlowerChangeInput = {
  amount: number;
  occurredAt: string;
  ledgerEntryId: string;
  sourceId: string;
  flowerKind?: RedFlowerKind;
};

export function createEmptyRedFlowerAccount(now: string): RedFlowerAccount {
  return {
    balance: {
      available: 0,
      cumulative: 0,
      updatedAt: now,
    },
    ledger: [],
  };
}

export function earnRedFlowers(
  account: RedFlowerAccount,
  input: RedFlowerChangeInput,
): RedFlowerAccount {
  return {
    balance: {
      available: account.balance.available + input.amount,
      cumulative: account.balance.cumulative + input.amount,
      updatedAt: input.occurredAt,
    },
    ledger: [
      ...account.ledger,
      {
        id: input.ledgerEntryId,
        type: "task_confirmed",
        deltaAvailable: input.amount,
        deltaCumulative: input.amount,
        flowerKind: input.flowerKind ?? "coral",
        occurredAt: input.occurredAt,
        sourceId: input.sourceId,
      },
    ],
  };
}

export function spendRedFlowers(
  account: RedFlowerAccount,
  input: RedFlowerChangeInput,
): DomainResult<RedFlowerAccount> {
  if (account.balance.available < input.amount) {
    return domainError(
      "INSUFFICIENT_RED_FLOWERS",
      "Available red flowers are not enough for this wish.",
    );
  }

  return domainOk({
    balance: {
      available: account.balance.available - input.amount,
      cumulative: account.balance.cumulative,
      updatedAt: input.occurredAt,
    },
    ledger: [
      ...account.ledger,
      {
        id: input.ledgerEntryId,
        type: "wish_approved",
        deltaAvailable: -input.amount,
        deltaCumulative: 0,
        flowerKind: null,
        occurredAt: input.occurredAt,
        sourceId: input.sourceId,
      },
    ],
  });
}
