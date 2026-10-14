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
    heading: $("start-title"), nextPicker: $("next-picker"), nextChoice: $("next-choice"), modeSelect: $("mode-select"),
    panel: $("play-panel"), poolNote: $("pool-note"), favorite: $("favorite-button"),
    favoriteCount: $("favorite-count"), favoriteList: $("favorite-list"), favoritesEmpty: $("favorites-empty"),
    completion: $("completion-task"), completionTitle: $("completion-title"), taskCopy: $("task-copy"),
    favoriteSymbol: $("favorite-button").querySelector("span"),
    durationOptions: document.querySelector(".duration-options"), dial: document.querySelector(".dial-face"),
    hideTask: $("hide-task-button"), taskFeedback: $("task-feedback"), poolRecovery: $("pool-recovery"),
    hiddenLibrary: $("hidden-library"), hiddenCount: $("hidden-count"), hiddenEmpty: $("hidden-empty"), hiddenList: $("hidden-task-list"),
  };

  let baseTasks = Core.normalizeTasks(window.BoringButtonTasks || FALLBACK_TASKS);
  let migrationNeeded = false;
  let state = readState();
  let currentTask = null;
  let timerId = null;
  let dayTimerId = null;
  let editingTaskId = null;
  let lastRemaining = null;
  let announcementTimer = null;
  let customListKey = "";
  let favoriteListKey = "";
  let hiddenListKey = "";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const motionStyle = getComputedStyle(document.documentElement);
  const motion = {
    panel: parseFloat(motionStyle.getPropertyValue("--motion-panel")) || 280,
    episode: parseFloat(motionStyle.getPropertyValue("--motion-episode")) || 520,
    easing: motionStyle.getPropertyValue("--ease-settle").trim() || "ease-out",
  };
  const feedbackAnimations = new Map();
  function stopFeedback() {
    feedbackAnimations.forEach((animation) => animation.cancel());
    feedbackAnimations.clear();
  }
  function feedback(element, frames, options = {}) {
    if (!element) return;
    feedbackAnimations.get(element)?.cancel();
    if (reducedMotion.matches || typeof element.animate !== "function") return;
    const animation = element.animate(frames, { duration: motion.panel, easing: motion.easing, ...options });
    feedbackAnimations.set(element, animation);
    animation.onfinish = animation.oncancel = () => {
      if (feedbackAnimations.get(element) === animation) feedbackAnimations.delete(element);
    };
  }
  reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) stopFeedback(); });
  function deliverCard() {
    feedback(els.taskCopy, [
      { opacity: .35, transform: "translate(10px, 5px) rotate(1deg)" },
      { opacity: 1, transform: "translate(0, 0) rotate(0)" },
    ]);
  }
  function markCustomTask(id) {
    const item = [...els.customList.children].find((entry) => entry.dataset.taskId === id);
    feedback(item?.querySelector(".custom-task-copy"), [
      { backgroundColor: "#e3e7ff", transform: "translateX(5px)" },
      { backgroundColor: "transparent", transform: "translateX(0)" },
    ], { duration: motion.episode });
  }
  function updateDurationIndicator() {
    const selected = els.durationOptions.querySelector('[aria-pressed="true"]');
    if (!selected) return;
    els.durationOptions.style.setProperty("--selection-x", `${selected.offsetLeft}px`);
    els.durationOptions.style.setProperty("--selection-width", `${selected.offsetWidth}px`);
    els.durationOptions.classList.add("has-selection");
  }
  const durationObserver = typeof ResizeObserver === "function" ? new ResizeObserver(updateDurationIndicator) : null;
  durationObserver?.observe(els.durationOptions);

  function readState() {
    const readStorage = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
    const candidates = [readStorage(STORAGE_KEY), readStorage(LEGACY_STORAGE_KEY), "{}"];
    for (const stored of candidates) {
      if (!stored) continue;
      try {
        const sanitized = Core.sanitizeState(JSON.parse(stored));
        const reconciled = Core.reconcileTaskIds(sanitized, baseTasks);
        migrationNeeded = reconciled !== sanitized;
        return reconciled;
      } catch { /* try the legacy key */ }
    }
    return Core.sanitizeState({});
  }

  function writeState() {
    state = Core.sanitizeState(state);
    let saved = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      saved = false;
      setMessage("не удалось сохранить изменения на этом устройстве.", true);
    }
    updateStats();
    return saved;
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
    return value % 60 === 0 ? `${value / 60} мин` : `${value} с`;
  }
  function formatTime(seconds) {
    const safe = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
  }
  function announce(message) {
    if (!els.live) return;
    window.clearTimeout(announcementTimer);
    els.live.textContent = "";
    announcementTimer = window.setTimeout(() => { els.live.textContent = message; }, 20);
  }
  function setMessage(message, isError = false) {
    if (!els.message) return;
    els.message.textContent = message;
    els.message.classList.toggle("error", isError);
    feedback(els.message, [{ opacity: .4 }, { opacity: 1 }]);
    if (isError) els.settings.open = true;
  }
  function allTasks() { return [...baseTasks, ...state.customTasks]; }
  function availableTasks() { return Core.filterTasks(allTasks(), state.preferences, state.favoriteIds, state.hiddenTaskIds); }
  function updateSelection() {
    els.modeSelect.value = state.preferences.mode;
    els.nextChoice.textContent = `для следующего занятия: ${els.modeSelect.selectedOptions[0].textContent} · до ${formatDuration(state.preferences.maxDuration)}`;
    document.querySelectorAll("[data-duration]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.duration) === state.preferences.maxDuration));
    });
    const pool = availableTasks();
    const hasHiddenMatches = !pool.length && Core.filterTasks(allTasks(), state.preferences, state.favoriteIds).length > 0;
    els.poolRecovery.hidden = !hasHiddenMatches;
    updateDurationIndicator();
    els.start.disabled = !pool.length;
    $("another-button").disabled = !pool.length;
    $("completion-another").disabled = !pool.length;
    els.poolNote.classList.toggle("is-empty", !pool.length);
    els.poolNote.textContent = pool.length
      ? `занятий в этом наборе: ${pool.length} · ${pool.length === 1 ? "пока одно — можно добавить своё" : "без повторов до конца набора"}`
      : hasHiddenMatches
        ? "подходящие занятия скрыты. верни одно из списка ниже."
      : state.preferences.mode === "favorites" && !state.favoriteIds.length
        ? "сохрани занятие через ♡ или выбери «как угодно»."
        : "здесь пока пусто. добавь времени или выбери другое занятие.";
    if (!currentTask) {
      const seconds = state.preferences.maxDuration;
      els.timer.textContent = formatTime(seconds);
      els.timer.setAttribute("aria-label", `до ${formatDuration(seconds)}`);
      els.timerCaption.textContent = `до ${formatDuration(seconds)}`;
    }
    updateFavoriteButton();
    renderFavorites();
  }
  function updateFavoriteButton() {
    const saved = Boolean(currentTask && state.favoriteIds.includes(currentTask.id));
    els.favorite.setAttribute("aria-pressed", String(saved));
    els.favorite.setAttribute("aria-label", saved ? "убрать из избранного" : "сохранить в избранное");
    els.favoriteSymbol.textContent = saved ? "♥" : "♡";
  }
  function toggleFavorite(task) {
    if (!task) return;
    const saved = state.favoriteIds.includes(task.id);
    state.favoriteIds = saved ? state.favoriteIds.filter((id) => id !== task.id) : [...state.favoriteIds, task.id];
    writeState();
    announce(saved ? "занятие убрано из избранного." : "занятие сохранено в избранное.");
    if (currentTask?.id === task.id) feedback(els.favoriteSymbol, [
      { transform: "scale(1) rotate(0)" },
      { transform: `scale(${saved ? .8 : 1.22}) rotate(-12deg)`, offset: .45 },
      { transform: "scale(1) rotate(0)" },
    ]);
  }
  function renderFavorites() {
    const favorites = allTasks().filter((task) => state.favoriteIds.includes(task.id) && !state.hiddenTaskIds.includes(task.id));
    els.favoriteCount.textContent = String(favorites.length);
    els.favoritesEmpty.hidden = favorites.length > 0;
    $("favorites-note").hidden = favorites.length === 0;
    const key = JSON.stringify(favorites);
    if (key === favoriteListKey) return;
    favoriteListKey = key;
    els.favoriteList.replaceChildren();
    favorites.forEach((task) => {
      const item = document.createElement("li");
      item.className = "favorite-item";
      const copy = document.createElement("div");
      copy.className = "custom-task-copy";
      const title = document.createElement("strong");
      title.textContent = task.title;
      const meta = document.createElement("span");
      meta.textContent = `${categoryLabel(task.category)} · ${formatDuration(task.durationSec)}`;
      copy.append(title, meta);
      const start = document.createElement("button");
      start.type = "button";
      start.className = "action-button";
      start.textContent = "начать";
      start.setAttribute("aria-label", `начать занятие «${task.title}»`);
      start.addEventListener("click", () => {
        showTask(task);
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "favorite-button";
      const symbol = document.createElement("span");
      symbol.textContent = "×";
      symbol.setAttribute("aria-hidden", "true");
      remove.append(symbol);
      remove.setAttribute("aria-label", `убрать «${task.title}» из избранного`);
      remove.addEventListener("click", () => {
        toggleFavorite(task);
        $("favorites-library").querySelector("summary").focus();
      });
      item.append(copy, start, remove);
      els.favoriteList.append(item);
    });
  }
  function updateStats() {
    els.timerUnit.dataset.state = state.session?.status || "idle";
    els.today.textContent = String(state.todayCompleted);
    els.completed.textContent = String(state.completed);
    els.taskCount.textContent = String(baseTasks.length + state.customTasks.length);
    els.customCount.textContent = String(state.customTasks.length);
    renderCustomTasks();
    renderHiddenTasks();
    updateSelection();
  }
  function renderHiddenTasks() {
    const hidden = allTasks().filter((task) => state.hiddenTaskIds.includes(task.id));
    els.hiddenCount.textContent = String(hidden.length);
    els.hiddenEmpty.hidden = hidden.length > 0;
    const key = JSON.stringify(hidden);
    if (key === hiddenListKey) return;
    hiddenListKey = key;
    els.hiddenList.replaceChildren();
    hidden.forEach((task) => {
      const item = document.createElement("li");
      item.className = "custom-task-item";
      const copy = document.createElement("div");
      copy.className = "custom-task-copy";
      const title = document.createElement("strong");
      title.textContent = task.title;
      const meta = document.createElement("span");
      meta.textContent = `${categoryLabel(task.category)} · ${formatDuration(task.durationSec)}`;
      copy.append(title, meta);
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "action-button";
      restore.textContent = "вернуть";
      restore.setAttribute("aria-label", `вернуть занятие «${task.title}» в набор`);
      restore.addEventListener("click", () => {
        state.hiddenTaskIds = state.hiddenTaskIds.filter((id) => id !== task.id);
        const saved = writeState();
        if (saved) setMessage("занятие снова в наборе.");
        announce("занятие снова в наборе.");
        els.hiddenLibrary.querySelector("summary").focus();
      });
      item.append(copy, restore);
      els.hiddenList.append(item);
    });
  }
  function renderCustomTasks() {
    if (!els.customList) return;
    const key = JSON.stringify(state.customTasks);
    if (key === customListKey) return;
    customListKey = key;
    els.customList.replaceChildren();
    els.customEmpty.hidden = state.customTasks.length > 0;
    state.customTasks.forEach((task) => {
      const item = document.createElement("li");
      item.className = "custom-task-item";
      item.dataset.taskId = task.id;
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
        state.favoriteIds = state.favoriteIds.filter((id) => id !== task.id);
        state.hiddenTaskIds = state.hiddenTaskIds.filter((id) => id !== task.id);
        state.drawnIds = state.drawnIds.filter((id) => id !== task.id);
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
    els.timerNote.textContent = "пауза подошла к концу. отметь, что получилось.";
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
  function setScene(scene, resetChoice = false) {
    const sceneChanged = document.body.dataset.scene !== scene;
    document.body.dataset.scene = scene;
    els.heading.hidden = scene !== "idle";
    els.nextPicker.hidden = scene === "complete";
    if (sceneChanged || resetChoice) els.nextPicker.open = scene === "idle";
    els.timerUnit.hidden = scene !== "task";
    els.hideTask.hidden = scene !== "task";
  }
  function focusVisible(element) {
    element.focus({ preventScroll: true });
    const rect = element.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) element.scrollIntoView({ block: "start", behavior: "instant" });
  }
  function renderActiveTask(task, resetChoice = false) {
    setScene("task", resetChoice);
    currentTask = task;
    els.taskFeedback.hidden = true;
    document.body.classList.add("has-task");
    els.completion.hidden = true;
    els.panel.classList.remove("is-complete");
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
    els.timer.classList.remove("timer-ended");
    updateFavoriteButton();
  }
  function showTask(task) {
    if (!task) {
      setMessage("задач пока нет. добавь свою в разделе ниже.", true);
      return;
    }
    state.session = newSession(task);
    state.drawnIds = [...state.drawnIds.filter((id) => id !== task.id), task.id];
    stopFeedback();
    state.recentIds = [...state.recentIds.filter((id) => id !== task.id), task.id].slice(-8);
    renderActiveTask(task, true);
    deliverCard();
    els.timerCaption.textContent = "осталось";
    els.timerNote.textContent = "можно остановиться раньше.";
    els.timer.classList.remove("timer-ended");
    writeState();
    startTimerLoop();
    focusVisible(els.title);
    announce(`${categoryLabel(task.category)}. ${task.title}. ${task.prompt}`);
  }
  function restoreSession() {
    const session = state.session;
    if (!session) return;
    stopFeedback();
    stopTimerLoop();
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
    setScene("idle");
    stopFeedback();
    stopTimerLoop();
    currentTask = null;
    els.taskFeedback.hidden = true;
    document.body.classList.remove("has-task");
    state.session = null;
    els.completion.hidden = true;
    els.panel.classList.remove("is-complete");
    els.empty.hidden = false;
    els.active.hidden = true;
    els.timerUnit?.classList.remove("is-active");
    els.actions.hidden = true;
    els.timerControls.hidden = true;
    els.timerToggle.hidden = false;
    els.timerToggle.textContent = "пауза";
    els.timerToggle.setAttribute("aria-pressed", "false");
    els.timer.textContent = formatTime(state.preferences.maxDuration);
    els.timerCaption.textContent = `до ${formatDuration(state.preferences.maxDuration)}`;
    els.timerNote.textContent = "короткая пауза. и дальше по своим делам.";
    els.progress.style.strokeDashoffset = "100";
    els.timer.classList.remove("timer-ended");
    lastRemaining = null;
    if (focusStart) els.start.focus();
  }
  function nextTask() {
    const result = Core.drawTask(availableTasks(), currentTask?.id, state.drawnIds);
    if (result.task) {
      state.drawnIds = result.drawnIds;
      showTask(result.task);
    }
    else announce(els.poolNote.textContent);
  }
  function hideCurrentTask() {
    if (!currentTask) return;
    const id = currentTask.id;
    state.hiddenTaskIds = [...new Set([...state.hiddenTaskIds, id])];
    state.drawnIds = state.drawnIds.filter((drawnId) => drawnId !== id);
    resetTaskView(false);
    const saved = writeState();
    els.taskFeedback.textContent = saved
      ? "занятие скрыто. вернуть его можно в «моих задачах»."
      : "занятие скрыто до закрытия страницы. сохранить выбор не удалось.";
    els.taskFeedback.hidden = false;
    if (!els.start.disabled) els.start.focus({ preventScroll: true });
    else if (!els.poolRecovery.hidden) els.poolRecovery.focus({ preventScroll: true });
    else els.modeSelect.focus();
  }
  function completeTask(kind) {
    if (!currentTask) return;
    if (kind === "done") {
      state.completed += 1;
      state.todayCompleted += 1;
      announce("маленькое дело сделано. можно возвращаться к своему дню.");
    } else {
      state.skipped += 1;
      announce("задача пропущена.");
    }
    resetTaskView(false);
    writeState();
    if (kind === "done") {
      els.empty.hidden = true;
      els.completion.hidden = false;
      els.panel.classList.add("is-complete");
      setScene("complete");
      feedback(els.today, [{ opacity: .3 }, { opacity: 1 }]);
      focusVisible(els.completionTitle);
    } else if (!els.start.disabled) els.start.focus();
    else els.modeSelect.focus();
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
    feedback(els.dial, [{ transform: "rotate(-24deg)" }, { transform: "rotate(0)" }]);
  }
  function parseImportedFile(file, text) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) return Core.parseCsv(text);
    if (name.endsWith(".json")) {
      try { return JSON.parse(text); } catch { throw new Error("не удалось разобрать json. проверь файл и попробуй ещё раз."); }
    }
    throw new Error("выбери файл json или csv.");
  }

  els.start.addEventListener("click", nextTask);
  function beginNewRound() {
    state.drawnIds = currentTask && availableTasks().some((task) => task.id === currentTask.id) ? [currentTask.id] : [];
  }
  els.modeSelect.addEventListener("change", () => {
    if (state.preferences.mode === els.modeSelect.value) return;
    state.preferences.mode = els.modeSelect.value;
    beginNewRound();
    writeState();
  });
  document.querySelectorAll("[data-duration]").forEach((button) => {
    button.addEventListener("click", () => {
      const duration = Number(button.dataset.duration);
      const changed = state.preferences.maxDuration !== duration;
      state.preferences.maxDuration = duration;
      if (changed) beginNewRound();
      writeState();
    });
  });
  els.favorite.addEventListener("click", () => toggleFavorite(currentTask));
  els.hideTask.addEventListener("click", hideCurrentTask);
  els.poolRecovery.addEventListener("click", () => {
    els.settings.open = true;
    els.hiddenLibrary.open = true;
    els.hiddenLibrary.querySelector("summary").focus();
    els.hiddenLibrary.scrollIntoView({ block: "center" });
  });
  $("completion-another").addEventListener("click", nextTask);
  $("return-button").addEventListener("click", () => {
    resetTaskView(false);
    if (!els.start.disabled) focusVisible(els.start);
    else els.modeSelect.focus();
  });
  els.settingsLink?.addEventListener("click", (event) => {
    event.preventDefault();
    els.settings.open = true;
    els.settings.querySelector("summary")?.focus();
    els.settings.scrollIntoView({ block: "start" });
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
      const saved = writeState();
      if (saved) setMessage("изменения сохранены.");
      markCustomTask(payload.id);
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
    const saved = writeState();
    if (saved) setMessage("задача добавлена в твой набор.");
    markCustomTask(result.added[0].id);
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
    const hadFocus = document.activeElement === els.importFile;
    els.importFile.disabled = true;
    els.importFile.closest("label").setAttribute("aria-disabled", "true");
    els.message.setAttribute("aria-busy", "true");
    setMessage("читаю файл…");
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error("файл слишком большой. лимит — 1 МБ.");
      const incoming = Core.normalizeTasks(parseImportedFile(file, await file.text()));
      const result = Core.mergeCustomTasks(state.customTasks, incoming, baseTasks);
      if (!result.added.length) throw new Error("в файле не найдено новых корректных задач.");
      if (state.customTasks.length + result.added.length > MAX_CUSTOM_TASKS) throw new Error(`можно сохранить не больше ${MAX_CUSTOM_TASKS} своих задач.`);
      state.customTasks = result.tasks;
      const saved = writeState();
      if (saved) setMessage(`добавлено задач: ${result.added.length}.`);
      markCustomTask(result.added[0].id);
      announce("список импортирован.");
    } catch (error) {
      setMessage(error.message || "не удалось прочитать файл.", true);
    } finally {
      els.importFile.value = "";
      els.importFile.disabled = false;
      els.importFile.closest("label").removeAttribute("aria-disabled");
      els.message.removeAttribute("aria-busy");
      if (hadFocus && document.activeElement === document.body) els.importFile.focus({ preventScroll: true });
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
    state.favoriteIds = state.favoriteIds.filter((id) => !state.customTasks.some((task) => task.id === id));
    const customIds = new Set(state.customTasks.map((task) => task.id));
    state.hiddenTaskIds = state.hiddenTaskIds.filter((id) => !customIds.has(id));
    state.drawnIds = state.drawnIds.filter((id) => !customIds.has(id));
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
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    let nextState;
    try { nextState = JSON.parse(event.newValue || "{}"); } catch { return; }
    state = Core.reconcileTaskIds(Core.sanitizeState(nextState), baseTasks);
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
  window.addEventListener("pagehide", () => {
    stopFeedback();
    stopTimerLoop();
    window.clearTimeout(announcementTimer);
    window.clearTimeout(dayTimerId);
    durationObserver?.disconnect();
  });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    durationObserver?.observe(els.durationOptions);
    refreshToday();
    scheduleDayRollover();
    restoreSession();
  });
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const target = event.target;
    if (!(target instanceof Element) || target.matches("input, select, textarea") || target.isContentEditable || target.closest("a, summary")) return;
    if (event.key === "Escape") {
      if (els.settings.open) { els.settings.open = false; els.settingsLink?.focus(); return; }
      if (currentTask) completeTask("skip");
      return;
    }
    if (event.key === "Enter" && !target.closest("button")) {
      event.preventDefault();
      nextTask();
      return;
    }
    if (!currentTask) return;
    const key = event.key.toLowerCase();
    if (["d", "s", "n"].includes(key)) event.preventDefault();
    if (key === "d") completeTask("done");
    if (key === "s") completeTask("skip");
    if (key === "n") nextTask();
  });

  setScene("idle");
  refreshToday();
  if (migrationNeeded) writeState();
  else updateStats();
  scheduleDayRollover();
  restoreSession();
})();
