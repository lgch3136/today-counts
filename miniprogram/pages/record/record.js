const stateUtils = require("../../utils/state");

Page({
  data: {
    hasFlags: false,
    todayFlags: [],
    doneCount: 0,
    totalProgress: 0,
    reasons: stateUtils.REASONS,
    moods: stateUtils.MOODS,
    selectedMood: "",
    moodHelper: "先选一个今天的体感，复盘会更像在和自己说话。",
    reasonFlagId: "",
    weekdays: ["日", "一", "二", "三", "四", "五", "六"],
    calendarDates: [],
    monthTitle: "",
    selectedDateKey: stateUtils.getDateKey(new Date()),
    selectedDateLabel: "",
    selectedDateSummary: ""
  },

  onLoad() {
    this.calendarCursor = stateUtils.getMonthStart(new Date());
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const state = stateUtils.loadState();
    const todayFlags = stateUtils.getTodayFlags(state).map((flag) => this.decorateFlag(flag));
    const primary = stateUtils.getPrimaryFlag(todayFlags);
    const selectedMood = primary ? primary.mood : "";

    this.setData({
      hasFlags: todayFlags.length > 0,
      todayFlags,
      doneCount: todayFlags.filter((flag) => flag.status === "done").length,
      totalProgress: stateUtils.getFlagsProgress(todayFlags),
      selectedMood,
      moodHelper: stateUtils.moodHelperText(selectedMood)
    });
    this.refreshCalendar(state);
  },

  decorateFlag(flag) {
    const logs = [...(flag.progressLog || [])].slice(-4).reverse().map((item) => ({
      ...item,
      time: stateUtils.formatTime(item.at)
    }));
    return {
      ...flag,
      progress: stateUtils.getFlagProgress(flag),
      statusLabel: stateUtils.statusText(flag.status),
      logs
    };
  },

  onProgressChange(event) {
    const flagId = event.currentTarget.dataset.id;
    const value = stateUtils.clampProgress(event.detail.value);
    let state = stateUtils.loadState();
    const flag = state.flags.find((item) => item.id === flagId);
    if (!flag) return;

    state = stateUtils.updateFlag(state, flagId, {
      progress: value,
      status: flag.status === "done" && value < 100 ? "pending" : flag.status,
      progressLog: [
        ...(flag.progressLog || []),
        { at: new Date().toISOString(), value, label: "挪了一格" }
      ]
    });
    stateUtils.saveState(state);
    this.refresh();
  },

  completeFlag(event) {
    const flagId = event.currentTarget.dataset.id;
    let state = stateUtils.loadState();
    const flag = state.flags.find((item) => item.id === flagId);
    if (!flag) return;

    state = stateUtils.updateFlag(state, flagId, {
      status: "done",
      reason: "",
      note: "",
      progress: 100,
      progressLog: [
        ...(flag.progressLog || []),
        { at: new Date().toISOString(), value: 100, label: "完成" }
      ],
      reviewedAt: new Date().toISOString()
    });
    stateUtils.saveState(state);
    if (!stateUtils.getTodayFlags(state).some((item) => item.status === "pending")) {
      wx.redirectTo({ url: "/pages/share/share" });
      return;
    }
    this.refresh();
  },

  openReason(event) {
    this.setData({ reasonFlagId: event.currentTarget.dataset.id });
  },

  chooseReason(event) {
    const flagId = event.currentTarget.dataset.id;
    const reason = event.currentTarget.dataset.reason;
    let state = stateUtils.loadState();
    const flag = state.flags.find((item) => item.id === flagId);
    if (!flag) return;

    const progress = stateUtils.getFlagProgress(flag);
    const status = progress > 0 ? "partial" : "missed";
    state = stateUtils.updateFlag(state, flagId, {
      status,
      reason,
      note: stateUtils.reasonText(reason),
      progress,
      progressLog: [
        ...(flag.progressLog || []),
        { at: new Date().toISOString(), value: progress, label: stateUtils.reasonText(reason) }
      ],
      reviewedAt: new Date().toISOString()
    });
    stateUtils.saveState(state);
    this.setData({ reasonFlagId: "" });
    if (!stateUtils.getTodayFlags(state).some((item) => item.status === "pending")) {
      wx.redirectTo({ url: "/pages/share/share" });
      return;
    }
    this.refresh();
  },

  reopenFlag(event) {
    const flagId = event.currentTarget.dataset.id;
    let state = stateUtils.loadState();
    state = stateUtils.updateFlag(state, flagId, {
      status: "pending",
      reason: "",
      note: "",
      reviewedAt: ""
    });
    stateUtils.saveState(state);
    this.refresh();
  },

  setMood(event) {
    const mood = event.currentTarget.dataset.mood;
    let state = stateUtils.loadState();
    const flag = stateUtils.getPrimaryFlag(stateUtils.getTodayFlags(state));
    if (!flag) return;

    state = stateUtils.updateFlag(state, flag.id, { mood });
    stateUtils.saveState(state);
    wx.showToast({ title: "今日体感记下了", icon: "none" });
    this.refresh();
  },

  refreshCalendar(state) {
    const selectedDateKey = this.data.selectedDateKey;
    const dates = stateUtils.getMonthGridDates(this.calendarCursor).map((dateKey) => {
      const date = new Date(`${dateKey}T12:00:00`);
      const status = stateUtils.getDateCompletionStatus(state, dateKey);
      return {
        dateKey,
        day: date.getDate(),
        status,
        selected: dateKey === selectedDateKey,
        muted: !stateUtils.isSameMonth(date, this.calendarCursor),
        mark: { done: "✓", partial: "•", pending: "○", missed: "×", empty: "" }[status]
      };
    });
    const selectedFlags = stateUtils.getFlagsForDate(state, selectedDateKey);

    this.setData({
      calendarDates: dates,
      monthTitle: stateUtils.formatMonthTitle(this.calendarCursor),
      selectedDateLabel: stateUtils.formatShortDate(selectedDateKey),
      selectedDateSummary: selectedFlags.length ? `${selectedFlags.length} 面 flag · ${stateUtils.statusText(stateUtils.getDateCompletionStatus(state, selectedDateKey))}` : "空白日"
    });
  },

  prevMonth() {
    this.calendarCursor = stateUtils.addMonths(this.calendarCursor, -1);
    this.setData({ selectedDateKey: stateUtils.getDateKey(this.calendarCursor) });
    this.refresh();
  },

  nextMonth() {
    this.calendarCursor = stateUtils.addMonths(this.calendarCursor, 1);
    this.setData({ selectedDateKey: stateUtils.getDateKey(this.calendarCursor) });
    this.refresh();
  },

  selectDate(event) {
    const selectedDateKey = event.currentTarget.dataset.date;
    this.calendarCursor = stateUtils.getMonthStart(new Date(`${selectedDateKey}T12:00:00`));
    this.setData({ selectedDateKey });
    this.refresh();
  },

  goToday() {
    wx.redirectTo({ url: "/pages/today/today" });
  },

  goShare() {
    wx.redirectTo({ url: "/pages/share/share" });
  },

  goProfile() {
    wx.redirectTo({ url: "/pages/profile/profile" });
  }
});
