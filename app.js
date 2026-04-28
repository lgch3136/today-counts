const STORAGE_KEY = "today-counts-state-v1";
const DEFAULT_REMINDER = "21:30";
const UNDO_WINDOW_MS = 5 * 60 * 1000;
const SHARE_BG_PATH = "assets/share-bg-v27.jpg";

const REASONS = [
  ["too_big", "目标太大"],
  ["forgot", "忘了"],
  ["not_started", "没开始"],
  ["interrupted", "被打断"]
];

const MOODS = [
  ["soft", "想躺", "先保住一点点就好"],
  ["steady", "还不错", "今天可以稳稳推进"],
  ["stuck", "有点难", "把阻力记下来就算复盘"],
  ["bright", "挺有劲", "可以顺手多走一格"]
];

let state = loadState();
let reminderTimer = null;
let activeView = getInitialView();
let undoStack = [];
let homeComposeOpen = false;
let reviewReasonFlagId = "";
let selectedDateKey = getDateKey(new Date());
let calendarCursor = getMonthStart(new Date());

const elements = {
  dateLabel: document.getElementById("dateLabel"),
  greetingLabel: document.getElementById("greetingLabel"),
  streakPill: document.getElementById("streakPill"),
  homePanel: document.getElementById("homePanel"),
  progressPanel: document.getElementById("progressPanel"),
  sharePanel: document.getElementById("sharePanel"),
  notifyButton: document.getElementById("notifyButton"),
  clearButton: document.getElementById("clearButton"),
  navButtons: document.querySelectorAll("[data-nav]"),
  viewPanels: document.querySelectorAll("[data-view-panel]")
};

boot();

function boot() {
  registerServiceWorker();
  elements.dateLabel.textContent = formatFullDate(new Date());
  elements.greetingLabel.textContent = buildGreeting(new Date());
  elements.notifyButton.addEventListener("click", requestNotifications);
  elements.clearButton.addEventListener("click", clearAllData);
  bindNavigation();
  render();
  scheduleReminder();
}

function bindNavigation() {
  elements.navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveView(button.dataset.nav);
    });
  });
}

function getInitialView() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view") || window.location.hash.replace("#", "");
  return ["home", "progress", "share"].includes(view) ? view : "home";
}

function setActiveView(view) {
  activeView = view;
  elements.viewPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.viewPanel === view);
  });
  elements.navButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.nav === view);
  });
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      settings: {
        reminderTime: parsed?.settings?.reminderTime || DEFAULT_REMINDER,
        notifications: Boolean(parsed?.settings?.notifications)
      },
      flags: Array.isArray(parsed?.flags) ? parsed.flags.map(normalizeFlag) : []
    };
  } catch (error) {
    return {
      settings: {
        reminderTime: DEFAULT_REMINDER,
        notifications: false
      },
      flags: []
    };
  }
}

function normalizeFlag(flag) {
  const progress = Number.isFinite(Number(flag.progress))
    ? Number(flag.progress)
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

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  const todayFlags = getTodayFlags();

  elements.streakPill.innerHTML = `<span>连续</span><strong>${getCurrentStreak()}</strong><span>天</span>`;
  renderHomePanel(todayFlags);
  renderProgressPanel(todayFlags);
  renderSharePanel(todayFlags);
  updateNavSignal(todayFlags);
  setActiveView(activeView);
}

function getTodayFlag() {
  return getPrimaryFlag(getTodayFlags());
}

function getTodayFlags() {
  const today = getDateKey(new Date());
  return getFlagsForDate(today);
}

function getFlagsForDate(dateKey) {
  return state.flags.filter((flag) => flag.date === dateKey);
}

function getPrimaryFlag(flags) {
  return flags.find((flag) => flag.status === "pending")
    || flags.find((flag) => flag.status !== "done")
    || flags[0]
    || null;
}

function updateNavSignal(todayFlags) {
  const progressButton = document.querySelector('[data-nav="progress"]');
  const shareButton = document.querySelector('[data-nav="share"]');
  progressButton?.classList.toggle("has-signal", todayFlags.some((flag) => flag.status === "pending"));
  shareButton?.classList.toggle("has-signal", todayFlags.some((flag) => flag.status !== "pending"));
}

