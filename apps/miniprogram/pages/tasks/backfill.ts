import {
  backfillHabitCheckins,
  backfillHabitCheckin,
  loadState,
  type PrototypeState,
  type TaskState,
} from "../../src/api/client";
import { getPrototypeApiConfig } from "../../src/config/api";

type ParentControlPanel = {
  request: (reason: string) => Promise<boolean>;
};

type CalendarDay = {
  key: string;
  day: number;
  isBlank: boolean;
  isToday: boolean;
  isCompleted: boolean;
  selected: boolean;
  stateClass: string;
};

type BackfillData = {
  taskId: string;
  taskIds: string[];
  title: string;
  flowerValue: number;
  habitCount: number;
  selectedDateKeys: string[];
  selectedCount: number;
  selectedFlowerTotal: number;
  monthLabel: string;
  calendarDays: CalendarDay[];
  canPreviousMonth: boolean;
  canNextMonth: boolean;
  completedDateKeys: string[];
  minDate: string;
  maxDate: string;
  message: string;
  loading: boolean;
  parentControlReady: boolean;
};

type PreviousTaskPage = {
  refreshFromState?: (state: PrototypeState) => void;
};

const initialData: BackfillData = {
  taskId: "",
  taskIds: [],
  title: "习惯打卡",
  flowerValue: 0,
  habitCount: 0,
  selectedDateKeys: [],
  selectedCount: 0,
  selectedFlowerTotal: 0,
  monthLabel: formatMonthLabel(parseDateKey(todayKey())),
  calendarDays: [],
  canPreviousMonth: false,
  canNextMonth: false,
  completedDateKeys: [],
  minDate: oneMonthAgoKey(todayKey()),
  maxDate: previousBusinessDayKey(todayKey()),
  message: "补录最近 1 个月内忘记记录的习惯。",
  loading: false,
  parentControlReady: false,
};

let pendingTaskId = "";
let latestLoadRequest = 0;
let currentMonth = new Date(
  parseDateKey(todayKey()).getFullYear(),
  parseDateKey(todayKey()).getMonth(),
  1,
);

function stripTestPrefix(value: string): string {
  return value.replace(/^\[测试\]\s*/, "");
}

function getBusinessDayKey(value: string): string {
  return new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function todayKey(): string {
  return getBusinessDayKey(new Date().toISOString());
}

function oneMonthAgoKey(key: string): string {
  const [yearText, monthText, dayText] = key.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const targetMonthIndex = month - 2;
  const targetMonthFirst = new Date(Date.UTC(year, targetMonthIndex, 1));
  const targetYear = targetMonthFirst.getUTCFullYear();
  const targetMonth = targetMonthFirst.getUTCMonth();
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, daysInTargetMonth);

  return [
    targetYear,
    `${targetMonth + 1}`.padStart(2, "0"),
    `${targetDay}`.padStart(2, "0"),
  ].join("-");
}

function previousBusinessDayKey(key: string): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);

  return date.toISOString().slice(0, 10);
}

function parseDateKey(key: string): Date {
  const [yearText, monthText, dayText] = key.split("-");

  return new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
}

function keyForLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatMonthLabel(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
}

