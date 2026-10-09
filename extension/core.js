(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BoringButtonCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  "use strict";

  const MIN_DURATION = 10;
  const MAX_DURATION = 120;
  const MAX_TITLE_LENGTH = 80;
  const MAX_PROMPT_LENGTH = 240;
  const MAX_CUSTOM_TASKS = 200;
  const CATEGORIES = new Set(["movement", "attention", "order", "observation", "game", "custom", "движение", "внимание", "порядок", "наблюдение", "мини-игра", "своё"]);

  function pad(value) { return String(value).padStart(2, "0"); }
  function todayKey(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  function msUntilNextLocalDay(date = new Date()) {
    const next = new Date(date.getTime());
    next.setHours(24, 0, 0, 0);
    return Math.max(1, next.getTime() - date.getTime());
  }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function taskIdentity(task) { return `${text(task.title).toLocaleLowerCase()}|${text(task.prompt).toLocaleLowerCase()}`; }
  function createId(prefix = "custom") { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`; }
  function validDuration(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || !Number.isInteger(number) || number <= 0) return null;
    return Math.min(MAX_DURATION, Math.max(MIN_DURATION, number));
  }
  function normalizeTask(input, fallbackId = createId("task")) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const title = text(input.title);
    const prompt = text(input.prompt ?? input.description);
    const durationSec = validDuration(input.durationSec ?? input.duration);
    if (!title || !prompt || title.length > MAX_TITLE_LENGTH || prompt.length > MAX_PROMPT_LENGTH || durationSec === null) return null;
    const rawId = text(input.id);
    const category = text(input.category).toLowerCase() || "custom";
    return {
      id: rawId || fallbackId,
      category: CATEGORIES.has(category) ? category : "custom",
      title,
      prompt,
      durationSec,
    };
  }
  function normalizeTasks(input) {
    const list = Array.isArray(input) ? input : (Array.isArray(input?.tasks) ? input.tasks : []);
    const ids = new Set();
    const result = [];
    list.forEach((item, index) => {
      const task = normalizeTask(item, `task-${index + 1}`);
      if (!task || ids.has(task.id)) return;
      ids.add(task.id);
      result.push(task);
    });
    return result;
  }

  function parseCsvRecords(source) {
    const csv = String(source ?? "");
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;
    for (let i = 0; i < csv.length; i += 1) {
      const char = csv[i];
      if (char === '"') {
        if (quoted && csv[i + 1] === '"') { value += '"'; i += 1; }
        else { quoted = !quoted; }
      } else if (char === "," && !quoted) {
        row.push(value.trim()); value = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && csv[i + 1] === "\n") i += 1;
        row.push(value.trim()); value = "";
        if (row.some((cell) => cell !== "")) rows.push(row);
        row = [];
      } else {
        value += char;
      }
    }
    if (quoted) throw new Error("В CSV осталась незакрытая кавычка.");
    row.push(value.trim());
    if (row.some((cell) => cell !== "")) rows.push(row);
    return rows;
  }
  function parseCsv(source) {
    const rows = parseCsvRecords(source);
    if (!rows.length) return [];
    const first = rows[0].map((cell) => cell.replace(/^\ufeff/, "").toLowerCase());
    const hasHeader = first.includes("title") || first.includes("prompt");
    const headers = hasHeader ? first : ["title", "prompt", "durationsec", "category", "id"];
    const start = hasHeader ? 1 : 0;
    const indexOf = (name, fallback) => {
      const index = headers.indexOf(name);
      return index === -1 ? fallback : index;
    };
    const titleIndex = indexOf("title", 0);
    const promptIndex = indexOf("prompt", 1);
    const durationIndex = indexOf("durationsec", indexOf("duration", 2));
    const categoryIndex = indexOf("category", 3);
    const idIndex = indexOf("id", 4);
    return rows.slice(start).map((cells, rowIndex) => ({
      id: cells[idIndex] || `import-${Date.now()}-${rowIndex + 1}`,
      title: cells[titleIndex] || "",
      prompt: cells[promptIndex] || "",
      durationSec: cells[durationIndex] || "",
      category: cells[categoryIndex] || "custom",
    }));
  }

  function uniqueId(preferred, used, prefix = "custom") {
    let id = text(preferred) || createId(prefix);
    while (used.has(id)) id = createId(prefix);
    used.add(id);
    return id;
  }
  function mergeCustomTasks(existingInput, incomingInput, baseInput = []) {
    const existing = normalizeTasks(existingInput);
    const base = normalizeTasks(baseInput);
    const usedIds = new Set([...existing, ...base].map((task) => task.id));
    const identities = new Set([...existing, ...base].map(taskIdentity));
    const added = [];
    let rejected = 0;
    (Array.isArray(incomingInput) ? incomingInput : []).forEach((item) => {
      const task = normalizeTask(item, createId("custom"));
      if (!task || identities.has(taskIdentity(task))) { rejected += 1; return; }
      task.id = uniqueId(task.id, usedIds);
      identities.add(taskIdentity(task));
      added.push(task);
    });
    return { tasks: [...existing, ...added], added, rejected };
  }

  function nonNegativeInt(value) {
    const number = Number(value);
    return Number.isFinite(number) && Number.isInteger(number) && number >= 0 ? number : 0;
  }
  function sanitizeSession(raw) {
    if (!raw || typeof raw !== "object") return null;
    const task = normalizeTask(raw.task, text(raw.task?.id) || createId("session"));
    const durationSec = validDuration(raw.durationSec ?? task?.durationSec);
    if (!task || durationSec === null || !Number.isFinite(Number(raw.startedAt))) return null;
    const startedAt = Number(raw.startedAt);
    const pausedAt = raw.pausedAt === null || raw.pausedAt === undefined ? null : Number(raw.pausedAt);
    const pausedForMs = Number(raw.pausedForMs) || 0;
    if (!Number.isFinite(pausedForMs) || pausedForMs < 0 || (pausedAt !== null && !Number.isFinite(pausedAt))) return null;
    return { task, durationSec, startedAt, pausedAt, pausedForMs, status: raw.status === "paused" ? "paused" : (raw.status === "expired" ? "expired" : "running") };
  }
  function sanitizeState(raw, now = new Date()) {
    const source = raw && typeof raw === "object" ? raw : {};
    const today = todayKey(now);
    // persisted data is untrusted: keep the local state bounded even if an
    // older build or a hand-edited localStorage value contains more rows.
    const customTasks = normalizeTasks(source.customTasks).slice(0, MAX_CUSTOM_TASKS);
    const rawDay = text(source.day);
    return {
      version: 2,
      customTasks,
      completed: nonNegativeInt(source.completed),
      skipped: nonNegativeInt(source.skipped),
      todayCompleted: rawDay === today ? nonNegativeInt(source.todayCompleted) : 0,
      day: today,
      recentIds: Array.isArray(source.recentIds) ? source.recentIds.filter((id) => typeof id === "string").slice(-8) : [],
      session: sanitizeSession(source.session),
    };
  }

  function chooseTask(tasks, currentId = null, recentIds = [], random = Math.random) {
    const list = Array.isArray(tasks) ? tasks : [];
    if (!list.length) return null;
    const recent = new Set(Array.isArray(recentIds) ? recentIds : []);
    const preferred = list.filter((task) => task.id !== currentId && !recent.has(task.id));
    const withoutCurrent = list.filter((task) => task.id !== currentId);
    const pool = preferred.length ? preferred : (withoutCurrent.length ? withoutCurrent : list);
    const index = Math.min(pool.length - 1, Math.max(0, Math.floor(Number(random()) * pool.length)));
    return pool[index];
  }
  function remainingFromSession(session, nowMs = Date.now()) {
    if (!session || !Number.isFinite(Number(session.startedAt))) return 0;
    const pausedAt = session.pausedAt === null || session.pausedAt === undefined ? null : Number(session.pausedAt);
    const effectiveNow = pausedAt === null ? nowMs : pausedAt;
    const elapsedMs = Math.max(0, effectiveNow - Number(session.startedAt) - (Number(session.pausedForMs) || 0));
    const totalMs = Math.max(0, Number(session.durationSec) * 1000);
    return Math.max(0, Math.ceil((totalMs - elapsedMs) / 1000));
  }

  return {
    CATEGORIES,
    MAX_DURATION,
    MAX_PROMPT_LENGTH,
    MAX_TITLE_LENGTH,
    MAX_CUSTOM_TASKS,
    todayKey,
    msUntilNextLocalDay,
    normalizeTask,
    normalizeTasks,
    parseCsv,
    mergeCustomTasks,
    sanitizeState,
    chooseTask,
    remainingFromSession,
    taskIdentity,
  };
});