function renderHomePanel(todayFlags) {
  if (!todayFlags.length) {
    elements.homePanel.innerHTML = renderHomeFlagForm("立 flag");
    bindHomeFlagForm();
    return;
  }

  const doneCount = todayFlags.filter((flag) => flag.status === "done").length;
  const totalProgress = getFlagsProgress(todayFlags);

  elements.homePanel.innerHTML = `
    <article class="task-sheet home-status-sheet">
      <div class="sheet-label">今天的 flag</div>
      <div class="today-summary">
        <div>
          <span>已立 ${todayFlags.length} 面</span>
          <strong>${doneCount}/${todayFlags.length}</strong>
        </div>
        <div>
          <span>整体推进</span>
          <strong>${totalProgress}%</strong>
        </div>
      </div>
      <div class="flag-list compact-flag-list">
        ${todayFlags.map((flag, index) => renderFlagSummary(flag, index)).join("")}
      </div>
      <div class="home-progress-summary">
        <span>今天的主线</span>
        <strong>${getFlagsStory(todayFlags)}</strong>
      </div>
      <p class="microcopy">默认只劝你守一个主 flag，因为拖延最怕开太多坑；状态在线时，再多插一面也不迟。</p>
      <div class="button-row">
        <button class="primary-button" type="button" data-action="go-progress">去记录</button>
        <button class="secondary-button" type="button" data-action="add-flag">再立一个 flag</button>
        <button class="ghost-button" type="button" data-action="go-share">看复盘</button>
      </div>
      <details class="advanced-settings soft-details">
        <summary>写错了？</summary>
        <button class="ghost-button danger-button" type="button" data-action="rewrite-today">清掉今天，重新来</button>
      </details>
    </article>
    ${homeComposeOpen ? renderHomeFlagForm("再立一个 flag") : ""}
  `;

  elements.homePanel.querySelector('[data-action="go-progress"]').addEventListener("click", () => {
    selectedDateKey = getDateKey(new Date());
    calendarCursor = getMonthStart(new Date());
    setActiveView("progress");
  });
  elements.homePanel.querySelector('[data-action="go-share"]').addEventListener("click", () => {
    setActiveView("share");
  });
  elements.homePanel.querySelector('[data-action="add-flag"]').addEventListener("click", () => {
    homeComposeOpen = true;
    render();
    window.requestAnimationFrame(() => document.getElementById("goalInput")?.focus());
  });
  elements.homePanel.querySelector('[data-action="rewrite-today"]').addEventListener("click", () => {
    if (window.confirm("清掉今天这些 flag，重新写？")) {
      const today = getDateKey(new Date());
      state.flags = state.flags.filter((flag) => flag.date !== today);
      undoStack = [];
      homeComposeOpen = false;
      saveAndRender();
      setActiveView("home");
    }
  });
  if (homeComposeOpen) {
    bindHomeFlagForm();
  }
}

function renderHomeFlagForm(label = "立 flag") {
  return `
    <article class="compose-sheet home-compose-sheet">
      <div class="sheet-label">${escapeHtml(label)}</div>
      <form id="flagForm" class="field-grid">
        <label>
          <span class="label-row">
            <span>今天想让哪件小事算数？</span>
            <span id="goalCounter">0/220</span>
          </span>
          <textarea id="goalInput" class="goal-input" maxlength="220" placeholder="例如：晚上前把第一版做出来"></textarea>
        </label>
        <div class="quick-option-grid" aria-label="轻量设置">
          <label class="quick-option-card">
            <span>怎么算数</span>
            <input id="standardInput" maxlength="160" placeholder="完成为准">
          </label>
          <label class="quick-option-card">
            <span>低电量版本</span>
            <input id="minimumInput" maxlength="160" placeholder="先做 10 分钟">
          </label>
          <label class="quick-option-card">
            <span>提醒时间</span>
            <input id="reminderInput" type="time" value="${escapeHtml(state.settings.reminderTime || DEFAULT_REMINDER)}">
          </label>
        </div>
        <button class="primary-button wide-button" type="submit">立下今日约定</button>
      </form>
    </article>
  `;
}

function bindHomeFlagForm() {
  const form = document.getElementById("flagForm");
  const goalInput = document.getElementById("goalInput");
  const goalCounter = document.getElementById("goalCounter");

  goalInput.addEventListener("input", () => {
    goalCounter.textContent = `${goalInput.value.length}/220`;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const goal = document.getElementById("goalInput").value.trim();
    const standard = document.getElementById("standardInput").value.trim();
    const minimum = document.getElementById("minimumInput").value.trim();
    const reminderTime = document.getElementById("reminderInput").value || DEFAULT_REMINDER;

    if (!goal) {
      document.getElementById("goalInput").focus();
      return;
    }

    const now = new Date().toISOString();
    state.settings.reminderTime = reminderTime;
    state.flags.push({
      id: crypto.randomUUID(),
      date: getDateKey(new Date()),
      goal,
      standard: standard || goal,
      minimum: minimum || "先做 10 分钟",
      reminderTime,
      status: "pending",
      reason: "",
      note: "",
      mood: "",
      progress: 0,
      progressLog: [{ at: now, value: 0, label: "立 flag" }],
      createdAt: now,
      reviewedAt: ""
    });

    undoStack = [];
    homeComposeOpen = false;
    saveAndRender();
    scheduleReminder();
    setActiveView("progress");
  });
}

function renderProgressPanel(todayFlags) {
  if (!todayFlags.length) {
    elements.progressPanel.innerHTML = `
      <article class="quiet-state">
        <div class="moon-scene" aria-hidden="true"><span></span></div>
        <h3>今天还没插旗</h3>
        <p>先回到首页，写一件晚上能验收的小事。</p>
        <button class="primary-button wide-button" type="button" data-action="go-home">去首页</button>
      </article>
      ${renderCalendarDeck()}
    `;
    elements.progressPanel.querySelector('[data-action="go-home"]').addEventListener("click", () => {
      setActiveView("home");
    });
    bindCalendarEvents(elements.progressPanel);
    return;
  }

  const doneCount = todayFlags.filter((flag) => flag.status === "done").length;
  const totalProgress = getFlagsProgress(todayFlags);
  elements.progressPanel.innerHTML = `
    <article class="progress-hero-card" style="--progress: ${totalProgress}%">
      <div>
        <span>今日记录</span>
        <h3>慢一点，也算在前进</h3>
        <p>${doneCount === todayFlags.length ? "今天可以盖章了。" : `${doneCount}/${todayFlags.length} 面 flag 已插稳，继续把进度往前挪。`}</p>
      </div>
      <div class="progress-ring" aria-label="今日整体进度 ${totalProgress}%">
        <strong>${totalProgress}%</strong>
        <span>今日进度</span>
      </div>
    </article>
    ${todayFlags.map(renderProgressFlagCard).join("")}
    ${renderMoodCheckin(todayFlags)}
    ${renderCalendarDeck()}
  `;

  bindProgressEvents();
  bindCalendarEvents(elements.progressPanel);
}

