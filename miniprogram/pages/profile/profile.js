const stateUtils = require("../../utils/state");
const config = require("../../utils/config");

Page({
  data: {
    streak: 0,
    totalFlags: 0,
    reminderTime: stateUtils.DEFAULT_REMINDER
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const state = stateUtils.loadState();
    this.setData({
      streak: stateUtils.getCurrentStreak(state),
      totalFlags: state.flags.length,
      reminderTime: state.settings.reminderTime || stateUtils.DEFAULT_REMINDER
    });
  },

  onReminderChange(event) {
    const state = stateUtils.loadState();
    state.settings.reminderTime = event.detail.value || stateUtils.DEFAULT_REMINDER;
    stateUtils.saveState(state);
    this.refresh();
  },

  requestSubscribe() {
    if (!config.reminderTemplateId) {
      wx.showModal({
        title: "提醒功能待配置",
        content: "部署小程序后，在微信公众平台申请订阅消息模板，把模板 ID 填到 utils/config.js，就可以在这里请求授权。",
        showCancel: false
      });
      return;
    }

    wx.requestSubscribeMessage({
      tmplIds: [config.reminderTemplateId],
      success: () => {
        const state = stateUtils.loadState();
        state.settings.notifications = true;
        stateUtils.saveState(state);
        wx.showToast({ title: "提醒已开启", icon: "success" });
      },
      fail: () => wx.showToast({ title: "这次没有开启提醒", icon: "none" })
    });
  },

  clearData() {
    wx.showModal({
      title: "清空所有记录？",
      content: "这个操作会删除当前微信本地保存的所有 flag。",
      confirmText: "清空",
      confirmColor: "#b65a47",
      success: (res) => {
        if (!res.confirm) return;
        stateUtils.saveState({
          settings: {
            reminderTime: this.data.reminderTime,
            notifications: false
          },
          flags: []
        });
        this.refresh();
        wx.showToast({ title: "已清空", icon: "none" });
      }
    });
  },

  goToday() {
    wx.redirectTo({ url: "/pages/today/today" });
  },

  goRecord() {
    wx.redirectTo({ url: "/pages/record/record" });
  },

  goShare() {
    wx.redirectTo({ url: "/pages/share/share" });
  }
});
