const STORAGE_KEY = "today-counts-state-v1";
const DEFAULT_REMINDER = "21:30";

const REASONS = [
  { value: "too_big", label: "目标太大", tag: "拆小", helper: "明天改成更轻的一步" },
  { value: "forgot", label: "忘了", tag: "提醒", helper: "给晚上留一个明确入口" },
  { value: "not_started", label: "没开始", tag: "启动", helper: "先从两分钟版本开始" },
  { value: "interrupted", label: "被打断", tag: "中断", helper: "把外部阻力单独记下" }
];

const MOODS = [
  { value: "soft", label: "想躺", helper: "先保住一点点就好" },
  { value: "steady", label: "还不错", helper: "今天可以稳稳推进" },
  { value: "stuck", label: "有点难", helper: "把阻力记下来就算复盘" },
  { value: "bright", label: "挺有劲", helper: "可以顺手多走一格" }
];

function loadState() {
  const parsed = wx.getStorageSync(STORAGE_KEY);
  if (!parsed || typeof parsed !== "object") {
    return createEmptyState();
  }
  const settings = parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {};

  return {
    settings: {
      reminderTime: settings.reminderTime || DEFAULT_REMINDER,
      notifications: Boolean(settings.notifications)
    },
    flags: Array.isArray(parsed.flags) ? parsed.flags.map(normalizeFlag) : []
  };
}

function saveState(state) {
  wx.setStorageSync(STORAGE_KEY, state);
}

function createEmptyState() {
  return {
    settings: {
      reminderTime: DEFAULT_REMINDER,
      notifications: false
    },
    flags: []
  };
}

function normalizeFlag(flag) {
  const rawProgress = Number(flag.progress);
  const progress = Number.isFinite(rawProgress)
    ? rawProgress
    : flag.status === "done"
      ? 100
      : 0;

  return {
    ...flag,
    mood: flag.mood || "",
    progress: clampProgress(progress),
    progressLog: Array.isArray(flag.progressLog) ? flag.progressLog : []
  };
}

function createFlag({ goal, standard, minimum, reminderTime }) {
  const now = new Date().toISOString();
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: getDateKey(new Date()),
    goal,
    standard: standard || goal,
    minimum: minimum || "先做 10 分钟",
    reminderTime: reminderTime || DEFAULT_REMINDER,
    status: "pending",
    reason: "",
    note: "",
    mood: "",
    progress: 0,
    progressLog: [{ at: now, value: 0, label: "立下约定" }],
    createdAt: now,
    reviewedAt: ""
  };
}

function updateFlag(state, flagId, patch) {
  return {
    ...state,
    flags: state.flags.map((flag) => flag.id === flagId ? normalizeFlag({ ...flag, ...patch }) : flag)
  };
}

function getTodayFlags(state) {
  return getFlagsForDate(state, getDateKey(new Date()));
}

function getFlagsForDate(state, dateKey) {
  return state.flags.filter((flag) => flag.date === dateKey);
}

function getPrimaryFlag(flags) {
  return flags.find((flag) => flag.status === "pending")
    || flags.find((flag) => flag.status !== "done")
    || flags[0]
    || null;
}

function getFlagProgress(flag) {
  if (!flag) {
    return 0;
  }
  if (flag.status === "done") {
    return 100;
  }
  return clampProgress(flag.progress);
}

function getFlagsProgress(flags) {
  if (!flags.length) {
    return 0;
  }
  return Math.round(flags.reduce((sum, flag) => sum + getFlagProgress(flag), 0) / flags.length);
}

