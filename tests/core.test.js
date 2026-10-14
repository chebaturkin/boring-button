const test = require('node:test');
const assert = require('node:assert/strict');
const {
  todayKey,
  msUntilNextLocalDay,
  normalizeTask,
  normalizeTasks,
  parseCsv,
  mergeCustomTasks,
  sanitizeState,
  chooseTask,
  remainingFromSession,
  filterTasks,
  drawTask,
  reconcileTaskIds,
} = require('../core.js');

test('todayKey uses the local calendar date', () => {
  const date = new Date(2026, 9, 8, 23, 59, 0);
  assert.equal(todayKey(date), '2026-10-08');
});

test('msUntilNextLocalDay points to the next local midnight', () => {
  const date = new Date(2026, 9, 8, 23, 59, 59, 500);
  assert.equal(msUntilNextLocalDay(date), 500);
});

test('normalizeTask rejects incomplete input and normalizes duration', () => {
  assert.equal(normalizeTask({ title: '', prompt: 'x', durationSec: 20 }), null);
  assert.equal(normalizeTask({ title: 'x', prompt: 'y', durationSec: '30.5' }), null);
  assert.deepEqual(normalizeTask({ id: 'a', title: ' x ', prompt: ' y ', durationSec: 999, category: 'movement' }), {
    id: 'a', title: 'x', prompt: 'y', durationSec: 120, category: 'movement'
  });
});

test('normalizeTasks filters malformed rows and duplicate ids', () => {
  const result = normalizeTasks([
    { id: 'a', title: 'One', prompt: 'Do one', durationSec: 20 },
    { id: 'a', title: 'Two', prompt: 'Do two', durationSec: 20 },
    { id: 'bad', title: 'Bad', prompt: 'Do bad', durationSec: Infinity },
    { id: 'ok', title: 'Ok', prompt: 'Do ok', durationSec: 10 },
  ]);
  assert.deepEqual(result.map((task) => task.id), ['a', 'ok']);
});

test('parseCsv supports quoted commas and newlines and rejects unclosed quotes', () => {
  const rows = parseCsv('id,title,prompt,durationSec,category\na,"Title, one","Line one\nline two",30,attention');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Title, one');
  assert.equal(rows[0].prompt, 'Line one\nline two');
  assert.throws(() => parseCsv('title,prompt\n"broken,thing'));
});

test('mergeCustomTasks removes duplicates from stored and incoming tasks', () => {
  const result = mergeCustomTasks(
    [{ id: 'existing', title: 'One', prompt: 'Do it', durationSec: 20, category: 'custom' }],
    [
      { id: 'incoming-1', title: 'One', prompt: 'Do it', durationSec: 20, category: 'custom' },
      { id: 'incoming-2', title: 'Two', prompt: 'Do two', durationSec: 20, category: 'custom' },
      { id: 'incoming-3', title: 'Two', prompt: 'Do two', durationSec: 20, category: 'custom' },
    ],
    [{ id: 'base', title: 'Base', prompt: 'Do base', durationSec: 20, category: 'movement' }],
  );
  assert.deepEqual(result.added.map((task) => task.title), ['Two']);
  assert.equal(result.tasks.length, 2);
});

test('sanitizeState discards malformed persisted values', () => {
  const state = sanitizeState({
    customTasks: [null, { id: 'x', title: 'X', prompt: 'P', durationSec: 20 }],
    completed: -3,
    todayCompleted: '2',
    skipped: Infinity,
    day: 'bad',
    session: { task: null },
  }, new Date(2026, 9, 8));
  assert.deepEqual(state.customTasks.map((task) => task.id), ['x']);
  assert.equal(state.completed, 0);
  assert.equal(state.todayCompleted, 0);
  assert.equal(state.skipped, 0);
  assert.equal(state.day, '2026-10-08');
  assert.equal(state.session, null);
});

test('sanitizeState caps persisted custom tasks at the local limit', () => {
  const tasks = Array.from({ length: 205 }, (_, index) => ({
    id: `custom-${index}`,
    title: `task ${index}`,
    prompt: 'do one small thing',
    durationSec: 10,
  }));
  assert.equal(sanitizeState({ customTasks: tasks }).customTasks.length, 200);
});

test('normalizeTask clamps valid integer durations to the supported range', () => {
  assert.equal(normalizeTask({ title: 'x', prompt: 'y', durationSec: 1 }).durationSec, 10);
  assert.equal(normalizeTask({ title: 'x', prompt: 'y', durationSec: 120 }).durationSec, 120);
});

test('chooseTask avoids the current and recent tasks when possible', () => {
  const tasks = [
    { id: 'a' }, { id: 'b' }, { id: 'c' },
  ];
  const picked = chooseTask(tasks, 'a', ['b'], () => 0);
  assert.equal(picked.id, 'c');
});

