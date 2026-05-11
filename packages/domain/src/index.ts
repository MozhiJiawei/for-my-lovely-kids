export type { ChildProfile, FamilyAccount } from "./account";
export type { DomainError, DomainErrorCode, DomainResult } from "./errors";
export { domainError, domainOk } from "./errors";
export type {
  Garden,
  GardenStage,
  GardenStageName,
  MemorialDecoration,
  MemorialDecorationKind,
} from "./garden";
export { addWishMemorialDecoration, createGarden, getGardenStage } from "./garden";
export type {
  RedFlowerAccount,
  RedFlowerBalance,
  RedFlowerKind,
  RedFlowerLedgerEntry,
  RedFlowerLedgerEntryType,
} from "./red-flowers";
export { createEmptyRedFlowerAccount, earnRedFlowers, spendRedFlowers } from "./red-flowers";
export type {
  ConfirmTaskSubmissionInput,
  ConfirmTaskSubmissionValue,
  ArchiveTaskInput,
  CreateTaskInput,
  SubmitTaskInput,
  Task,
  TaskBook,
  TaskKind,
  TaskStatus,
  TaskSubmission,
  TaskSubmissionStatus,
  UpdateTaskInput,
} from "./tasks";
export {
  archiveTask,
  confirmTaskSubmission,
  createTask,
  getBusinessDayKey,
  submitTask,
  updateTask,
} from "./tasks";
export type {
  ApproveWishRedemptionInput,
  ApproveWishRedemptionValue,
  CreateWishInput,
  RequestWishRedemptionInput,
  UpdateWishInput,
  Wish,
  WishBook,
  WishKind,
  WishRedemption,
  WishRedemptionStatus,
  WishStatus,
} from "./wishes";
export { approveWishRedemption, createWish, requestWishRedemption, updateWish } from "./wishes";

export function getDomainSmokeMessage(): string {
  return "red-flower-domain-ready";
}
