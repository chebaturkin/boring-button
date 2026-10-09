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
