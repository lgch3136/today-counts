const stateUtils = require("../../utils/state");

Page({
  data: {
    todayFlags: [],
    todayLabel: "",
    statusLabel: "",
    shareTitle: "",
    quote: "",
    progress: 0,
    monthDone: 0,
    monthActive: 0,
    moodLabel: "",
    moodText: "未记",
    insight: ""
  },

  onShow() {
    this.refresh();
  },

  onShareAppMessage() {
    return {
      title: this.data.shareTitle ? `今天算数：${this.data.shareTitle}` : "今天算数",
      path: "/pages/today/today"
    };
  },

  refresh() {
    const state = stateUtils.loadState();
    const todayFlags = stateUtils.getTodayFlags(state);
    const stats = stateUtils.getMonthStats(state, new Date());
    const completionRate = stats.activeDays ? Math.round((stats.doneDays / stats.activeDays) * 100) : 0;
    const quote = stateUtils.buildShareQuote(todayFlags, completionRate);
    const primary = stateUtils.getPrimaryFlag(todayFlags);
    const mood = primary ? primary.mood : "";
    const moodLabel = stateUtils.moodLabel(mood);

    this.setData({
      todayFlags,
      todayLabel: stateUtils.formatShortDate(stateUtils.getDateKey(new Date())),
      statusLabel: this.getStatusLabel(stateUtils.getDateCompletionStatus(state, stateUtils.getDateKey(new Date()))),
      shareTitle: stateUtils.buildShareTitle(todayFlags),
      quote,
      progress: stateUtils.getFlagsProgress(todayFlags),
      monthDone: stats.doneDays,
      monthActive: stats.activeDays,
      moodLabel,
      moodText: moodLabel || "未记",
      insight: this.buildInsight(state.flags)
    });
  },

  getStatusLabel(status) {
    return {
      done: "算数了",
      partial: "推进中",
      pending: "推进中",
      missed: "未完成",
      empty: "待开始"
    }[status] || "记录";
  },

  buildInsight(flags) {
    const month = stateUtils.getMonthStart(new Date());
    const recentFlags = flags.filter((flag) => stateUtils.isSameMonth(new Date(`${flag.date}T12:00:00`), month));
    if (!recentFlags.length) {
      return "先别和自己 battle，今天只开一个小副本就够了。";
    }
    const partial = recentFlags.filter((flag) => flag.status === "partial" || flag.status === "missed");
    if (!partial.length) {
      return "这个月节奏在线，别给自己加戏，继续小步稳稳走。";
    }
    return "被记录下来的阻力，会变成明天更轻一点的入口。";
  },

  copyText() {
    const stats = this.data.monthActive ? Math.round((this.data.monthDone / this.data.monthActive) * 100) : 0;
    wx.setClipboardData({
      data: stateUtils.buildShareText(this.data.todayFlags, this.data.quote, stats),
      success: () => wx.showToast({ title: "文案已复制", icon: "success" })
    });
  },

  async savePoster() {
    try {
      wx.showLoading({ title: "生成中" });
      const tempPath = await this.drawPoster();
      wx.hideLoading();
      wx.saveImageToPhotosAlbum({
        filePath: tempPath,
        success: () => wx.showToast({ title: "已保存", icon: "success" }),
        fail: () => {
          wx.showModal({
            title: "没有保存成功",
            content: "请在微信设置里允许保存到相册，再试一次。",
            showCancel: false
          });
        }
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: "海报生成失败", icon: "none" });
    }
  },

  drawPoster() {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery()
        .select("#posterCanvas")
        .fields({ node: true, size: true })
        .exec((res) => {
          const first = Array.isArray(res) ? res[0] : null;
          const canvas = first ? first.node : null;
          if (!canvas) {
            reject(new Error("canvas unavailable"));
            return;
          }
          const systemInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
          const dpr = systemInfo.pixelRatio || 2;
          const size = 1080;
          canvas.width = size * dpr;
          canvas.height = size * dpr;
          const ctx = canvas.getContext("2d");
          ctx.scale(dpr, dpr);

          const image = canvas.createImage();
          image.onload = () => {
            this.paintPoster(ctx, image, size);
            wx.canvasToTempFilePath({
              canvas,
              fileType: "jpg",
              quality: 0.92,
              success: (result) => resolve(result.tempFilePath),
              fail: reject
            });
          };
          image.onerror = reject;
          image.src = "/assets/share-calendar-v3.jpg";
        });
    });
  },

  paintPoster(ctx, image, size) {
    ctx.drawImage(image, 0, 0, size, size);
    ctx.fillStyle = "rgba(255,249,238,0.08)";
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = "#2b261f";
    ctx.font = "700 44px sans-serif";
    ctx.fillText("今天算数", 116, 126);

    ctx.fillStyle = "#817364";
    ctx.font = "500 26px sans-serif";
    ctx.fillText(this.data.todayLabel, 116, 168);

    ctx.fillStyle = "#2e7059";
    ctx.font = "800 28px sans-serif";
    ctx.fillText("本月算数日历", 116, 268);

    ctx.fillStyle = "#2b261f";
    ctx.font = "800 66px sans-serif";
    this.wrapText(ctx, this.data.shareTitle, 116, 356, 760, 78, 3);

    ctx.fillStyle = "#817364";
    ctx.font = "500 32px sans-serif";
    this.wrapText(ctx, this.data.quote, 116, 584, 760, 48, 3);

    this.roundRect(ctx, 760, 96, 186, 78, 20);
    ctx.fillStyle = "rgba(255,253,248,0.72)";
    ctx.fill();
    ctx.strokeStyle = "rgba(46,112,89,0.24)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#2e7059";
    ctx.font = "800 24px sans-serif";
    ctx.fillText("MONTH", 800, 128);
    ctx.fillStyle = "#817364";
    ctx.font = "700 20px sans-serif";
    ctx.fillText("MAP", 820, 156);

    ctx.strokeStyle = "rgba(46,112,89,0.18)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(116, 860);
    ctx.lineTo(906, 860);
    ctx.stroke();
    ctx.fillStyle = "#2e7059";
    ctx.font = "800 54px sans-serif";
    ctx.fillText(`${this.data.progress}%`, 116, 932);
    ctx.fillStyle = "#817364";
    ctx.font = "600 24px sans-serif";
    ctx.fillText(`今日进度 / 本月认真天 ${this.data.monthDone}/${this.data.monthActive || 0}`, 116, 972);
  },

  wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const characters = [...String(text || "")];
    let line = "";
    let count = 0;
    for (const character of characters) {
      const nextLine = line + character;
      if (ctx.measureText(nextLine).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        line = character;
        y += lineHeight;
        count += 1;
        if (count >= maxLines - 1) break;
      } else {
        line = nextLine;
      }
    }
    if (line && count < maxLines) {
      ctx.fillText(line, x, y);
    }
  },

  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  },

  goToday() {
    wx.redirectTo({ url: "/pages/today/today" });
  },

  goRecord() {
    wx.redirectTo({ url: "/pages/record/record" });
  },

  goProfile() {
    wx.redirectTo({ url: "/pages/profile/profile" });
  }
});