function renderMoodCheckin(todayFlags) {
  const flag = getPrimaryFlag(todayFlags);
  if (!flag) {
    return "";
  }

  const selectedMood = flag.mood || "";
  const helper = selectedMood
    ? moodHelperText(selectedMood)
    : "先选一个今天的体感，复盘会更像在和自己说话。";

  return `
    <article class="mood-checkin-card">
      <div>
        <span class="sheet-label">今日体感</span>
        <p>${escapeHtml(helper)}</p>
      </div>
      <div class="mood-grid" role="group" aria-label="记录今日体感">
        ${MOODS.map(([value, label]) => `
          <button class="mood-button ${selectedMood === value ? "is-active" : ""}" type="button" data-action="set-mood" data-flag-id="${escapeHtml(flag.id)}" data-mood="${escapeHtml(value)}">
            ${escapeHtml(label)}
          </button>
        `).join("")}
      </div>
    </article>
  `;
}

function renderProgressFlagCard(flag) {
  const progress = getFlagProgress(flag);
  const isPending = flag.status === "pending";
  const isDone = flag.status === "done";
  return `
    <article class="task-sheet progress-sheet flag-progress-card" style="--progress: ${progress}%">
      <div class="sheet-label">${progressSheetLabel(flag)}</div>
      ${renderFlagBody(flag, true)}
      ${renderOutcomeNote(flag)}
      <div class="progress-meter">
        <div class="progress-meter-head">
          <span>完成进度</span>
          <strong data-progress-value>${progress}%</strong>
        </div>
        <input class="progress-range" data-flag-id="${escapeHtml(flag.id)}" type="range" min="0" max="100" step="5" value="${progress}" ${isPending ? "" : "disabled"}>
        <div class="progress-track" aria-hidden="true">
          <span></span>
        </div>
      </div>
      <div class="button-row">
        ${isDone
          ? `<button class="secondary-button" type="button" data-action="undo-done" data-flag-id="${escapeHtml(flag.id)}">盖早了？退回去</button>`
          : ""}
        ${isPending
          ? `
            <button class="primary-button" type="button" data-action="complete-flag" data-flag-id="${escapeHtml(flag.id)}">算数了</button>
            <button class="secondary-button" type="button" data-action="mark-missed" data-flag-id="${escapeHtml(flag.id)}">卡住了</button>
          `
          : ""}
        ${!isPending && !isDone
          ? `
            <button class="primary-button" type="button" data-action="complete-flag" data-flag-id="${escapeHtml(flag.id)}">改成完成</button>
            <button class="secondary-button" type="button" data-action="reopen-flag" data-flag-id="${escapeHtml(flag.id)}">重新推进</button>
          `
          : ""}
        <button class="ghost-button" type="button" data-action="go-share">去盖认真戳</button>
      </div>
      ${renderMissedReasonPanel(flag)}
      ${renderUndoNotice(flag.id)}
      <article class="progress-log-card">
        <div class="sheet-label">脚印</div>
        ${renderProgressLog(flag)}
      </article>
    </article>
  `;
}

function progressSheetLabel(flag) {
  return {
    pending: "正在推进",
    done: "已经插稳",
    partial: "算了一部分",
    missed: "今天没算数"
  }[flag.status] || "正在推进";
}

function renderOutcomeNote(flag) {
  if (!["partial", "missed"].includes(flag.status) || !flag.reason) {
    return "";
  }

  return `
    <div class="outcome-note status-${escapeHtml(flag.status)}">
      <span>没算数原因</span>
      <strong>${escapeHtml(reasonText(flag.reason))}</strong>
    </div>
  `;
}

function renderMissedReasonPanel(flag) {
  if (flag.status !== "pending" || reviewReasonFlagId !== flag.id) {
    return "";
  }

  return `
    <div class="checkin-panel is-open">
      <p class="microcopy">选一个最接近的原因，这面 flag 就完成今天的复盘。</p>
      <div class="reason-grid">
        ${REASONS.map(([value, label]) => `
          <button class="reason-button" type="button" data-action="choose-reason" data-flag-id="${escapeHtml(flag.id)}" data-reason="${escapeHtml(value)}">${escapeHtml(label)}</button>
        `).join("")}
      </div>
    </div>
  `;
}

