import { domainError, domainOk, type DomainResult } from "./errors";
import { earnRedFlowers, type RedFlowerAccount, type RedFlowerKind } from "./red-flowers";

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

export type UpdateTaskInput = {
  taskId: string;
  title: string;
  flowerValue: number;
  kind: TaskKind;
  updatedAt: string;
};

export type ArchiveTaskInput = {
  taskId: string;
  archivedAt: string;
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
  flowerKind?: RedFlowerKind;
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

export function updateTask(
  taskBook: TaskBook,
  input: UpdateTaskInput,
): DomainResult<{
  taskBook: TaskBook;
  task: Task;
}> {
  const task = taskBook.tasks.find((candidate) => candidate.id === input.taskId);

  if (!task) {
    return domainError("TASK_NOT_FOUND", "Task does not exist.");
  }

  if (task.status === "archived") {
    return domainError("TASK_ALREADY_ARCHIVED", "Task has already been deleted.");
  }

  const title = input.title.trim();

  if (!title || !Number.isInteger(input.flowerValue) || input.flowerValue <= 0) {
    return domainError("INVALID_TASK", "Task title and flower value are required.");
  }

  const updatedTask: Task = {
    ...task,
    title,
    flowerValue: input.flowerValue,
    kind: input.kind,
    updatedAt: input.updatedAt,
  };

  return domainOk({
    taskBook: {
      ...taskBook,
      tasks: taskBook.tasks.map((candidate) =>
        candidate.id === updatedTask.id ? updatedTask : candidate,
      ),
    },
    task: updatedTask,
  });
}

export function archiveTask(
  taskBook: TaskBook,
  input: ArchiveTaskInput,
): DomainResult<{
  taskBook: TaskBook;
  task: Task;
}> {
  const task = taskBook.tasks.find((candidate) => candidate.id === input.taskId);

  if (!task) {
    return domainError("TASK_NOT_FOUND", "Task does not exist.");
  }

  if (task.status === "archived") {
    return domainError("TASK_ALREADY_ARCHIVED", "Task has already been deleted.");
  }

  const archivedTask: Task = {
    ...task,
    status: "archived",
    updatedAt: input.archivedAt,
  };

  return domainOk({
    taskBook: {
      ...taskBook,
      tasks: taskBook.tasks.map((candidate) =>
        candidate.id === archivedTask.id ? archivedTask : candidate,
      ),
    },
    task: archivedTask,
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

  const alreadyCompleted = taskBook.submissions.some(
    (submission) =>
      submission.taskId === task.id &&
      submission.status === "confirmed" &&
      (task.kind === "one_time" || isSameBusinessDay(submission.confirmedAt, input.submittedAt)),
  );

  if (alreadyCompleted) {
    return domainError("TASK_ALREADY_CONFIRMED", "Task has already been completed for this day.");
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

  const task = taskBook.tasks.find((candidate) => candidate.id === submission.taskId);

  if (!task) {
    return domainError("TASK_NOT_FOUND", "Task does not exist.");
  }

  const alreadyCompleted = taskBook.submissions.some(
    (candidate) =>
      candidate.id !== submission.id &&
      candidate.taskId === task.id &&
      candidate.status === "confirmed" &&
      (task.kind === "one_time" || isSameBusinessDay(candidate.confirmedAt, input.confirmedAt)),
  );

  if (alreadyCompleted) {
    return domainError("TASK_ALREADY_CONFIRMED", "Task has already been completed for this day.");
  }

  const confirmedSubmission: TaskSubmission = {
    ...submission,
    status: "confirmed",
    confirmedAt: input.confirmedAt,
  };
  const tasks = taskBook.tasks.map((task) =>
    task.id === submission.taskId && task.kind === "one_time"
      ? {
          ...task,
          status: "archived" as const,
          updatedAt: input.confirmedAt,
        }
      : task,
  );

  return domainOk({
    taskBook: {
      ...taskBook,
      tasks,
      submissions: taskBook.submissions.map((candidate) =>
        candidate.id === submission.id ? confirmedSubmission : candidate,
      ),
    },
    redFlowers: earnRedFlowers(redFlowers, {
      amount: submission.flowerValueSnapshot,
      occurredAt: input.confirmedAt,
      ledgerEntryId: input.ledgerEntryId,
      sourceId: submission.id,
      ...(input.flowerKind ? { flowerKind: input.flowerKind } : {}),
    }),
    submission: confirmedSubmission,
  });
}

export function getBusinessDayKey(value: string): string {
  return new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isSameBusinessDay(left: string | null, right: string): boolean {
  if (!left) {
    return false;
  }

  return getBusinessDayKey(left) === getBusinessDayKey(right);
}
