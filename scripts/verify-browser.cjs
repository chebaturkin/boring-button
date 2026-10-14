// Optional development check. Requires Playwright; the app itself has no dependencies.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { selectMode, selectDuration } = require('./browser-controls.cjs');
const base = process.env.BORING_BUTTON_URL || 'http://127.0.0.1:8017';
const storageKey = 'boring-button-state-v2';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ locale: 'ru-RU', viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (!request.url().startsWith(base)) external.push(request.url()); });
    const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
    const visible = selector => page.locator(selector).isVisible();
    await page.goto(base);
    await page.waitForLoadState('networkidle');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.match(await page.title(), /boring button/);

    // Empty favorites give a visible next step and never bypass the selection.
    await selectMode(page, 'favorites');
    assert.equal(await page.locator('#start-button').isDisabled(), true);
    assert.match(await page.locator('#pool-note').textContent(), /сохрани/);
    await selectMode(page, 'move');
    await selectDuration(page, 30);
    await page.locator('#start-button').click();
    assert.equal((await stored()).session.task.category, 'движение');
    assert.ok((await stored()).session.task.durationSec <= 30);
    const firstId = (await stored()).session.task.id;
    await page.locator('#favorite-button').click();
    assert.deepEqual((await stored()).favoriteIds, [firstId]);
    await page.locator('#timer-toggle').click();
    const paused = await page.locator('#timer').textContent();
    await page.reload();
    assert.equal(await page.locator('#timer').textContent(), paused);
    assert.equal((await stored()).session.status, 'paused');
    assert.equal(await page.locator('#favorite-button').getAttribute('aria-pressed'), 'true');
    await page.locator('#timer-toggle').click();
    assert.equal((await stored()).session.status, 'running');
    await selectDuration(page, 60);
    assert.equal((await stored()).session.task.id, firstId, 'changing preferences preserves the current break');
    await page.locator('#timer-reset').click();
    assert.equal((await stored()).session.durationSec, (await stored()).session.task.durationSec);
    await page.locator('#done-button').click();
    assert.equal(await visible('#completion-task'), true);
    assert.equal((await stored()).completed, 1);
    assert.equal((await stored()).session, null);
    await page.locator('#return-button').click();
    await selectMode(page, 'favorites');
    await page.locator('#start-button').click();
    assert.equal((await stored()).session.task.id, firstId);
    await page.locator('#skip-button').click();
    assert.equal((await stored()).skipped, 1);
    await selectMode(page, 'all');
    await page.locator('#start-button').click();
    const before = (await stored()).session.task.id;
    await page.locator('#another-button').click();
    assert.notEqual((await stored()).session.task.id, before);
    await page.locator('#task-title').press('d');
    assert.equal((await stored()).completed, 2);
    await page.locator('#completion-another').click();
    assert.equal(await visible('#active-task'), true);

    // Deadline restoration expires correctly without completing a task for the user.
    await page.evaluate(key => {
      const state = JSON.parse(localStorage.getItem(key));
      state.session.startedAt = Date.now() - 200000;
      state.session.pausedAt = null;
      state.session.pausedForMs = 0;
      state.session.status = 'running';
      localStorage.setItem(key, JSON.stringify(state));
    }, storageKey);
    await page.reload();
    assert.equal(await page.locator('#timer').textContent(), '0:00');
    assert.equal((await stored()).session.status, 'expired');
    assert.equal((await stored()).completed, 2);
    await page.locator('#skip-button').click();

    // Custom data is rendered as text, editable, exportable and deduplicated on import.
    await page.locator('.settings-link').click();
    await page.locator('[name="title"]').fill('своя пауза <img src=x>');
    await page.locator('[name="prompt"]').fill('посмотри в окно и найди облако');
    await page.locator('[name="duration"]').selectOption('30');
    await page.locator('#custom-submit').click();
    assert.equal((await stored()).customTasks.length, 1);
    assert.equal(await page.locator('#custom-task-list img').count(), 0);
    await page.locator('.custom-task-edit').click();
    await page.locator('[name="title"]').fill('проверить облако');
    await page.locator('#custom-submit').click();
    assert.equal((await stored()).customTasks[0].title, 'проверить облако');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-button').click();
    assert.equal((await downloadPromise).suggestedFilename(), 'boring-button-tasks.json');
    const importTask = { id: 'import-cloud', title: 'найти тень', prompt: 'найди тень на стене', durationSec: 30, category: 'наблюдение' };
    const upload = { name: 'tasks.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([importTask])) };
    await page.locator('#import-file').setInputFiles(upload);
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).customTasks.length === 2, storageKey);
    await page.locator('#import-file').setInputFiles(upload);
    await page.waitForFunction(() => document.getElementById('settings-message').textContent.includes('не найдено'));
    assert.equal((await stored()).customTasks.length, 2);
    await page.locator('#import-file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
    await page.waitForFunction(() => document.getElementById('settings-message').textContent.includes('не удалось'));
    assert.equal(await visible('#settings-message'), true);
    await page.locator('#import-file').setInputFiles({ name: 'tasks.csv', mimeType: 'text/csv', buffer: Buffer.from('id,category,title,prompt,durationSec\ncsv-one,мини-игра,"два, слова","назови два слова",20') });
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).customTasks.length === 3, storageKey);
    await page.locator('[name="title"]').fill('n');
    await page.locator('[name="title"]').press('n');
    assert.equal((await stored()).session, null, 'typing never starts a shortcut');
    await page.locator('#settings > summary').click();

    // All break modes respect their category and time budget.
    const categories = { move: ['движение'], switch: ['внимание', 'наблюдение'], tidy: ['порядок'], play: ['мини-игра'] };
    for (const [mode, allowed] of Object.entries(categories)) {
      await selectMode(page, mode);
      await selectDuration(page, 30);
      await page.locator('#start-button').click();
      const task = (await stored()).session.task;
      assert.ok(allowed.includes(task.category));
      assert.ok(task.durationSec <= 30);
      await page.locator('#skip-button').click();
    }
    for (const width of [320, 360, 390, 620, 740, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow at ${width}px`);
      await page.locator('#start-button').click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no active-task overflow at ${width}px`);
      await page.locator('#skip-button').click();
    }
    await page.setViewportSize({ width: 360, height: 600 });
    await page.goto(`${base}/extension/popup.html`);
    await page.waitForLoadState('networkidle');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await page.locator('#start-button').evaluate(el => el.getBoundingClientRect().bottom < 600), 'popup action is visible without scrolling');
    await page.locator('#start-button').click();
    await page.locator('#timer-toggle').click();
    await page.reload();
    assert.equal((await stored()).session.status, 'paused');
    assert.equal(await page.locator('#active-task').isVisible(), true);

    // A library update never aliases an older imported task with a built-in id.
    await page.evaluate(key => {
      const custom = { id: 'movement-09', title: 'old imported pause', prompt: 'look outside', durationSec: 30, category: 'своё' };
      localStorage.setItem(key, JSON.stringify({ customTasks: [custom], completed: 7, favoriteIds: [custom.id], recentIds: [custom.id], session: { task: custom, durationSec: 30, startedAt: Date.now(), pausedAt: Date.now(), pausedForMs: 0, status: 'paused' } }));
    }, storageKey);
    await page.goto(base);
    assert.notEqual((await stored()).customTasks[0].id, 'movement-09');
    assert.equal((await stored()).session.task.id, (await stored()).customTasks[0].id);
    assert.equal((await stored()).completed, 7);
    assert.equal(await page.locator('#task-title').textContent(), 'old imported pause');
    await page.reload();
    assert.equal((await stored()).session.task.id, (await stored()).customTasks[0].id);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, [], 'the interface never requests external resources');
    console.log('browser checks passed: filters, favorites, timer, restore, completion, shortcuts, custom tasks, import/export, 7 widths and popup. no console errors or external requests.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