function getCurrentStreak(state) {
  let cursor = new Date();
  let count = 0;

  while (count < 366) {
    const status = getDateCompletionStatus(state, getDateKey(cursor));
    if (status !== "done" && status !== "partial") {
      break;
    }
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return count;
}

function getMonthStats(state, date) {
  const month = getMonthStart(date);
  const flags = state.flags.filter((flag) => isSameMonth(new Date(`${flag.date}T12:00:00`), month));
  const activeDays = new Set(flags.map((flag) => flag.date)).size;
  const doneDays = [...new Set(flags.map((flag) => flag.date))]
    .filter((dateKey) => ["done", "partial"].includes(getDateCompletionStatus(state, dateKey))).length;

  return { activeDays, doneDays };
}

function getDateCompletionStatus(state, dateKey) {
  const flags = getFlagsForDate(state, dateKey);
  if (!flags.length) {
    return "empty";
  }
  if (flags.every((flag) => flag.status === "done")) {
    return "done";
  }
  if (flags.some((flag) => flag.status === "partial" || getFlagProgress(flag) > 0)) {
    return "partial";
  }
  if (flags.some((flag) => flag.status === "pending")) {
    return "pending";
  }
  return "missed";
}

function buildShareTitle(flags) {
  if (!flags.length) {
    return "今天还没插旗";
  }
  if (flags.length === 1) {
    return flags[0].goal;
  }
  const doneCount = flags.filter((flag) => flag.status === "done").length;
  return `今日 ${flags.length} 面 flag，${doneCount} 面已插稳`;
}

function buildShareQuote(flags, completionRate) {
  if (!flags.length) {
    return "今天还没插旗，但人已经到场，也算没掉线。";
  }
  if (flags.every((flag) => flag.status === "done")) {
    return "今日 flag 已落地，留下一张清楚的小结。";
  }
  if (getFlagsProgress(flags) >= 60) {
    return "进度条已经往前拱了，别说自己没动。";
  }
  if (completionRate >= 60) {
    return "节奏在了。今天慢一点也没事，别让 flag 原地失踪。";
  }
  return "今天不和自己 battle，先把 flag 往前挪一格。";
}

function buildShareText(flags, quote, completionRate) {
  if (!flags.length) {
    return `今天还没插旗。\n${quote}`;
  }
  const lines = flags.map((flag, index) => `${index + 1}. ${flag.goal}（${getFlagProgress(flag)}%）`);
  return [
    "今天算数：",
    ...lines,
    `整体进度：${getFlagsProgress(flags)}%`,
    `本月算数率：${completionRate}%`,
    quote
  ].join("\n");
}

function getMonthGridDates(date) {
  const monthStart = getMonthStart(date);
  const first = new Date(monthStart);
  const mondayOffset = (first.getDay() + 6) % 7;
  first.setDate(first.getDate() - mondayOffset);
  const dates = [];
  for (let index = 0; index < 42; index += 1) {
    const item = new Date(first);
    item.setDate(first.getDate() + index);
    dates.push(getDateKey(item));
  }
  return dates;
}

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function isSameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatFullDate(date) {
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
}

function formatShortDate(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatMonthTitle(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function buildGreeting(date) {
  const hour = date.getHours();
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function statusText(status) {
  return {
    pending: "推进中",
    done: "已完成",
    partial: "算了一部分",
    missed: "未完成"
  }[status] || "记录";
}

function reasonText(reason) {
  const item = REASONS.find((option) => option.value === reason);
  return item ? item.label : "已记录";
}

function moodLabel(mood) {
  const item = MOODS.find((option) => option.value === mood);
  return item ? item.label : "";
}

function moodHelperText(mood) {
  const item = MOODS.find((option) => option.value === mood);
  return item ? item.helper : "先选一个今天的体感，复盘会更像在和自己说话。";
}

function clampProgress(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

module.exports = {
  DEFAULT_REMINDER,
  REASONS,
  MOODS,
  addMonths,
  buildGreeting,
  buildShareQuote,
  buildShareText,
  buildShareTitle,
  clampProgress,
  createFlag,
  formatFullDate,
  formatMonthTitle,
  formatShortDate,
  formatTime,
  getCurrentStreak,
  getDateCompletionStatus,
  getDateKey,
  getFlagProgress,
  getFlagsForDate,
  getFlagsProgress,
  getMonthGridDates,
  getMonthStart,
  getMonthStats,
  getPrimaryFlag,
  getTodayFlags,
  isSameMonth,
  loadState,
  moodHelperText,
  moodLabel,
  reasonText,
  saveState,
  statusText,
  updateFlag
};