test('remainingFromSession uses a deadline and freezes while paused', () => {
  assert.equal(remainingFromSession({ durationSec: 60, startedAt: 1000, pausedAt: null, pausedForMs: 0 }, 31_000), 30);
  assert.equal(remainingFromSession({ durationSec: 60, startedAt: 1000, pausedAt: 20_000, pausedForMs: 0 }, 31_000), 41);
  assert.equal(remainingFromSession({ durationSec: 60, startedAt: 1000, pausedAt: null, pausedForMs: 0 }, 70_000), 0);
});

test('filters a break by intent and a maximum duration, including legacy categories', () => {
  const tasks = [
    { id: 'a', category: 'attention', durationSec: 30 },
    { id: 'b', category: 'наблюдение', durationSec: 60 },
    { id: 'c', category: 'движение', durationSec: 30 },
    { id: 'd', category: 'game', durationSec: 90 },
    { id: 'e', category: 'своё', durationSec: 10 },
  ];
  assert.deepEqual(filterTasks(tasks, { mode: 'switch', maxDuration: 60 }).map(t => t.id), ['a', 'b']);
  assert.deepEqual(filterTasks(tasks, { mode: 'move', maxDuration: 30 }).map(t => t.id), ['c']);
  assert.deepEqual(filterTasks(tasks, { mode: 'all', maxDuration: 30 }).map(t => t.id), ['a', 'c', 'e']);
});

test('favorites honor the time limit and an empty selection stays empty', () => {
  const tasks = [{ id: 'a', category: 'game', durationSec: 30 }, { id: 'b', category: 'order', durationSec: 90 }];
  assert.deepEqual(filterTasks(tasks, { mode: 'favorites', maxDuration: 60 }, ['a', 'b']).map(t => t.id), ['a']);
  assert.deepEqual(filterTasks(tasks, { mode: 'favorites', maxDuration: 120 }, []), []);
  assert.deepEqual(filterTasks(tasks, { mode: 'move', maxDuration: 120 }), []);
});

test('old stored data gets safe defaults while new preferences and favorites survive reload', () => {
  const old = sanitizeState({ completed: 3 });
  assert.deepEqual(old.preferences, { mode: 'all', maxDuration: 120 });
  assert.deepEqual(old.favoriteIds, []);
  assert.equal(old.completed, 3);
  const next = sanitizeState({ preferences: { mode: 'favorites', maxDuration: 30 }, favoriteIds: ['a', 'a', null, 'b'] });
  assert.deepEqual(next.preferences, { mode: 'favorites', maxDuration: 30 });
  assert.deepEqual(next.favoriteIds, ['a', 'b']);
  const invalid = sanitizeState({ preferences: { mode: '__proto__', maxDuration: -1 }, favoriteIds: 'a' });
  assert.deepEqual(invalid.preferences, { mode: 'all', maxDuration: 120 });
  assert.deepEqual(invalid.favoriteIds, []);
});

test('a full round shows all 40 tasks before repeating, also after state restoration', () => {
  const tasks = Array.from({ length: 40 }, (_, i) => ({ id: `base-${i}` }));
  let state = sanitizeState({});
  let currentId = null;
  for (let round = 0; round < 3; round += 1) {
    const shown = [];
    for (let i = 0; i < tasks.length; i += 1) {
      const result = drawTask(tasks, currentId, state.drawnIds, () => 0);
      assert.notEqual(result.task.id, currentId);
      shown.push(result.task.id);
      currentId = result.task.id;
      state = sanitizeState(JSON.parse(JSON.stringify({ ...state, drawnIds: result.drawnIds })));
    }
    assert.equal(new Set(shown).size, tasks.length);
  }
});

test('round selection handles empty, single and changed pools without stale ids', () => {
  assert.deepEqual(drawTask([], 'a', ['a']), { task: null, drawnIds: [] });
  assert.deepEqual(drawTask([{ id: 'a' }], 'a', ['a']), { task: { id: 'a' }, drawnIds: ['a'] });
  const tasks = [{ id: 'a' }, { id: 'b' }, { id: 'new' }];
  const result = drawTask(tasks, 'b', ['removed', 'a', 'b'], () => 0);
  assert.equal(result.task.id, 'new');
  assert.deepEqual(result.drawnIds, ['a', 'b', 'new']);
  // A running task from the previous filter counts as seen in the new round.
  assert.equal(drawTask(tasks, 'a', [], () => 0).task.id, 'b');
  assert.equal(drawTask(tasks, null, ['b', 'new', 'a'], () => 0).task.id, 'b', 'completion cannot cause a neighboring repeat across rounds');
});

