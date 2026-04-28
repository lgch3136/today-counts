const stateUtils = require("../../utils/state");
const config = require("../../utils/config");

Page({
  data: {
    dateLabel: "",
    greetingLabel: "",
    streak: 0,
    hasFlags: false,
    todayFlags: [],
    totalProgress: 0,
    goal: "",
    standard: "",
    minimum: "",
    reminderTime: stateUtils.DEFAULT_REMINDER,
    goalCount: 0
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const state = stateUtils.loadState();
    const todayFlags = stateUtils.getTodayFlags(state).map((flag) => ({
      ...flag,
      progressText: `${stateUtils.getFlagProgress(flag)}%`
    }));

    this.setData({
      dateLabel: stateUtils.formatFullDate(new Date()),
      greetingLabel: stateUtils.buildGreeting(new Date()),
      streak: stateUtils.getCurrentStreak(state),
      hasFlags: todayFlags.length > 0,
      todayFlags,
      totalProgress: stateUtils.getFlagsProgress(todayFlags),
      reminderTime: state.settings.reminderTime || stateUtils.DEFAULT_REMINDER
    });
  },

  onGoalInput(event) {
    const goal = event.detail.value || "";
    this.setData({ goal, goalCount: goal.length });
  },

  onStandardInput(event) {
    this.setData({ standard: event.detail.value || "" });
  },

  onMinimumInput(event) {
    this.setData({ minimum: event.detail.value || "" });
  },

  onReminderChange(event) {
    this.setData({ reminderTime: event.detail.value || stateUtils.DEFAULT_REMINDER });
  },

  submitFlag() {
    const goal = this.data.goal.trim();
    if (!goal) {
      wx.showToast({ title: "先写一件小事", icon: "none" });
      return;
    }

    const state = stateUtils.loadState();
    state.settings.reminderTime = this.data.reminderTime;
    state.flags.push(stateUtils.createFlag({
      goal,
      standard: this.data.standard.trim(),
      minimum: this.data.minimum.trim(),
      reminderTime: this.data.reminderTime
    }));
    stateUtils.saveState(state);
    wx.redirectTo({ url: "/pages/record/record" });
  },

  resetToday() {
    wx.showModal({
      title: "重新写今天？",
      content: "会清掉今天已经写下的 flag。",
      confirmText: "重新写",
      success: (res) => {
        if (!res.confirm) return;
        const state = stateUtils.loadState();
        const today = stateUtils.getDateKey(new Date());
        state.flags = state.flags.filter((flag) => flag.date !== today);
        stateUtils.saveState(state);
        this.setData({ goal: "", standard: "", minimum: "", goalCount: 0 });
        this.refresh();
      }
    });
  },

  openReminder() {
    if (!config.reminderTemplateId) {
      wx.showModal({
        title: "提醒功能待配置",
        content: "小程序订阅提醒需要先在微信公众平台申请订阅消息模板。部署时填入模板 ID 后，这里就能请求授权。",
        showCancel: false
      });
      return;
    }

    wx.requestSubscribeMessage({
      tmplIds: [config.reminderTemplateId],
      success: () => wx.showToast({ title: "提醒已开启", icon: "success" }),
      fail: () => wx.showToast({ title: "这次没有开启提醒", icon: "none" })
    });
  },

  goRecord() {
    wx.redirectTo({ url: "/pages/record/record" });
  },

  goShare() {
    wx.redirectTo({ url: "/pages/share/share" });
  },

  goProfile() {
    wx.redirectTo({ url: "/pages/profile/profile" });
  }
});
