import { loadState, type PrototypeState, type TaskState } from "../../src/api/client";
import { getPrototypeApiConfig } from "../../src/config/api";

type CalendarDay = {
  key: string;
  day: number;
  isBlank: boolean;
  isToday: boolean;
  isSelected: boolean;
  hasCheckin: boolean;
  hasGoalAchievement: boolean;
  hasWishRedemption: boolean;
  statusClass: string;
};

type HabitFilter = {
  id: string;
  title: string;
  active: boolean;
};

type DetailItem = {
  id: string;
  title: string;
  meta: string;
  kindText: string;
  typeClass: string;
};

type HistoryData = {
  totalFlowers: number;
  monthFlowers: number;
  todayFlowers: number;
  monthLabel: string;
  selectedDateLabel: string;
  selectedDateFlowers: number;
  selectedDateSpent: number;
  selectedDateHabits: number;
  selectedDateGoals: number;
  selectedDateWishes: number;
  calendarDays: CalendarDay[];
  habitFilters: HabitFilter[];
  matchedHabitFilters: HabitFilter[];
  habitQuery: string;
  habitFilterOpen: boolean;
  draftHabitId: string;
  selectedHabitTitle: string;
  selectedHabitId: string;
  details: DetailItem[];
  message: string;
  loading: boolean;
};

const todayDate = new Date();
const allHabitsId = "all";

const initialData: HistoryData = {
  totalFlowers: 0,
  monthFlowers: 0,
  todayFlowers: 0,
  monthLabel: "",
  selectedDateLabel: "",
  selectedDateFlowers: 0,
  selectedDateSpent: 0,
  selectedDateHabits: 0,
  selectedDateGoals: 0,
  selectedDateWishes: 0,
  calendarDays: [],
  habitFilters: [],
  matchedHabitFilters: [],
  habitQuery: "",
  habitFilterOpen: false,
  draftHabitId: allHabitsId,
  selectedHabitTitle: "全部习惯",
  selectedHabitId: allHabitsId,
  details: [],
  message: "正在读取历史。",
  loading: false,
};

let latestRefreshRequest = 0;
let currentMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
let selectedDateKey = getBusinessDayKey(todayDate.toISOString());
let latestState: PrototypeState | null = null;

function stripTestPrefix(value: string): string {
  return value.replace(/^\[测试\]\s*/, "");
}

