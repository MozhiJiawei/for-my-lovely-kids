export type DomainErrorCode =
  | "INVALID_TASK"
  | "INVALID_WISH"
  | "ACTIVE_WISH_LIMIT_REACHED"
  | "TASK_NOT_FOUND"
  | "TASK_NOT_ACTIVE"
  | "TASK_ALREADY_ARCHIVED"
  | "TASK_SUBMISSION_NOT_FOUND"
  | "TASK_ALREADY_CONFIRMED"
  | "WISH_NOT_FOUND"
  | "WISH_NOT_ACTIVE"
  | "WISH_ALREADY_ARCHIVED"
  | "WISH_REDEMPTION_NOT_FOUND"
  | "WISH_ALREADY_REDEEMED"
  | "WISH_ALREADY_APPROVED"
  | "INSUFFICIENT_RED_FLOWERS";

export type DomainError = {
  code: DomainErrorCode;
  message: string;
};

export type DomainResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: DomainError;
    };

export function domainError(code: DomainErrorCode, message: string): DomainResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

export function domainOk<T>(value: T): DomainResult<T> {
  return {
    ok: true,
    value,
  };
}