function buildCalendarDays(
  minDate: string,
  maxDate: string,
  month: Date,
  selectedDateKeys: string[],
  completedDateKeys: string[],
): CalendarDay[] {
  const selected = new Set(selectedDateKeys);
  const completed = new Set(completedDateKeys);
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leadingBlanks = monthStart.getDay();
  const days: CalendarDay[] = [];
  const today = todayKey();

  for (let index = 0; index < leadingBlanks; index += 1) {
    days.push({
      key: `${monthKey(month)}-blank-${index}`,
      day: 0,
      isBlank: true,
      isToday: false,
      isCompleted: false,
      selected: false,
      stateClass: "day-blank",
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = keyForLocalDate(new Date(month.getFullYear(), month.getMonth(), day));
    const inRange = key >= minDate && key <= maxDate;
    const isCompleted = completed.has(key);
    const isSelected = selected.has(key);

    days.push({
      key,
      day,
      isBlank: !inRange,
      isToday: key === today,
      isCompleted,
      selected: isSelected,
      stateClass: [
        !inRange ? "day-blank" : "",
        inRange && !isCompleted ? "day-enabled" : "",
        isCompleted ? "day-disabled day-checkin" : "",
        inRange && key === today ? "day-today" : "",
        isSelected ? "day-selected" : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  return days;
}

function taskFromState(state: PrototypeState, taskId: string): TaskState | undefined {
  return state.taskBook.tasks.find((task) => task.id === taskId);
}

function selectionData(
  minDate: string,
  maxDate: string,
  month: Date,
  flowerValue: number,
  selectedDateKeys: string[],
  completedDateKeys: string[],
): Pick<
  BackfillData,
  | "calendarDays"
  | "monthLabel"
  | "canPreviousMonth"
  | "canNextMonth"
  | "selectedDateKeys"
  | "selectedCount"
  | "selectedFlowerTotal"
> {
  const completed = new Set(completedDateKeys);
  const sortedKeys = [...selectedDateKeys].filter((key) => !completed.has(key)).sort();
  const minMonth = new Date(
    parseDateKey(minDate).getFullYear(),
    parseDateKey(minDate).getMonth(),
    1,
  );
  const maxMonth = new Date(
    parseDateKey(maxDate).getFullYear(),
    parseDateKey(maxDate).getMonth(),
    1,
  );
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);

  return {
    selectedDateKeys: sortedKeys,
    selectedCount: sortedKeys.length,
    selectedFlowerTotal: sortedKeys.length * flowerValue,
    monthLabel: formatMonthLabel(monthStart),
    calendarDays: buildCalendarDays(minDate, maxDate, monthStart, sortedKeys, completedDateKeys),
    canPreviousMonth: monthStart > minMonth,
    canNextMonth: monthStart < maxMonth,
  };
}

function completedDateKeysForHabit(state: PrototypeState, taskId: string): string[] {
  return Array.from(
    new Set(
      state.taskBook.submissions
        .filter(
          (submission) =>
            submission.taskId === taskId &&
            submission.status === "confirmed" &&
            submission.confirmedAt !== null,
        )
        .map((submission) => getBusinessDayKey(submission.confirmedAt!)),
    ),
  ).sort();
}

function completedDateKeysForHabits(state: PrototypeState, taskIds: string[]): string[] {
  const taskIdSet = new Set(taskIds);

  return Array.from(
    new Set(
      state.taskBook.submissions
        .filter(
          (submission) =>
            taskIdSet.has(submission.taskId) &&
            submission.status === "confirmed" &&
            submission.confirmedAt !== null,
        )
        .map((submission) => getBusinessDayKey(submission.confirmedAt!)),
    ),
  ).sort();
}

Page({
  data: initialData,

  onLoad(options: Record<string, string | undefined>) {
    const taskIds = decodeURIComponent(options.ids ?? options.id ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const taskId = taskIds[0] ?? "";
    const maxDate = previousBusinessDayKey(todayKey());
    const minDate = oneMonthAgoKey(maxDate);

    pendingTaskId = taskId;
    currentMonth = new Date(
      parseDateKey(maxDate).getFullYear(),
      parseDateKey(maxDate).getMonth(),
      1,
    );
    this.setData({
      taskId,
      taskIds,
      minDate,
      maxDate,
      ...selectionData(minDate, maxDate, currentMonth, 0, [], []),
      message: "需要家长确认后才能补录习惯打卡。",
    });
  },

  onReady() {
    void this.prepareBackfill(pendingTaskId);
  },

  async prepareBackfill(taskId: string) {
    const allowed = await this.requireParentControl("补录习惯打卡需要家长确认。");

    if (!allowed) {
      this.setData({
        message: "已取消家长确认，不能补录习惯打卡。",
      });
      return;
    }

    this.setData({
      parentControlReady: true,
      message: "正在读取习惯。",
    });

    void this.loadHabit(taskId);
  },

  async loadHabit(taskId: string) {
    const requestId = latestLoadRequest + 1;
    latestLoadRequest = requestId;

    this.setData({
      loading: true,
      message: "正在读取习惯。",
    });

    try {
      const state = await loadState(getPrototypeApiConfig());

      if (requestId !== latestLoadRequest) {
        return;
      }

      const taskIds = this.data.taskIds.length > 0 ? this.data.taskIds : [taskId];
      const habits = taskIds
        .map((id) => taskFromState(state, id))
        .filter((task): task is TaskState => Boolean(task));

      if (
        habits.length !== taskIds.length ||
        habits.some((task) => task.kind !== "repeating" || task.status === "archived")
      ) {
        this.setData({
          loading: false,
          message: "没有找到可以补录的习惯。",
        });
        return;
      }

      const completedDateKeys =
        taskIds.length === 1
          ? completedDateKeysForHabit(state, taskIds[0]!)
          : completedDateKeysForHabits(state, taskIds);
      const flowerValue = habits.reduce((sum, task) => sum + task.flowerValue, 0);

      this.setData({
        loading: false,
        title:
          habits.length === 1
            ? stripTestPrefix(habits[0]!.title)
            : `${habits.length} 个习惯批量补录`,
        flowerValue,
        habitCount: habits.length,
        completedDateKeys,
        ...selectionData(
          this.data.minDate,
          this.data.maxDate,
          currentMonth,
          flowerValue,
          [],
          completedDateKeys,
        ),
        message: "选择漏打卡的日期，保存后会补上小红花。",
      });
    } catch {
      if (requestId !== latestLoadRequest) {
        return;
      }

      this.setData({
        loading: false,
        message: "暂时读不到这个习惯。",
      });
    }
  },

  toggleDate(event: WechatMiniprogram.TouchEvent) {
    const key = String(event.currentTarget.dataset.key ?? "");

    if (
      !key ||
      key < this.data.minDate ||
      key > this.data.maxDate ||
      this.data.completedDateKeys.includes(key)
    ) {
      return;
    }

    const selected = new Set(this.data.selectedDateKeys);

    if (selected.has(key)) {
      selected.delete(key);
    } else {
      selected.add(key);
    }

    this.setData({
      ...selectionData(
        this.data.minDate,
        this.data.maxDate,
        currentMonth,
        this.data.flowerValue,
        Array.from(selected),
        this.data.completedDateKeys,
      ),
    });
  },

  previousMonth() {
    if (!this.data.canPreviousMonth) {
      return;
    }

    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    this.setData({
      ...selectionData(
        this.data.minDate,
        this.data.maxDate,
        currentMonth,
        this.data.flowerValue,
        this.data.selectedDateKeys,
        this.data.completedDateKeys,
      ),
    });
  },

  nextMonth() {
    if (!this.data.canNextMonth) {
      return;
    }

    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    this.setData({
      ...selectionData(
        this.data.minDate,
        this.data.maxDate,
        currentMonth,
        this.data.flowerValue,
        this.data.selectedDateKeys,
        this.data.completedDateKeys,
      ),
    });
  },

  cancel() {
    wx.navigateBack();
  },

  async saveBackfill() {
    if (this.data.selectedDateKeys.length === 0) {
      this.setData({
        message: "请先选择要补录的日期。",
      });
      return;
    }

    const allowed = await this.requireParentControl("保存补录打卡需要家长确认。");

    if (!allowed) {
      this.setData({
        message: "已取消家长确认，习惯打卡没有补录。",
      });
      return;
    }

    this.setData({
      loading: true,
      message: `正在补录 ${this.data.selectedDateKeys.length} 天习惯打卡。`,
    });

    try {
      let latestState: PrototypeState | null = null;

      if (this.data.taskIds.length > 1) {
        const response = await backfillHabitCheckins(getPrototypeApiConfig(), {
          taskIds: this.data.taskIds,
          completionDates: this.data.selectedDateKeys,
        });
        latestState = response.state;
      } else {
        for (const completionDate of this.data.selectedDateKeys) {
          const response = await backfillHabitCheckin(getPrototypeApiConfig(), {
            taskId: this.data.taskId,
            completionDate,
          });
          latestState = response.state;
        }
      }

      const pages = getCurrentPages();
      const previousPage = pages[pages.length - 2] as PreviousTaskPage | undefined;
      if (latestState) {
        previousPage?.refreshFromState?.(latestState);
      }

      this.setData({
        loading: false,
        message: "习惯打卡已补录。",
      });

      wx.navigateBack();
    } catch (error) {
      this.setData({
        loading: false,
        message: error instanceof Error ? error.message : "补录失败。",
      });
    }
  },

  requireParentControl(reason: string): Promise<boolean> {
    const panel = this.selectComponent("#parentControl") as unknown as ParentControlPanel | null;

    return panel?.request(reason) ?? Promise.resolve(false);
  },
});