function getBusinessDayKey(value: string): string {
  return new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function keyForLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(key: string): string {
  const [year, month, day] = key.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function formatMonthLabel(month: Date): string {
  return `${month.getFullYear()}年${month.getMonth() + 1}月`;
}

function monthKey(month: Date): string {
  return `${month.getFullYear()}-${`${month.getMonth() + 1}`.padStart(2, "0")}`;
}

function habitsFromState(state: PrototypeState): TaskState[] {
  const submittedHabitIds = new Set(
    state.taskBook.submissions.map((submission) => submission.taskId),
  );

  return state.taskBook.tasks.filter(
    (task) =>
      task.kind === "repeating" &&
      (task.status === "active" || task.status === "test" || submittedHabitIds.has(task.id)),
  );
}

function habitFiltersFromState(state: PrototypeState, selectedHabitId: string): HabitFilter[] {
  const habits = habitsFromState(state);

  return [
    {
      id: allHabitsId,
      title: "全部习惯",
      active: selectedHabitId === allHabitsId,
    },
    ...habits.map((habit) => ({
      id: habit.id,
      title: stripTestPrefix(habit.title),
      active: selectedHabitId === habit.id,
    })),
  ];
}

function matchedHabitFilters(filters: HabitFilter[], query: string): HabitFilter[] {
  const keyword = query.trim().toLowerCase();

  if (!keyword) {
    return filters;
  }

  return filters.filter(
    (habit) => habit.id === allHabitsId || habit.title.toLowerCase().includes(keyword),
  );
}

function selectedHabitSubmissions(state: PrototypeState, selectedHabitId: string): Set<string> {
  if (selectedHabitId === allHabitsId) {
    return new Set<string>();
  }

  return new Set(
    state.taskBook.submissions
      .filter(
        (submission) =>
          submission.taskId === selectedHabitId &&
          submission.status === "confirmed" &&
          submission.confirmedAt !== null,
      )
      .map((submission) => getBusinessDayKey(submission.confirmedAt!)),
  );
}

function checkinDateKeys(state: PrototypeState, selectedHabitId: string): Set<string> {
  if (selectedHabitId !== allHabitsId) {
    return selectedHabitSubmissions(state, selectedHabitId);
  }

  const taskKinds = new Map(state.taskBook.tasks.map((task) => [task.id, task.kind]));

  return new Set(
    state.taskBook.submissions
      .filter((submission) => submission.status === "confirmed" && submission.confirmedAt !== null)
      .filter((submission) => taskKinds.get(submission.taskId) === "repeating")
      .map((submission) => getBusinessDayKey(submission.confirmedAt!)),
  );
}

function goalAchievementDateKeys(state: PrototypeState): Set<string> {
  const taskKinds = new Map(state.taskBook.tasks.map((task) => [task.id, task.kind]));

  return new Set(
    state.taskBook.submissions
      .filter((submission) => submission.status === "confirmed" && submission.confirmedAt !== null)
      .filter((submission) => taskKinds.get(submission.taskId) === "one_time")
      .map((submission) => getBusinessDayKey(submission.confirmedAt!)),
  );
}

function wishRedemptionDateKeys(state: PrototypeState): Set<string> {
  return new Set(
    state.wishBook.redemptions
      .filter((redemption) => redemption.status === "approved" && redemption.approvedAt !== null)
      .map((redemption) => getBusinessDayKey(redemption.approvedAt!)),
  );
}

function calendarDaysFromState(
  state: PrototypeState,
  month: Date,
  selectedKey: string,
  selectedHabitId: string,
  showGlobalEvents: boolean,
): CalendarDay[] {
  const todayKey = getBusinessDayKey(new Date().toISOString());
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leadingBlanks = firstDay.getDay();
  const checkinKeys = checkinDateKeys(state, selectedHabitId);
  const goalKeys = goalAchievementDateKeys(state);
  const wishKeys = wishRedemptionDateKeys(state);
  const days: CalendarDay[] = [];

  for (let index = 0; index < leadingBlanks; index += 1) {
    days.push({
      key: `blank-${index}`,
      day: 0,
      isBlank: true,
      isToday: false,
      isSelected: false,
      hasCheckin: false,
      hasGoalAchievement: false,
      hasWishRedemption: false,
      statusClass: "day-blank",
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = keyForLocalDate(new Date(month.getFullYear(), month.getMonth(), day));
    const hasCheckin = checkinKeys.has(key);
    const hasGoalAchievement = showGlobalEvents && goalKeys.has(key);
    const hasWishRedemption = showGlobalEvents && wishKeys.has(key);
    const isSelected = key === selectedKey;
    const isToday = key === todayKey;

    days.push({
      key,
      day,
      isBlank: false,
      isToday,
      isSelected,
      hasCheckin,
      hasGoalAchievement,
      hasWishRedemption,
      statusClass: [
        isSelected ? "day-selected" : "",
        isToday ? "day-today" : "",
        hasCheckin ? "day-checkin" : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  return days;
}

function monthFlowers(state: PrototypeState, month: Date): number {
  const key = monthKey(month);

  return state.redFlowers.ledger
    .filter(
      (entry) =>
        entry.type === "task_confirmed" && getBusinessDayKey(entry.occurredAt).startsWith(key),
    )
    .reduce((sum, entry) => sum + entry.deltaCumulative, 0);
}

function dayFlowers(state: PrototypeState, key: string): number {
  return state.redFlowers.ledger
    .filter(
      (entry) => entry.type === "task_confirmed" && getBusinessDayKey(entry.occurredAt) === key,
    )
    .reduce((sum, entry) => sum + entry.deltaCumulative, 0);
}

function dayHabitFlowers(state: PrototypeState, key: string, selectedHabitId: string): number {
  return state.taskBook.submissions
    .filter(
      (submission) =>
        submission.status === "confirmed" &&
        submission.confirmedAt !== null &&
        getBusinessDayKey(submission.confirmedAt) === key &&
        submission.taskId === selectedHabitId,
    )
    .reduce((sum, submission) => sum + submission.flowerValueSnapshot, 0);
}

function dayHabitCount(state: PrototypeState, key: string, selectedHabitId: string): number {
  const taskKinds = new Map(state.taskBook.tasks.map((task) => [task.id, task.kind]));

  return state.taskBook.submissions.filter(
    (submission) =>
      submission.status === "confirmed" &&
      submission.confirmedAt !== null &&
      getBusinessDayKey(submission.confirmedAt) === key &&
      taskKinds.get(submission.taskId) === "repeating" &&
      (selectedHabitId === allHabitsId || submission.taskId === selectedHabitId),
  ).length;
}

function dayGoalCount(state: PrototypeState, key: string): number {
  const taskKinds = new Map(state.taskBook.tasks.map((task) => [task.id, task.kind]));

  return state.taskBook.submissions.filter(
    (submission) =>
      submission.status === "confirmed" &&
      submission.confirmedAt !== null &&
      getBusinessDayKey(submission.confirmedAt) === key &&
      taskKinds.get(submission.taskId) === "one_time",
  ).length;
}

function daySpent(state: PrototypeState, key: string): number {
  return state.redFlowers.ledger
    .filter(
      (entry) => entry.type === "wish_approved" && getBusinessDayKey(entry.occurredAt) === key,
    )
    .reduce((sum, entry) => sum + Math.abs(entry.deltaAvailable), 0);
}

function dayWishCount(state: PrototypeState, key: string): number {
  return state.wishBook.redemptions.filter(
    (redemption) =>
      redemption.status === "approved" &&
      redemption.approvedAt !== null &&
      getBusinessDayKey(redemption.approvedAt) === key,
  ).length;
}

function detailItems(state: PrototypeState, key: string, selectedHabitId: string): DetailItem[] {
  const tasksById = new Map(state.taskBook.tasks.map((task) => [task.id, task]));
  const taskItems = state.taskBook.submissions
    .filter(
      (submission) =>
        submission.status === "confirmed" &&
        submission.confirmedAt !== null &&
        getBusinessDayKey(submission.confirmedAt) === key &&
        (selectedHabitId === allHabitsId || submission.taskId === selectedHabitId),
    )
    .map((submission) => {
      const taskKind = tasksById.get(submission.taskId)?.kind;

      return {
        id: submission.id,
        title: stripTestPrefix(submission.titleSnapshot),
        meta: `+${submission.flowerValueSnapshot} 朵 · ${submission.confirmedAt!.slice(11, 16)}`,
        kindText: taskKind === "one_time" ? "目标达成" : "习惯打卡",
        typeClass: taskKind === "one_time" ? "detail-goal" : "detail-habit",
      };
    });

  if (selectedHabitId !== allHabitsId) {
    return taskItems;
  }

  const wishItems = state.wishBook.redemptions
    .filter(
      (redemption) =>
        redemption.status === "approved" &&
        redemption.approvedAt !== null &&
        getBusinessDayKey(redemption.approvedAt) === key,
    )
    .map((redemption) => ({
      id: redemption.id,
      title: stripTestPrefix(redemption.titleSnapshot),
      meta: `-${redemption.flowerCostSnapshot} 朵 · ${redemption.approvedAt!.slice(11, 16)}`,
      kindText: "心愿兑换",
      typeClass: "detail-wish",
    }));

  return [...taskItems, ...wishItems];
}

function buildData(
  state: PrototypeState,
  selectedHabitId: string,
  month: Date,
  selectedKey: string,
  habitQuery: string,
): Partial<HistoryData> {
  const validHabitId =
    selectedHabitId === allHabitsId ||
    habitsFromState(state).some((habit) => habit.id === selectedHabitId)
      ? selectedHabitId
      : allHabitsId;
  const todayKey = getBusinessDayKey(new Date().toISOString());
  const habitFilters = habitFiltersFromState(state, validHabitId);
  const activeHabit = habitFilters.find((habit) => habit.id === validHabitId);
  const isAllHabits = validHabitId === allHabitsId;

  return {
    totalFlowers: state.redFlowers.balance.cumulative,
    monthFlowers: monthFlowers(state, month),
    todayFlowers: dayFlowers(state, todayKey),
    monthLabel: formatMonthLabel(month),
    selectedDateLabel: formatDateLabel(selectedKey),
    selectedDateFlowers: isAllHabits
      ? dayFlowers(state, selectedKey)
      : dayHabitFlowers(state, selectedKey, validHabitId),
    selectedDateSpent: isAllHabits ? daySpent(state, selectedKey) : 0,
    selectedDateHabits: dayHabitCount(state, selectedKey, validHabitId),
    selectedDateGoals: isAllHabits ? dayGoalCount(state, selectedKey) : 0,
    selectedDateWishes: isAllHabits ? dayWishCount(state, selectedKey) : 0,
    calendarDays: calendarDaysFromState(state, month, selectedKey, validHabitId, isAllHabits),
    habitFilters,
    matchedHabitFilters: matchedHabitFilters(habitFilters, habitQuery),
    habitQuery,
    draftHabitId: validHabitId,
    selectedHabitTitle: activeHabit?.title ?? "全部习惯",
    selectedHabitId: validHabitId,
    details: detailItems(state, selectedKey, validHabitId),
  };
}

Page({
  data: initialData,

  onShow() {
    void this.refreshState();
  },

  async refreshState() {
    const requestId = latestRefreshRequest + 1;
    latestRefreshRequest = requestId;

    this.setData({
      loading: true,
      message: "正在读取统计。",
    });

    try {
      const state = await loadState(getPrototypeApiConfig());

      if (requestId !== latestRefreshRequest) {
        return;
      }

      latestState = state;
      this.setData({
        ...buildData(
          state,
          this.data.selectedHabitId,
          currentMonth,
          selectedDateKey,
          this.data.habitQuery,
        ),
        loading: false,
        message: "统计已经准备好。",
      });
    } catch {
      if (requestId !== latestRefreshRequest) {
        return;
      }

      this.setData({
        loading: false,
        message: "暂时读不到统计。",
      });
    }
  },

  previousMonth() {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    selectedDateKey = keyForLocalDate(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1),
    );
    this.refreshFromLatestState();
  },

  nextMonth() {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    selectedDateKey = keyForLocalDate(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1),
    );
    this.refreshFromLatestState();
  },

  selectDate(event: WechatMiniprogram.TouchEvent) {
    const key = String(event.currentTarget.dataset.key ?? "");

    if (!key || key.startsWith("blank-")) {
      return;
    }

    selectedDateKey = key;
    this.refreshFromLatestState();
  },

  inputHabitKeyword(event: WechatMiniprogram.Input) {
    const habitQuery = String(event.detail.value ?? "");

    this.setData({
      habitQuery,
      matchedHabitFilters: matchedHabitFilters(this.data.habitFilters, habitQuery),
    });
  },

  openHabitFilter() {
    this.setData({
      habitFilterOpen: true,
      draftHabitId: this.data.selectedHabitId,
      matchedHabitFilters: matchedHabitFilters(this.data.habitFilters, this.data.habitQuery),
    });
  },

  chooseDraftHabit(event: WechatMiniprogram.TouchEvent) {
    const habitId = String(event.currentTarget.dataset.id ?? allHabitsId);

    this.setData({
      draftHabitId: habitId,
    });
  },

  selectHabit(event: WechatMiniprogram.TouchEvent) {
    const habitId = String(event.currentTarget.dataset.id ?? allHabitsId);

    this.setData({
      selectedHabitId: habitId,
    });
    this.refreshFromLatestState(habitId);
  },

  confirmHabitFilter() {
    const habitId = this.data.draftHabitId;

    this.setData({
      selectedHabitId: habitId,
      habitFilterOpen: false,
    });
    this.refreshFromLatestState(habitId);
  },

  cancelHabitFilter() {
    this.setData({
      habitFilterOpen: false,
      draftHabitId: this.data.selectedHabitId,
      habitQuery: "",
      matchedHabitFilters: this.data.habitFilters,
    });
  },

  clearHabitSearch() {
    this.setData({
      habitQuery: "",
      matchedHabitFilters: this.data.habitFilters,
    });
  },

  clearHabitKeyword() {
    const habitId = allHabitsId;

    this.setData({
      habitQuery: "",
      selectedHabitId: habitId,
      draftHabitId: habitId,
      habitFilterOpen: false,
    });
    this.refreshFromLatestState(habitId, "");
  },

  refreshFromLatestState(nextHabitId?: string, nextHabitQuery?: string) {
    if (!latestState) {
      return;
    }

    const selectedHabitId = nextHabitId ?? this.data.selectedHabitId;
    const habitQuery = nextHabitQuery ?? this.data.habitQuery;
    this.setData({
      ...buildData(latestState, selectedHabitId, currentMonth, selectedDateKey, habitQuery),
    });
  },
});