function bindProgressEvents() {
  elements.progressPanel.querySelectorAll(".progress-range").forEach((range) => {
    const sheet = range.closest(".progress-sheet");
    const valueLabel = sheet.querySelector("[data-progress-value]");
    range.addEventListener("input", () => {
      const value = clampProgress(range.value);
      sheet.style.setProperty("--progress", `${value}%`);
      valueLabel.textContent = `${value}%`;
    });
    range.addEventListener("change", () => {
      recordProgress(range.dataset.flagId, range.value, "挪了一格");
    });
  });

  elements.progressPanel.querySelectorAll('[data-action="complete-flag"]').forEach((button) => {
    button.addEventListener("click", () => completeFlag(button.dataset.flagId));
  });
  elements.progressPanel.querySelectorAll('[data-action="set-mood"]').forEach((button) => {
    button.addEventListener("click", () => setMood(button.dataset.flagId, button.dataset.mood));
  });
  elements.progressPanel.querySelectorAll('[data-action="mark-missed"]').forEach((button) => {
    button.addEventListener("click", () => {
      reviewReasonFlagId = button.dataset.flagId;
      render();
      window.requestAnimationFrame(() => {
        [...elements.progressPanel.querySelectorAll('[data-action="choose-reason"]')]
          .find((item) => item.dataset.flagId === button.dataset.flagId)
          ?.focus();
      });
    });
  });
  elements.progressPanel.querySelectorAll('[data-action="choose-reason"]').forEach((button) => {
    button.addEventListener("click", () => finishMissedFlag(button.dataset.flagId, button.dataset.reason));
  });
  elements.progressPanel.querySelectorAll('[data-action="reopen-flag"]').forEach((button) => {
    button.addEventListener("click", () => reopenFlag(button.dataset.flagId));
  });
  elements.progressPanel.querySelectorAll('[data-action="undo-done"]').forEach((button) => {
    button.addEventListener("click", () => {
      const flag = state.flags.find((item) => item.id === button.dataset.flagId);
      if (!flag) {
        return;
      }
      if (getLatestUndo(flag.id)) {
        restoreUndo(flag.id);
        return;
      }
      reviewReasonFlagId = "";
      updateFlag(flag.id, {
        status: "pending",
        reason: "",
        note: "",
        reviewedAt: "",
        progress: Math.min(95, getFlagProgress(flag))
      });
    });
  });
  elements.progressPanel.querySelectorAll('[data-action="go-share"]').forEach((button) => {
    button.addEventListener("click", () => setActiveView("share"));
  });
  elements.progressPanel.querySelectorAll('[data-action="restore-undo"]').forEach((button) => {
    button.addEventListener("click", () => restoreUndo(button.dataset.flagId));
  });
}

function setMood(flagId, mood) {
  if (!MOODS.some(([value]) => value === mood)) {
    return;
  }

  updateFlag(flagId, { mood });
  showToast("今日体感记下了");
}

function renderUndoNotice(flagId) {
  const undo = getLatestUndo(flagId);
  if (!undo) {
    return "";
  }

  return `
    <div class="undo-notice">
      <span>手滑了？5 分钟内能退回上一格</span>
      <button type="button" data-action="restore-undo" data-flag-id="${escapeHtml(flagId)}">退一格</button>
    </div>
  `;
}

function recordProgress(flagId, rawValue, label) {
  const value = clampProgress(rawValue);
  const flag = state.flags.find((item) => item.id === flagId);

  if (!flag || getFlagProgress(flag) === value) {
    return;
  }

  pushUndo(flag);
  updateFlag(flagId, {
    status: flag.status === "done" && value < 100 ? "pending" : flag.status,
    progress: value,
    progressLog: [
      ...(flag.progressLog || []),
      { at: new Date().toISOString(), value, label }
    ]
  });
}