test('hidden tasks never enter a pool, including favorites and legacy categories', () => {
  const tasks = [
    { id: 'a', category: 'movement', durationSec: 30 },
    { id: 'b', category: 'движение', durationSec: 30 },
  ];
  assert.deepEqual(filterTasks(tasks, { mode: 'move' }, [], ['a']).map(t => t.id), ['b']);
  assert.deepEqual(filterTasks(tasks, { mode: 'favorites' }, ['a', 'b'], ['a']).map(t => t.id), ['b']);
  assert.deepEqual(filterTasks(tasks, {}, [], ['a', 'b']), []);
});

test('round history and hidden ids survive migration, reject malformed data and stay bounded', () => {
  const old = sanitizeState({ completed: 7, customTasks: [{ id: 'custom', title: 'x', prompt: 'y', durationSec: 30 }] });
  assert.deepEqual(old.drawnIds, []);
  assert.deepEqual(old.hiddenTaskIds, []);
  assert.equal(old.completed, 7);
  assert.equal(old.customTasks[0].id, 'custom');
  const next = sanitizeState({ drawnIds: ['a', null, 'a', '', 42, 'b'], hiddenTaskIds: ['a', 'a', '', false] });
  assert.deepEqual(next.drawnIds, ['a', 'b']);
  assert.deepEqual(next.hiddenTaskIds, ['a']);
  const ids = Array.from({ length: 500 }, (_, i) => `id-${i}`);
  assert.equal(sanitizeState({ drawnIds: ids, hiddenTaskIds: ids }).drawnIds.length, 400);
  assert.equal(sanitizeState({ drawnIds: ids, hiddenTaskIds: ids }).hiddenTaskIds.length, 400);
  assert.deepEqual(sanitizeState({ drawnIds: {}, hiddenTaskIds: 'a' }).hiddenTaskIds, []);
  const longId = 'imported-'.repeat(30);
  assert.deepEqual(sanitizeState({ hiddenTaskIds: [longId] }).hiddenTaskIds, [longId]);
});

test('accepted imported task ids remain usable as favorites after saving', () => {
  const id = 'imported-'.repeat(30);
  const task = normalizeTask({ id, title: 'one thing', prompt: 'do one thing', durationSec: 30 });
  assert.equal(task.id, id);
  const state = sanitizeState({ customTasks: [task], favoriteIds: [id], preferences: { mode: 'favorites', maxDuration: 30 } });
  assert.deepEqual(filterTasks(state.customTasks, state.preferences, state.favoriteIds), [task]);
});

test('new built-in ids cannot alias older custom tasks or their active session', () => {
  const base = [{ id: 'movement-09', title: 'new built-in', prompt: 'move', durationSec: 20 }];
  const custom = { id: 'movement-09', title: 'my old task', prompt: 'look outside', durationSec: 30 };
  const state = sanitizeState({ customTasks: [custom], favoriteIds: [custom.id], recentIds: [custom.id], drawnIds: [custom.id], hiddenTaskIds: [custom.id], session: { task: custom, durationSec: 30, startedAt: 1000 } });
  const migrated = reconcileTaskIds(state, base);
  assert.notEqual(migrated.customTasks[0].id, base[0].id);
  assert.equal(migrated.session.task.id, migrated.customTasks[0].id);
  assert.deepEqual(migrated.favoriteIds, [migrated.customTasks[0].id]);
  assert.deepEqual(migrated.recentIds, [migrated.customTasks[0].id]);
  assert.deepEqual(migrated.drawnIds, [migrated.customTasks[0].id]);
  assert.deepEqual(migrated.hiddenTaskIds, [migrated.customTasks[0].id]);
  assert.equal(migrated.completed, state.completed);
  assert.deepEqual(reconcileTaskIds(migrated, base), migrated, 'migration is stable across reloads');
  const baseSession = sanitizeState({ ...state, session: { task: base[0], durationSec: 20, startedAt: 1000 } });
  assert.equal(reconcileTaskIds(baseSession, base).session.task.id, base[0].id, 'a built-in session is not renamed');
});

test('collision migration preserves the active custom snapshot after its library entry was edited', () => {
  const base = [{ id: 'movement-09', title: 'new built-in', prompt: 'move', durationSec: 20 }];
  const snapshot = { id: 'movement-09', title: 'original title', prompt: 'original instruction', durationSec: 30 };
  const edited = { ...snapshot, title: 'edited title', prompt: 'edited instruction' };
  const state = sanitizeState({ customTasks: [edited], session: { task: snapshot, durationSec: 30, startedAt: 1000 } });
  const migrated = reconcileTaskIds(state, base);
  assert.equal(migrated.session.task.id, migrated.customTasks[0].id);
  assert.equal(migrated.session.task.title, snapshot.title);
  assert.equal(migrated.customTasks[0].title, edited.title);
});
