import { domainError, domainOk, type DomainResult } from "./errors";
import { earnRedFlowers, type RedFlowerAccount } from "./red-flowers";

export type TaskKind = "repeating" | "one_time";

export type TaskStatus = "active" | "archived" | "test";

export type Task = {
  id: string;
  title: string;
  flowerValue: number;
  kind: TaskKind;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
};

export type TaskSubmissionStatus = "pending" | "confirmed";

export type TaskSubmission = {
  id: string;
  taskId: string;
  titleSnapshot: string;
  flowerValueSnapshot: number;
  status: TaskSubmissionStatus;
  submittedAt: string;
  confirmedAt: string | null;
};

export type TaskBook = {
  tasks: Task[];
  submissions: TaskSubmission[];
};

export type CreateTaskInput = {
  taskId: string;
  title: string;
  flowerValue: number;
  kind: TaskKind;
  createdAt: string;
};

export type SubmitTaskInput = {
  taskId: string;
  submissionId: string;
  submittedAt: string;
};

export type ConfirmTaskSubmissionInput = {
  submissionId: string;
  confirmedAt: string;
  ledgerEntryId: string;
};

export type ConfirmTaskSubmissionValue = {
  taskBook: TaskBook;
  redFlowers: RedFlowerAccount;
  submission: TaskSubmission;
};

export function createTask(
  taskBook: TaskBook,
  input: CreateTaskInput,
): DomainResult<{
  taskBook: TaskBook;
  task: Task;
}> {
  const title = input.title.trim();

  if (!title || !Number.isInteger(input.flowerValue) || input.flowerValue <= 0) {
    return domainError("INVALID_TASK", "Task title and flower value are required.");
  }

  const task: Task = {
    id: input.taskId,
    title,
    flowerValue: input.flowerValue,
    kind: input.kind,
    status: "active",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };

  return domainOk({
    taskBook: {
      ...taskBook,
      tasks: [...taskBook.tasks, task],
    },
    task,
  });
}

export function submitTask(
  taskBook: TaskBook,
  input: SubmitTaskInput,
): DomainResult<{
  taskBook: TaskBook;
  submission: TaskSubmission;
}> {
  const task = taskBook.tasks.find((candidate) => candidate.id === input.taskId);

  if (!task) {
    return domainError("TASK_NOT_FOUND", "Task does not exist.");
  }

  if (task.status === "archived") {
    return domainError("TASK_NOT_ACTIVE", "Task is not active.");
  }

  const submission: TaskSubmission = {
    id: input.submissionId,
    taskId: task.id,
    titleSnapshot: task.title,
    flowerValueSnapshot: task.flowerValue,
    status: "pending",
    submittedAt: input.submittedAt,
    confirmedAt: null,
  };

  return domainOk({
    taskBook: {
      ...taskBook,
      submissions: [...taskBook.submissions, submission],
    },
    submission,
  });
}

export function confirmTaskSubmission(
  taskBook: TaskBook,
  redFlowers: RedFlowerAccount,
  input: ConfirmTaskSubmissionInput,
): DomainResult<ConfirmTaskSubmissionValue> {
  const submission = taskBook.submissions.find((candidate) => candidate.id === input.submissionId);

  if (!submission) {
    return domainError("TASK_SUBMISSION_NOT_FOUND", "Task submission does not exist.");
  }

  if (submission.status === "confirmed") {
    return domainError("TASK_ALREADY_CONFIRMED", "Task submission has already been confirmed.");
  }

  const confirmedSubmission: TaskSubmission = {
    ...submission,
    status: "confirmed",
    confirmedAt: input.confirmedAt,
  };

  return domainOk({
    taskBook: {
      ...taskBook,
      submissions: taskBook.submissions.map((candidate) =>
        candidate.id === submission.id ? confirmedSubmission : candidate,
      ),
    },
    redFlowers: earnRedFlowers(redFlowers, {
      amount: submission.flowerValueSnapshot,
      occurredAt: input.confirmedAt,
      ledgerEntryId: input.ledgerEntryId,
      sourceId: submission.id,
    }),
    submission: confirmedSubmission,
  });
}