function completeFlag(flagId) {
  const flag = state.flags.find((item) => item.id === flagId);
  if (!flag) {
    return;
  }

  pushUndo(flag);
  reviewReasonFlagId = "";
  updateFlag(flagId, {
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
  const stillPending = getTodayFlags().some((item) => item.status === "pending");
  if (stillPending) {
    showToast("这面旗插稳了");
    setActiveView("progress");
    return;
  }
  setActiveView("share");
}

function finishMissedFlag(flagId, reason) {
  const flag = state.flags.find((item) => item.id === flagId);
  if (!flag || !reason) {
    return;
  }

  const progress = getFlagProgress(flag);
  const status = progress > 0 ? "partial" : "missed";
  const label = reasonText(reason);

  pushUndo(flag);
  reviewReasonFlagId = "";
  updateFlag(flagId, {
    status,
    reason,
    note: label,
    progress,
    progressLog: [
      ...(flag.progressLog || []),
      { at: new Date().toISOString(), value: progress, label }
    ],
    reviewedAt: new Date().toISOString()
  });

  const stillPending = getTodayFlags().some((item) => item.status === "pending");
  showToast(status === "partial" ? "这一部分也算数" : "原因记下了");
  setActiveView(stillPending ? "progress" : "share");
}

function reopenFlag(flagId) {
  const flag = state.flags.find((item) => item.id === flagId);
  if (!flag) {
    return;
  }

  pushUndo(flag);
  reviewReasonFlagId = "";
  updateFlag(flagId, {
    status: "pending",
    reason: "",
    note: "",
    reviewedAt: ""
  });
  setActiveView("progress");
}

function restoreUndo(flagId = "") {
  const undo = getLatestUndo(flagId);
  if (!undo) {
    return;
  }

  undoStack = undoStack.filter((item) => item.token !== undo.token);
  reviewReasonFlagId = "";
  state.flags = state.flags.map((flag) => flag.id === undo.flag.id ? cloneFlag(undo.flag) : flag);
  saveAndRender();
}

function pushUndo(flag) {
  undoStack = [
    ...pruneUndoStack(),
    {
      token: crypto.randomUUID(),
      createdAt: Date.now(),
      flag: cloneFlag(flag)
    }
  ].slice(-8);
}

function getLatestUndo(flagId = "") {
  undoStack = pruneUndoStack();
  const candidates = flagId ? undoStack.filter((item) => item.flag.id === flagId) : undoStack;
  return candidates[candidates.length - 1] || null;
}

function pruneUndoStack() {
  const now = Date.now();
  return undoStack.filter((item) => now - item.createdAt <= UNDO_WINDOW_MS);
}

function renderProgressLog(flag) {
  const logs = [...(flag.progressLog || [])].slice(-8).reverse();

  if (!logs.length) {
    return `<p class="microcopy">拨一下进度条，这里会自动留脚印。</p>`;
  }

  return `
    <div class="progress-timeline">
      ${logs.map((item) => `
        <div class="timeline-item">
          <time>${formatTime(item.at)}</time>
          <span>${escapeHtml(item.label || "记录")}</span>
          <strong>${clampProgress(item.value)}%</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSharePanel(todayFlags) {
  const currentMonth = getMonthStart(new Date());
  const monthStats = getMonthStats(currentMonth);
  const completionRate = monthStats.activeDays ? Math.round((monthStats.doneDays / monthStats.activeDays) * 100) : 0;
  const quote = buildShareQuote(todayFlags, completionRate);
  const recentFlags = state.flags.filter((flag) => isSameMonth(new Date(`${flag.date}T12:00:00`), currentMonth));
  const shareTitle = buildShareTitle(todayFlags);
  const mood = getDayMood(todayFlags);

  elements.sharePanel.innerHTML = `
    <article class="share-card">
      <div class="stamp-mark">认真戳</div>
      <div class="share-card-head">
        <span>${formatShortDate(getDateKey(new Date()))}</span>
        <strong>${dateStatusText(getDateCompletionStatus(getDateKey(new Date())))}</strong>
        ${mood ? `<strong>${escapeHtml(moodLabel(mood))}</strong>` : ""}
      </div>
      <h3>${escapeHtml(shareTitle)}</h3>
      <p>${escapeHtml(quote)}</p>
      <div class="share-stats">
        <div>
          <span>今日进度</span>
          <strong>${todayFlags.length ? getFlagsProgress(todayFlags) : 0}%</strong>
        </div>
        <div>
          <span>本月认真天</span>
          <strong>${monthStats.doneDays}/${monthStats.activeDays || 0}</strong>
        </div>
        <div>
          <span>今日体感</span>
          <strong>${mood ? escapeHtml(moodLabel(mood)) : "未记"}</strong>
        </div>
      </div>
      <div class="share-actions">
        <button class="primary-button" type="button" data-action="save-share-image">保存认真戳</button>
        <button class="secondary-button" type="button" data-action="system-share">发给朋友</button>
        <button class="secondary-button" type="button" data-action="copy-share">复制文案</button>
      </div>
    </article>
    <article class="task-sheet reflection-card">
      <div class="sheet-label">今日复盘文案</div>
      <p>${escapeHtml(buildInsight(recentFlags))}</p>
      ${renderCalendarDeck("share")}
      <details class="history-details">
        <summary>查看记录</summary>
        ${renderHistory(recentFlags)}
      </details>
    </article>
  `;

  elements.sharePanel.querySelector('[data-action="copy-share"]').addEventListener("click", () => {
    copyShareText(todayFlags, quote, completionRate);
  });
  elements.sharePanel.querySelector('[data-action="save-share-image"]').addEventListener("click", () => {
    saveShareImage(todayFlags, quote, completionRate);
  });
  elements.sharePanel.querySelector('[data-action="system-share"]').addEventListener("click", () => {
    shareToday(todayFlags, quote, completionRate);
  });
  bindCalendarEvents(elements.sharePanel);
}

function copyShareText(flags, quote, completionRate) {
  const text = buildShareText(flags, quote, completionRate);

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast("文案已复制");
    }).catch(() => {
      showToast("复制没成功，浏览器不给力");
    });
    return;
  }

  showToast("这个浏览器不太配合复制");
}

