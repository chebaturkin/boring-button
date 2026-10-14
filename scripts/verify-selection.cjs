// Optional browser regression checks. Playwright is a development tool only.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.BORING_BUTTON_URL || 'http://127.0.0.1:8017';
const storageKey = 'boring-button-state-v2';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { Math.random = () => 0; });
    const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
    const open = async (path = '') => { await page.goto(`${base}${path}`); await page.waitForLoadState('networkidle'); };
    await open();
    await page.locator('#start-button').click();
    const before = await stored();
    for (const event of [
      { key: 'd', ctrlKey: true }, { key: 'd', metaKey: true },
      { key: 'n', altKey: true }, { key: 'n', repeat: true },
      { key: 'd', isComposing: true }, { key: 's', repeat: true },
    ]) {
      await page.locator('#task-title').dispatchEvent('keydown', { ...event, bubbles: true });
      const after = await stored();
      assert.equal(after.completed, before.completed, 'browser shortcuts do not complete a task');
      assert.equal(after.skipped, before.skipped, 'holding a key does not skip a task');
      assert.equal(after.session.task.id, before.session.task.id, 'modifiers, composition and repeats preserve the current task');
    }
    await page.evaluate(() => {
      const editable = document.createElement('div');
      editable.id = 'test-editable';
      editable.contentEditable = 'plaintext-only';
      document.body.append(editable);
    });
    await page.locator('#test-editable').dispatchEvent('keydown', { key: 'd', bubbles: true });
    assert.equal((await stored()).completed, before.completed);
    await page.evaluate(() => document.getElementById('test-editable').remove());
    await page.locator('#task-title').press('d');
    assert.equal((await stored()).completed, before.completed + 1);
    console.log('safe shortcuts passed');

    // Keep the full round across reloads. Deterministic randomness exposes
    // premature reuse that a probabilistic test could miss.
    await page.evaluate(key => localStorage.removeItem(key), storageKey);
    await page.reload();
    const total = await page.evaluate(() => window.BoringButtonTasks.length);
    await page.locator('#start-button').click();
    const draw = count => page.evaluate(({ count, storageKey }) => {
      const shown = [];
      for (let i = 0; i < count; i += 1) {
        document.getElementById('another-button').click();
        shown.push(JSON.parse(localStorage.getItem(storageKey)).session.task.id);
      }
      return shown;
    }, { count, storageKey });
    const shown = [(await stored()).session.task.id, ...await draw(10)];
    await page.reload();
    shown.push(...await draw(total - shown.length));
    assert.equal(new Set(shown).size, total);
    await page.locator('#another-button').click();
    assert.notEqual((await stored()).session.task.id, shown.at(-1));
    const session = (await stored()).session;
    await page.locator('[data-mode="move"]').click();
    assert.equal((await stored()).session.startedAt, session.startedAt, 'changing a filter preserves the active timer');
    const currentFits = await page.evaluate(id => window.BoringButtonCore.filterTasks(window.BoringButtonTasks, { mode: 'move' }).some(task => task.id === id), session.task.id);
    assert.deepEqual((await stored()).drawnIds, currentFits ? [session.task.id] : []);

    // Hiding is local, reversible, and independent of completion or skipping.
    await page.locator('[data-mode="all"]').click();
    assert.deepEqual((await stored()).drawnIds, [session.task.id]);
    await page.locator('#done-button').click();
    await page.locator('#completion-another').click();
    assert.notEqual((await stored()).session.task.id, session.task.id, 'changing filters then completing preserves the seen task');
    console.log('rounds and filter transitions passed');
    await page.locator('#favorite-button').click();
    const hiddenId = (await stored()).session.task.id;
    const counts = await stored();
    await page.locator('#hide-task-button').click();
    assert.deepEqual((await stored()).hiddenTaskIds, [hiddenId]);
    assert.equal((await stored()).session, null);
    assert.equal((await stored()).completed, counts.completed);
    assert.equal((await stored()).skipped, counts.skipped);
    assert.equal(await page.locator('#task-feedback').isVisible(), true);
    await page.locator('[data-mode="favorites"]').click();
    assert.equal(await page.locator('#start-button').isDisabled(), true);
    assert.equal(await page.locator('#pool-recovery').isVisible(), true);
    await page.reload();
    assert.equal(await page.locator('#start-button').isDisabled(), true);
    await page.locator('#pool-recovery').click();
    assert.equal(await page.locator('#hidden-library').getAttribute('open'), '');
    await page.locator('#hidden-task-list button').click();
    assert.deepEqual((await stored()).hiddenTaskIds, []);
    assert.equal(await page.locator('#start-button').isDisabled(), false);
    assert.equal((await stored()).favoriteIds.includes(hiddenId), true, 'restoration preserves favorites');
    await page.locator('#settings > summary').click();
    await page.locator('#start-button').click();
    assert.equal((await stored()).session.task.id, hiddenId);

    // Storage events propagate hiding and restoration to another open tab.
    const other = await context.newPage();
    await other.goto(base);
    await other.waitForLoadState('networkidle');
    await page.locator('#hide-task-button').click();
    await other.waitForFunction(() => document.getElementById('active-task').hidden);
    assert.equal(await other.locator('#start-button').isDisabled(), true);
    await other.locator('#pool-recovery').click();
    await other.locator('#hidden-task-list button').click();
    await page.waitForFunction(() => !document.getElementById('start-button').disabled);
    await other.close();
    console.log('hiding, restoration and cross-tab state passed');

    // Mobile and popup: new controls, empty pool and hidden library fit.
    await page.locator('[data-mode="all"]').click();
    for (const path of ['', '/extension/popup.html']) {
      await open(path);
      for (const width of [320, 360, 740, 1440]) {
        if (path && width > 360) continue;
        await page.setViewportSize({ width, height: 800 });
        await page.locator('#start-button').click();
        assert.equal(await page.locator('#hide-task-button').isVisible(), true);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path || 'site'} active task fits at ${width}px`);
        await page.locator('#hide-task-button').click();
        await page.locator('.settings-link').click();
        if (!await page.locator('#hidden-library').evaluate(el => el.open)) await page.locator('#hidden-library summary').click();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path || 'site'} hidden library fits at ${width}px`);
        await page.locator('#hidden-task-list button').first().click();
        await page.locator('#settings > summary').click();
        console.log(`${path || 'site'} ${width}px passed`);
      }
    }
    // A manual favorite start must become the last shown id even when it
    // was already seen, so completion cannot immediately repeat it.
    await open();
    const favoriteId = await page.evaluate(key => {
      const tasks = window.BoringButtonTasks;
      const state = window.BoringButtonCore.sanitizeState({ drawnIds: tasks.map(t => t.id), favoriteIds: [tasks[0].id] });
      localStorage.setItem(key, JSON.stringify(state));
      return tasks[0].id;
    }, storageKey);
    await page.reload();
    await page.locator('#favorites-library summary').click();
    await page.locator('#favorite-list .action-button').click();
    assert.equal((await stored()).drawnIds.at(-1), favoriteId);
    await page.locator('#done-button').click();
    await page.locator('#completion-another').click();
    assert.notEqual((await stored()).session.task.id, favoriteId);
    assert.deepEqual(errors, []);
    console.log('selection checks passed: complete rounds, reload, filters, hide/restore, favorites, storage events, safe shortcuts, mobile and popup.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
