(() => {
  "use strict";

  const Core = window.BoringButtonCore;
  if (!Core) return;

  const STORAGE_KEY = "boring-button-state-v2";
  const LEGACY_STORAGE_KEY = "boring-button-state-v1";
  const MAX_IMPORT_BYTES = 1_000_000;
  const MAX_CUSTOM_TASKS = 200;
  const CATEGORY_LABELS = {
    movement: "движение", attention: "внимание", order: "порядок", observation: "наблюдение", game: "мини-игра", custom: "своё",
    "движение": "движение", "внимание": "внимание", "порядок": "порядок", "наблюдение": "наблюдение", "мини-игра": "мини-игра", "своё": "своё",
  };
  const FALLBACK_TASKS = [
    { id: "fallback-1", category: "movement", title: "поменяй опору", prompt: "встань и медленно перенеси вес с одной ноги на другую десять раз.", durationSec: 30 },
    { id: "fallback-2", category: "attention", title: "найди четыре угла", prompt: "посмотри вокруг и найди взглядом четыре прямых угла. назови их про себя.", durationSec: 30 },
    { id: "fallback-3", category: "order", title: "освободи один квадрат", prompt: "выбери участок поверхности размером с ладонь и убери с него всё лишнее.", durationSec: 60 },
    { id: "fallback-4", category: "observation", title: "послушай дальний звук", prompt: "закрой глаза и найди самый тихий звук в комнате. послушай его до конца.", durationSec: 45 },
    { id: "fallback-5", category: "game", title: "алфавит наоборот", prompt: "попробуй назвать буквы от Я до А. остановись, когда станет смешно.", durationSec: 60 },
  ];

  const $ = (id) => document.getElementById(id);
  const els = {
    start: $("start-button"), empty: $("empty-task"), active: $("active-task"), actions: $("task-actions"),
    timer: $("timer"), timerCaption: $("timer-caption"), timerNote: $("timer-note"), progress: $("timer-progress"),
    timerControls: $("timer-controls"), timerUnit: document.querySelector(".timer-unit"), timerToggle: $("timer-toggle"), timerReset: $("timer-reset"), context: $("task-context"),
    title: $("task-title"), prompt: $("task-prompt"), today: $("today-count"), completed: $("completed-count"),
    taskCount: $("task-count"), customCount: $("custom-task-count"), customEmpty: $("custom-empty"), customList: $("custom-task-list"),
    live: $("live-region"), form: $("custom-form"), importFile: $("import-file"), export: $("export-button"), reset: $("reset-button"),
    resetStats: $("reset-stats-button"), submit: $("custom-submit"), cancelEdit: $("cancel-edit-button"), message: $("settings-message"), settings: $("settings"), settingsLink: document.querySelector(".settings-link"),
  };

  let baseTasks = Core.normalizeTasks(window.BoringButtonTasks || FALLBACK_TASKS);
  let state = readState();
  let currentTask = null;
  let timerId = null;
  let dayTimerId = null;
  let editingTaskId = null;
  let lastRemaining = null;

  function readState() {
    const readStorage = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
    const candidates = [readStorage(STORAGE_KEY), readStorage(LEGACY_STORAGE_KEY), "{}"];
    for (const stored of candidates) {
      if (!stored) continue;
      try { return Core.sanitizeState(JSON.parse(stored)); } catch { /* try the legacy key */ }
    }
    return Core.sanitizeState({});
  }

  function writeState() {
    state = Core.sanitizeState(state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      setMessage("не удалось сохранить изменения на этом устройстве.", true);
    }
    updateStats();
  }
  function refreshToday() {
    const today = Core.todayKey();
    if (state.day === today) return false;
    state.day = today;
    state.todayCompleted = 0;
    writeState();
    return true;
  }
  function scheduleDayRollover() {
    window.clearTimeout(dayTimerId);
    dayTimerId = window.setTimeout(() => {
      refreshToday();
      scheduleDayRollover();
    }, Core.msUntilNextLocalDay() + 50);
  }

  function categoryLabel(category) { return CATEGORY_LABELS[category] || String(category || "своё").toLowerCase(); }
  function formatDuration(seconds) {
    const value = Number(seconds);
    if (value < 60) return `${value} с`;
    return `${Math.round(value / 60)} мин`;
  }
  function formatTime(seconds) {
    const safe = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
  }
  function announce(message) {
    if (!els.live) return;
    els.live.textContent = "";
    window.setTimeout(() => { els.live.textContent = message; }, 20);
  }
  function setMessage(message, isError = false) {
    if (!els.message) return;
    els.message.textContent = message;
    els.message.classList.toggle("error", isError);
  }
  function allTasks() { return [...baseTasks, ...state.customTasks]; }
  function updateStats() {
    els.today.textContent = String(state.todayCompleted);
    els.completed.textContent = String(state.completed);
    els.taskCount.textContent = String(baseTasks.length + state.customTasks.length);
    els.customCount.textContent = String(state.customTasks.length);
    renderCustomTasks();
  }
  function renderCustomTasks() {
    if (!els.customList) return;
    els.customList.replaceChildren();
    els.customEmpty.hidden = state.customTasks.length > 0;
    state.customTasks.forEach((task) => {
      const item = document.createElement("li");
      item.className = "custom-task-item";
      const copy = document.createElement("div");
      copy.className = "custom-task-copy";
      const title = document.createElement("strong");
      title.textContent = task.title;
      const prompt = document.createElement("span");
      prompt.textContent = `${task.prompt} · ${formatDuration(task.durationSec)}`;
      copy.append(title, prompt);
      const actions = document.createElement("div");
      actions.className = "custom-task-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "custom-task-edit";
      edit.textContent = "изменить";
      edit.setAttribute("aria-label", `изменить задачу «${task.title}»`);
      edit.addEventListener("click", () => beginEdit(task));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "custom-task-remove";
      remove.textContent = "удалить";
      remove.setAttribute("aria-label", `удалить задачу «${task.title}»`);
      remove.addEventListener("click", () => {
        const wasCurrent = currentTask?.id === task.id;
        state.customTasks = state.customTasks.filter((entry) => entry.id !== task.id);
        if (editingTaskId === task.id) resetForm();
        if (wasCurrent) resetTaskView(false);
        writeState();
        setMessage("задача удалена из твоего набора.");
        announce("своя задача удалена.");
        const nextRemove = els.customList.querySelector(".custom-task-remove");
        if (nextRemove) nextRemove.focus();
        else els.settings.querySelector("summary")?.focus();
      });
      actions.append(edit, remove);
      item.append(copy, actions);
      els.customList.append(item);
    });
  }

  function resetForm() {
    editingTaskId = null;
    els.form.elements.duration.querySelectorAll("[data-edit-option]").forEach((option) => option.remove());
    els.form.reset();
    els.submit.textContent = "добавить задачу";
    els.cancelEdit.hidden = true;
  }
  function beginEdit(task) {
    editingTaskId = task.id;
    els.form.elements.title.value = task.title;
    els.form.elements.prompt.value = task.prompt;
    const durationSelect = els.form.elements.duration;
    const durationValue = String(task.durationSec);
    if (![...durationSelect.options].some((option) => option.value === durationValue)) {
      const option = document.createElement("option");
      option.value = durationValue;
      option.textContent = formatDuration(task.durationSec);
      option.dataset.editOption = "true";
      durationSelect.append(option);
    }
    durationSelect.value = durationValue;
    const categoryValue = CATEGORY_LABELS[task.category] || task.category;
    els.form.elements.category.value = [...els.form.elements.category.options].some((option) => option.value === categoryValue) ? categoryValue : "своё";
    els.submit.textContent = "сохранить изменения";
    els.cancelEdit.hidden = false;
    els.form.elements.title.focus();
  }

  function updateTimerDisplay(remaining) {
    const safe = Math.max(0, Number(remaining) || 0);
    els.timer.textContent = formatTime(safe);
    const duration = Number(state.session?.durationSec) || 120;
    els.progress.style.strokeDashoffset = String(Math.min(100, Math.max(0, 100 - ((safe / duration) * 100))));
    if (lastRemaining !== Math.ceil(safe)) {
      lastRemaining = Math.ceil(safe);
      els.timer.setAttribute("aria-label", `${formatTime(safe)} осталось`);
    }
  }
  function stopTimerLoop() {
    window.clearInterval(timerId);
    timerId = null;
  }
  function expireSession() {
    if (!state.session) return;
    const wasExpired = state.session.status === "expired";
    state.session.status = "expired";
    state.session.pausedAt = null;
    stopTimerLoop();
    els.timerToggle.hidden = true;
    els.timerToggle.setAttribute("aria-pressed", "false");
    els.timerCaption.textContent = "время вышло";
    els.timerNote.textContent = "можно отметить задачу или взять ещё одну.";
    els.timer.classList.add("timer-ended");
    updateTimerDisplay(0);
    if (!wasExpired) {
      writeState();
      announce("время вышло. можно отметить задачу или взять ещё одну.");
    }
  }
  function tickTimer() {
    if (!state.session) return;
    const remaining = Core.remainingFromSession(state.session, Date.now());
    updateTimerDisplay(remaining);
    if (remaining <= 0) expireSession();
  }
  function startTimerLoop() {
    stopTimerLoop();
    tickTimer();
    if (state.session?.status === "running") timerId = window.setInterval(tickTimer, 250);
  }
  function newSession(task) {
    return { task, durationSec: task.durationSec, startedAt: Date.now(), pausedAt: null, pausedForMs: 0, status: "running" };
  }
  function renderActiveTask(task) {
    currentTask = task;
    els.empty.hidden = true;
    els.active.hidden = false;
    els.timerUnit?.classList.add("is-active");
    els.actions.hidden = false;
    els.timerControls.hidden = false;
    els.timerToggle.hidden = false;
    els.timerToggle.textContent = "пауза";
    els.timerToggle.setAttribute("aria-pressed", "false");
    els.context.textContent = `${categoryLabel(task.category)} · ${formatDuration(task.durationSec)}`;
    els.title.textContent = task.title;
    els.prompt.textContent = task.prompt;
  }
  function showTask(task) {
    if (!task) {
      setMessage("задач пока нет. добавь свою в разделе ниже.", true);
      return;
    }
    state.session = newSession(task);
    state.recentIds = [...state.recentIds.filter((id) => id !== task.id), task.id].slice(-8);
    renderActiveTask(task);
    els.timerCaption.textContent = "осталось";
    els.timerNote.textContent = "можно остановиться раньше.";
    els.timer.classList.remove("timer-ended");
    writeState();
    startTimerLoop();
    els.title.focus({ preventScroll: true });
    announce(`${categoryLabel(task.category)}. ${task.title}. ${task.prompt}`);
  }
  function restoreSession() {
    const session = state.session;
    if (!session) return;
    renderActiveTask(session.task);
    if (session.status === "paused") {
      els.timerCaption.textContent = "пауза";
      els.timerNote.textContent = "продолжи, когда будешь готов.";
      els.timerToggle.textContent = "продолжить";
      els.timerToggle.setAttribute("aria-pressed", "true");
      updateTimerDisplay(Core.remainingFromSession(session, Date.now()));
      return;
    }
    if (session.status === "expired" || Core.remainingFromSession(session, Date.now()) <= 0) {
      expireSession();
      return;
    }
    els.timerCaption.textContent = "осталось";
    els.timerNote.textContent = "можно остановиться раньше.";
    startTimerLoop();
  }
  function resetTaskView(focusStart = true) {
    stopTimerLoop();
    currentTask = null;
    state.session = null;
    els.empty.hidden = false;
    els.active.hidden = true;
    els.timerUnit?.classList.remove("is-active");
    els.actions.hidden = true;
    els.timerControls.hidden = true;
    els.timerToggle.hidden = false;
    els.timerToggle.textContent = "пауза";
    els.timerToggle.setAttribute("aria-pressed", "false");
    els.timer.textContent = "2:00";
    els.timerCaption.textContent = "до 2 минут";
    els.timerNote.textContent = "две минуты — и можно дальше.";
    els.progress.style.strokeDashoffset = "100";
    els.timer.classList.remove("timer-ended");
    lastRemaining = null;
    if (focusStart) els.start.focus();
  }
  function nextTask() {
    const task = Core.chooseTask(allTasks(), currentTask?.id, state.recentIds);
    if (task) showTask(task);
    else setMessage("задач пока нет. добавь свою в разделе ниже.", true);
  }
  function completeTask(kind) {
    if (!currentTask) return;
    if (kind === "done") {
      state.completed += 1;
      state.todayCompleted += 1;
      announce("отмечено как сделанное.");
    } else {
      state.skipped += 1;
      announce("задача пропущена.");
    }
    resetTaskView(false);
    writeState();
    els.start.focus();
  }
  function toggleTimer() {
    if (!state.session) return;
    if (state.session.status === "expired") { restartTimer(); return; }
    if (state.session.status === "paused") {
      const now = Date.now();
      state.session.pausedForMs += Math.max(0, now - state.session.pausedAt);
      state.session.pausedAt = null;
      state.session.status = "running";
      els.timerToggle.textContent = "пауза";
      els.timerToggle.setAttribute("aria-pressed", "false");
      els.timerCaption.textContent = "осталось";
      els.timerNote.textContent = "можно остановиться раньше.";
      writeState();
      startTimerLoop();
      announce("таймер продолжается.");
      return;
    }
    state.session.pausedAt = Date.now();
    state.session.status = "paused";
    stopTimerLoop();
    els.timerToggle.textContent = "продолжить";
    els.timerToggle.setAttribute("aria-pressed", "true");
    els.timerCaption.textContent = "пауза";
    els.timerNote.textContent = "продолжи, когда будешь готов.";
    writeState();
    tickTimer();
    announce("таймер на паузе.");
  }
  function restartTimer() {
    if (!currentTask) return;
    state.session = newSession(currentTask);
    els.timerToggle.hidden = false;
    els.timerToggle.textContent = "пауза";
    els.timerToggle.setAttribute("aria-pressed", "false");
    els.timerCaption.textContent = "осталось";
    els.timerNote.textContent = "можно остановиться раньше.";
    els.timer.classList.remove("timer-ended");
    writeState();
    startTimerLoop();
    announce("таймер начат заново.");
  }
  function parseImportedFile(file, text) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) return Core.parseCsv(text);
    if (name.endsWith(".json")) {
      try { return JSON.parse(text); } catch { throw new Error("не удалось разобрать JSON. проверь файл и попробуй ещё раз."); }
    }
    throw new Error("выбери файл JSON или CSV.");
  }

  els.start.addEventListener("click", () => showTask(Core.chooseTask(allTasks(), currentTask?.id, state.recentIds)));
  els.settingsLink?.addEventListener("click", (event) => {
    event.preventDefault();
    els.settings.open = true;
    els.settings.querySelector("summary")?.focus();
  });
  els.timerToggle.addEventListener("click", toggleTimer);
  els.timerReset.addEventListener("click", restartTimer);
  $("done-button").addEventListener("click", () => completeTask("done"));
  $("skip-button").addEventListener("click", () => completeTask("skip"));
  $("another-button").addEventListener("click", nextTask);
  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(els.form);
    const payload = {
      id: editingTaskId || `custom-${Date.now()}`,
      title: String(data.get("title") || ""),
      prompt: String(data.get("prompt") || ""),
      durationSec: Number(data.get("duration")),
      category: String(data.get("category") || "custom"),
    };
    if (editingTaskId) {
      const others = state.customTasks.filter((task) => task.id !== editingTaskId);
      const result = Core.mergeCustomTasks(others, [payload], baseTasks);
      if (!result.added.length) {
        setMessage("проверь поля: такая задача уже есть или данные не подходят.", true);
        return;
      }
      state.customTasks = state.customTasks.map((task) => task.id === editingTaskId ? result.added[0] : task);
      resetForm();
      writeState();
      setMessage("изменения сохранены.");
      announce("своя задача изменена.");
      return;
    }
    if (state.customTasks.length >= MAX_CUSTOM_TASKS) {
      setMessage(`можно сохранить не больше ${MAX_CUSTOM_TASKS} своих задач.`, true);
      return;
    }
    const result = Core.mergeCustomTasks(state.customTasks, [payload], baseTasks);
    if (!result.added.length) {
      setMessage("проверь поля: такая задача уже есть или данные не подходят.", true);
      return;
    }
    state.customTasks = result.tasks;
    resetForm();
    writeState();
    setMessage("задача добавлена в твой набор.");
    announce("своя задача добавлена.");
  });
  els.cancelEdit.addEventListener("click", () => {
    resetForm();
    setMessage("");
    els.settings.querySelector("summary")?.focus();
  });
  els.importFile.addEventListener("change", async () => {
    const file = els.importFile.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error("файл слишком большой. лимит — 1 МБ.");
      const incoming = Core.normalizeTasks(parseImportedFile(file, await file.text()));
      const result = Core.mergeCustomTasks(state.customTasks, incoming, baseTasks);
      if (!result.added.length) throw new Error("в файле не найдено новых корректных задач.");
      if (state.customTasks.length + result.added.length > MAX_CUSTOM_TASKS) throw new Error(`можно сохранить не больше ${MAX_CUSTOM_TASKS} своих задач.`);
      state.customTasks = result.tasks;
      writeState();
      setMessage(`добавлено задач: ${result.added.length}.`);
      announce("список импортирован.");
    } catch (error) {
      setMessage(error.message || "не удалось прочитать файл.", true);
    } finally {
      els.importFile.value = "";
    }
  });
  els.export.addEventListener("click", () => {
    const payload = { version: 2, exportedAt: new Date().toISOString(), tasks: state.customTasks };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "boring-button-tasks.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("файл со своими задачами скачан.");
  });
  els.reset.addEventListener("click", () => {
    if (!state.customTasks.length) { setMessage("своих задач пока нет."); return; }
    if (!window.confirm("удалить все свои задачи?")) return;
    state.customTasks = [];
    if (currentTask && !baseTasks.some((task) => task.id === currentTask.id)) resetTaskView(false);
    writeState();
    setMessage("свои задачи удалены.");
    announce("свои задачи удалены.");
  });
  els.resetStats?.addEventListener("click", () => {
    if (!state.completed && !state.skipped && !state.todayCompleted) { setMessage("статистика уже пустая."); return; }
    if (!window.confirm("сбросить локальную статистику?")) return;
    state.completed = 0;
    state.skipped = 0;
    state.todayCompleted = 0;
    writeState();
    setMessage("статистика сброшена.");
    announce("статистика сброшена.");
  });
  els.settings.addEventListener("toggle", () => {
    if (els.settings.open) setMessage("");
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    let nextState;
    try { nextState = JSON.parse(event.newValue || "{}"); } catch { return; }
    state = Core.sanitizeState(nextState);
    updateStats();
    if (!currentTask && state.session) restoreSession();
    if (currentTask && !state.session) resetTaskView(false);
    if (currentTask && state.session) restoreSession();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    refreshToday();
    tickTimer();
  });
  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target.matches("input, select, textarea") || target.closest("a, summary, [contenteditable=\"true\"]")) return;
    if (event.key === "Escape") {
      if (els.settings.open) { els.settings.open = false; els.settingsLink?.focus(); return; }
      if (currentTask) completeTask("skip");
      return;
    }
    if (event.key === "Enter" && !target.closest("button")) {
      event.preventDefault();
      currentTask ? nextTask() : showTask(Core.chooseTask(allTasks(), null, state.recentIds));
      return;
    }
    if (!currentTask) return;
    const key = event.key.toLowerCase();
    if (key === "d") completeTask("done");
    if (key === "s") completeTask("skip");
    if (key === "n") nextTask();
  });

  refreshToday();
  updateStats();
  scheduleDayRollover();
  restoreSession();
})();