async function saveShareImage(flags, quote, completionRate) {
  const blob = await createShareBlob(flags, quote, completionRate);
  if (!blob) {
    return;
  }

  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `today-counts-${getDateKey(new Date())}.png`;
  link.click();
  showToast("海报打包好了");
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareToday(flags, quote, completionRate) {
  const text = buildShareText(flags, quote, completionRate);

  if (!navigator.share) {
    copyShareText(flags, quote, completionRate);
    showToast("分享没打开，文案先复制好");
    return;
  }

  try {
    const blob = await createShareBlob(flags, quote, completionRate);
    if (blob && "File" in window) {
      const file = new File([blob], `today-counts-${getDateKey(new Date())}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "今天算数",
          text,
          files: [file]
        });
        return;
      }
    }

    await navigator.share({
      title: "今天算数",
      text,
      url: window.location.href
    });
  } catch (error) {
    if (error?.name !== "AbortError") {
      showToast("分享没打开，可以先保存海报");
    }
  }
}

async function createShareBlob(flags, quote, completionRate) {
  const canvas = document.createElement("canvas");
  const size = 1080;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  let image;

  try {
    image = await loadImage(SHARE_BG_PATH);
  } catch (error) {
    showToast("海报底图没加载好，刷新再试");
    return null;
  }

  const title = buildShareTitle(flags);
  const progress = flags.length ? getFlagsProgress(flags) : 0;

  drawCoverImage(context, image, size, size);
  context.fillStyle = "rgba(255, 248, 234, 0.64)";
  roundRect(context, 98, 312, 884, 500, 42);
  context.fill();

  context.fillStyle = "#2d271f";
  context.font = "700 44px system-ui, -apple-system, sans-serif";
  context.fillText("今天算数", 140, 390);

  context.fillStyle = "#766b5f";
  context.font = "500 26px system-ui, -apple-system, sans-serif";
  context.fillText(formatShortDate(getDateKey(new Date())), 140, 432);

  context.fillStyle = "#2d271f";
  context.font = "800 58px system-ui, -apple-system, sans-serif";
  wrapCanvasText(context, title, 140, 520, 650, 70, 3);

  context.fillStyle = "#766b5f";
  context.font = "500 30px system-ui, -apple-system, sans-serif";
  wrapCanvasText(context, quote, 140, 710, 690, 42, 3);

  context.strokeStyle = "rgba(174, 88, 66, 0.72)";
  context.lineWidth = 8;
  context.beginPath();
  context.arc(808, 424, 88, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "#a55743";
  context.font = "800 32px system-ui, -apple-system, sans-serif";
  context.fillText("认真戳", 756, 436);

  context.fillStyle = "#2f6f55";
  context.font = "800 54px system-ui, -apple-system, sans-serif";
  context.fillText(`${progress}%`, 140, 884);
  context.font = "600 24px system-ui, -apple-system, sans-serif";
  context.fillText(`今日进度 / 本月算数率 ${completionRate}%`, 140, 928);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function showToast(message) {
  const existing = document.querySelector(".toast-message");
  existing?.remove();

  const toast = document.createElement("div");
  toast.className = "toast-message";
  toast.textContent = message;
  document.body.append(toast);

  window.setTimeout(() => {
    toast.classList.add("is-leaving");
  }, 1800);

  window.setTimeout(() => {
    toast.remove();
  }, 2200);
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function drawCoverImage(context, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  context.drawImage(image, x, y, drawWidth, drawHeight);
}

function wrapCanvasText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const characters = [...String(text)];
  let line = "";
  let lineCount = 0;

  for (const character of characters) {
    const testLine = line + character;
    if (context.measureText(testLine).width > maxWidth && line) {
      context.fillText(line, x, y);
      line = character;
      y += lineHeight;
      lineCount += 1;
      if (lineCount >= maxLines - 1) {
        break;
      }
    } else {
      line = testLine;
    }
  }

  if (line && lineCount < maxLines) {
    context.fillText(line, x, y);
  }
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function renderFlagBody(flag, showDetails) {
  return `
    <h3 class="flag-title">${escapeHtml(flag.goal)}</h3>
    ${showDetails ? `<p class="microcopy">状态不好时：${escapeHtml(flag.minimum)}</p>` : ""}
    <dl class="definition-list ${showDetails ? "compact-details" : ""}">
      <div>
        <dt>怎么算数</dt>
        <dd>${escapeHtml(flag.standard)}</dd>
      </div>
      <div>
        <dt>低电量版本</dt>
        <dd>${escapeHtml(flag.minimum)}</dd>
      </div>
    </dl>
  `;
}

function renderFlagSummary(flag, index) {
  return `
    <article class="flag-summary ${escapeHtml(flag.status)}">
      <span>第 ${index + 1} 面</span>
      <strong>${escapeHtml(flag.goal)}</strong>
      <em>${getFlagProgress(flag)}%</em>
    </article>
  `;
}

function renderCalendarDeck(variant = "progress") {
  const dates = getMonthGridDates(calendarCursor);
  const selectedFlags = getFlagsForDate(selectedDateKey);

  return `
    <article class="calendar-card ${variant === "share" ? "calendar-card-inset" : ""}">
      <div class="calendar-toolbar">
        <button class="calendar-nav-button" type="button" data-action="calendar-prev" aria-label="上个月">‹</button>
        <div>
          <span>认真日历</span>
          <strong>${formatMonthTitle(calendarCursor)}</strong>
        </div>
        <button class="calendar-nav-button" type="button" data-action="calendar-next" aria-label="下个月">›</button>
      </div>
      <button class="text-button calendar-today-button" type="button" data-action="calendar-today">回到今天</button>
      <div class="calendar-scroll">
        <div class="calendar-weekdays">
          ${["日", "一", "二", "三", "四", "五", "六"].map((day) => `<span>${day}</span>`).join("")}
        </div>
        <div class="calendar-month-grid">
          ${dates.map(renderCalendarDateButton).join("")}
        </div>
      </div>
      <div class="calendar-legend">
        <span><i class="legend-done"></i>插稳</span>
        <span><i class="legend-partial"></i>推进中</span>
        <span><i class="legend-pending"></i>未开动</span>
      </div>
      <div class="selected-date-card">
        <div class="selected-date-head">
          <div>
            <span>${formatShortDate(selectedDateKey)}</span>
            <strong>${dateStatusText(getDateCompletionStatus(selectedDateKey))}</strong>
          </div>
          <em>${selectedFlags.length ? `${selectedFlags.length} 面 flag` : "空白日"}</em>
        </div>
        ${selectedFlags.length ? `
          <div class="date-flag-list">
            ${selectedFlags.map((flag) => `
              <article>
                <span>${statusText(flag.status)} · ${getFlagProgress(flag)}%</span>
                <strong>${escapeHtml(flag.goal)}</strong>
                <p>低电量版本：${escapeHtml(flag.minimum)}</p>
              </article>
            `).join("")}
          </div>
        ` : `<p class="microcopy">这天还没插旗。空白也没关系，日历是拿来复盘的，不是拿来审判自己的。</p>`}
      </div>
    </article>
  `;
}

function renderCalendarDateButton(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  const status = getDateCompletionStatus(dateKey);
  const isMuted = !isSameMonth(date, calendarCursor);
  const isToday = dateKey === getDateKey(new Date());
  const isSelected = dateKey === selectedDateKey;
  const flags = getFlagsForDate(dateKey);
  const mark = {
    done: "✓",
    partial: "•",
    pending: "○",
    missed: "×"
  }[status] || "";
  return `
    <button class="calendar-date ${escapeHtml(status)} ${isMuted ? "is-muted" : ""} ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}" type="button" data-calendar-date="${dateKey}">
      <strong>${date.getDate()}</strong>
      <span>${mark}</span>
      ${flags.length > 1 ? `<em>${flags.length}</em>` : ""}
    </button>
  `;
}

function bindCalendarEvents(root = document) {
  root.querySelectorAll('[data-action="calendar-prev"]').forEach((button) => {
    button.addEventListener("click", () => {
      calendarCursor = addMonths(calendarCursor, -1);
      selectedDateKey = getDateKey(calendarCursor);
      render();
    });
  });

  root.querySelectorAll('[data-action="calendar-next"]').forEach((button) => {
    button.addEventListener("click", () => {
      calendarCursor = addMonths(calendarCursor, 1);
      selectedDateKey = getDateKey(calendarCursor);
      render();
    });
  });

  root.querySelectorAll('[data-action="calendar-today"]').forEach((button) => {
    button.addEventListener("click", () => {
      const today = new Date();
      selectedDateKey = getDateKey(today);
      calendarCursor = getMonthStart(today);
      render();
    });
  });

  root.querySelectorAll("[data-calendar-date]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDateKey = button.dataset.calendarDate;
      calendarCursor = getMonthStart(new Date(`${selectedDateKey}T12:00:00`));
      render();
    });
  });
}

function renderHistory(recentFlags) {
  const items = [...recentFlags].sort((a, b) => b.date.localeCompare(a.date));

  if (!items.length) {
    return `<div class="empty-state">还没有记录。先在首页立一个 flag。</div>`;
  }

  return `
    <div class="history-list">
      ${items.map((flag) => `
        <div class="history-item">
          <time>${formatShortDate(flag.date)}</time>
          <p>${escapeHtml(flag.goal)}</p>
          <span class="status-pill status-${flag.status}">${shortStatusText(flag.status)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function buildInsight(recentFlags) {
  if (recentFlags.length === 0) {
    return "先别和自己 battle，今天只开一个小副本就够了。";
  }

  const missedOrPartial = recentFlags.filter((flag) => flag.status === "missed" || flag.status === "partial");
  const commonReason = mostCommon(missedOrPartial.map((flag) => flag.reason).filter(Boolean));

  if (!commonReason) {
    return "这个月节奏在线，别给自己加戏，继续小步稳稳走。";
  }

  const suggestions = {
    too_big: "flag 有点膨胀，明天切小块，别一上来就开大。",
    forgot: "不是你不行，是提醒位没站好。明天把闹钟安排上。",
    not_started: "卡在启动很正常。明天先打开文件，别急着上价值。",
    interrupted: "被打断也算人间真实。明天给自己留一小段免打扰。"
  };

  return suggestions[commonReason] || "今天不求满分，能回来补一刀就很可以。";
}

function buildShareQuote(flags, completionRate) {
  if (!flags.length) {
    return "今天还没插旗，但人已经到场，也算没掉线。";
  }
  if (flags.every((flag) => flag.status === "done")) {
    return "今日 flag 已落地，给自己盖个认真戳。";
  }
  if (getFlagsProgress(flags) >= 60) {
    return "进度条已经往前拱了，别说自己没动。";
  }
  if (flags.length > 1) {
    return "今天开了不止一个坑，先保住一面旗就很赚。";
  }
  if (completionRate >= 60) {
    return "节奏在了。今天慢一点也没事，别让 flag 原地失踪。";
  }
  return "今天不和自己 battle，先把 flag 往前挪一格。";
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
    getDayMood(flags) ? `今日体感：${moodLabel(getDayMood(flags))}` : "",
    quote
  ].filter(Boolean).join("\n");
}

function getDayMood(flags) {
  return getPrimaryFlag(flags)?.mood || "";
}

function moodLabel(mood) {
  return MOODS.find(([value]) => value === mood)?.[1] || "";
}

function moodHelperText(mood) {
  return MOODS.find(([value]) => value === mood)?.[2] || "今天的体感已经记下了。";
}

function mostCommon(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function updateFlag(flagId, patch) {
  state.flags = state.flags.map((flag) => flag.id === flagId ? normalizeFlag({ ...flag, ...patch }) : flag);
  saveAndRender();
}

function saveAndRender() {
  saveState();
  render();
  scheduleReminder();
}

function clearAllData() {
  if (!state.flags.length) {
    return;
  }

  if (window.confirm("确定清空所有记录？")) {
    state.flags = [];
    undoStack = [];
    saveAndRender();
  }
}

async function requestNotifications() {
  if (!("Notification" in window)) {
    window.alert("当前浏览器不支持通知。");
    return;
  }

  const permission = await Notification.requestPermission();
  state.settings.notifications = permission === "granted";
  saveState();
  scheduleReminder();
}

function scheduleReminder() {
  window.clearTimeout(reminderTimer);
  const todayFlag = getTodayFlag();

  if (!todayFlag || todayFlag.status !== "pending" || !state.settings.notifications || Notification.permission !== "granted") {
    return;
  }

  const delay = getDelayUntil(todayFlag.reminderTime);
  if (delay <= 0 || delay > 2147483647) {
    return;
  }

  reminderTimer = window.setTimeout(() => {
    new Notification("今天算数", {
      body: `该看看今天的 flag：${todayFlag.goal}`,
      icon: "assets/icon.svg"
    });
  }, delay);
}

function getDelayUntil(time) {
  const [hour, minute] = String(time || DEFAULT_REMINDER).split(":").map(Number);
  const target = new Date();
  target.setHours(hour || 21, minute || 30, 0, 0);
  return target.getTime() - Date.now();
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.register("sw.js");
      registration.active?.postMessage({ type: "CACHE_REFRESH" });
    } catch (error) {
      console.warn("Service worker registration failed", error);
    }
  }
}

function getCurrentStreak() {
  let streak = 0;
  let cursor = new Date();

  for (let index = 0; index < 60; index += 1) {
    const key = getDateKey(cursor);
    const status = getDateCompletionStatus(key);

    if (status !== "done") {
      if (key === getDateKey(new Date()) && ["pending", "partial"].includes(status)) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }

    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getLastNDates(count) {
  const dates = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - count + 1);

  for (let index = 0; index < count; index += 1) {
    dates.push(getDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0);
}

function getMonthGridDates(monthDate) {
  const first = getMonthStart(monthDate);
  const cursor = new Date(first);
  cursor.setDate(cursor.getDate() - cursor.getDay());
  const dates = [];

  for (let index = 0; index < 42; index += 1) {
    dates.push(getDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function getMonthStats(monthDate) {
  const monthFlags = state.flags.filter((flag) => isSameMonth(new Date(`${flag.date}T12:00:00`), monthDate));
  const days = [...new Set(monthFlags.map((flag) => flag.date))];
  const doneDays = days.filter((date) => getDateCompletionStatus(date) === "done").length;

  return {
    activeDays: days.length,
    doneDays,
    flags: monthFlags.length
  };
}

function isSameMonth(date, monthDate) {
  return date.getFullYear() === monthDate.getFullYear() && date.getMonth() === monthDate.getMonth();
}

function getDateCompletionStatus(dateKey) {
  const flags = getFlagsForDate(dateKey);
  if (!flags.length) {
    return "empty";
  }
  if (flags.every((flag) => flag.status === "done")) {
    return "done";
  }
  if (flags.every((flag) => flag.status === "missed")) {
    return "missed";
  }
  if (flags.some((flag) => flag.status === "done" || flag.status === "partial" || getFlagProgress(flag) > 0)) {
    return "partial";
  }
  return "pending";
}

function getFlagsProgress(flags) {
  if (!flags.length) {
    return 0;
  }
  const total = flags.reduce((sum, flag) => sum + getFlagProgress(flag), 0);
  return Math.round(total / flags.length);
}

function getFlagsStory(flags) {
  if (flags.length === 1) {
    return `${getFlagProgress(flags[0])}%`;
  }
  const doneCount = flags.filter((flag) => flag.status === "done").length;
  return `${doneCount}/${flags.length}`;
}

function formatFullDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
}

function formatShortDate(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short"
  }).format(date);
}

function formatMonthTitle(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long"
  }).format(date);
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function buildGreeting(date) {
  const hour = date.getHours();
  if (hour < 6) {
    return "夜深了";
  }
  if (hour < 11) {
    return "早上好";
  }
  if (hour < 14) {
    return "中午好";
  }
  if (hour < 18) {
    return "下午好";
  }
  return "晚上好";
}

function statusText(status) {
  return {
    pending: "进行中",
    done: "算数了",
    partial: "完成一部分",
    missed: "没算数"
  }[status] || "未知";
}

function dateStatusText(status) {
  return {
    empty: "还没插旗",
    pending: "已立 flag",
    partial: "推进中",
    done: "算数了",
    missed: "没算数"
  }[status] || "还没插旗";
}

function shortStatusText(status) {
  return {
    pending: "进行",
    done: "完成",
    partial: "部分",
    missed: "未完"
  }[status] || "空";
}

function reasonText(reason) {
  return Object.fromEntries(REASONS)[reason] || "其他";
}

function getFlagProgress(flag) {
  return clampProgress(flag?.progress ?? (flag?.status === "done" ? 100 : 0));
}

function clampProgress(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(number)));
}

function cloneFlag(flag) {
  return JSON.parse(JSON.stringify(flag));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
