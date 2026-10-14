// Optional browser regression check; uses the same Playwright as verify-browser.cjs.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.BORING_BUTTON_URL || 'http://127.0.0.1:8017';
const storageKey = 'boring-button-state-v2';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BORING_BUTTON_BROWSER_CHANNEL });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);
    const start = page.locator('#start-button');
    const face = start.locator('.button-face');
    const idleFace = await face.evaluate(el => getComputedStyle(el).transform);
    const before = await start.boundingBox();
    await start.hover();
    await page.waitForTimeout(260);
    const hovered = await start.boundingBox();
    assert.notEqual(await face.evaluate(el => getComputedStyle(el).transform), idleFace, 'the surface responds to hover');
    for (const dimension of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(before[dimension] - hovered[dimension]) < 1, `button hit area stays fixed on hover: ${dimension}`);
    }
    await page.mouse.down();
    await page.waitForTimeout(140);
    const pressed = await start.boundingBox();
    for (const dimension of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(before[dimension] - pressed[dimension]) < 1, `button hit area stays fixed on press: ${dimension}`);
    }
    await page.mouse.up();
    assert.equal(await page.locator('#active-task').isVisible(), true);
    assert.equal(await page.locator('#task-title').evaluate(el => el === document.activeElement), true);

    await page.locator('#favorite-button').click();
    await page.locator('#favorites-library summary').click();
    const removeFavorite = page.locator('.favorite-item .favorite-button');
    await removeFavorite.focus();
    // An unrelated state write must preserve the actual focused node and list scroll.
    await page.locator('#timer-toggle').evaluate(el => el.click());
    assert.equal(await removeFavorite.evaluate(el => el === document.activeElement), true, 'timer state preserves library focus');
    await page.locator('#favorites-library summary').click();
    const timerResetBefore = await page.locator('#timer-reset').boundingBox();
    await page.locator('#timer-toggle').click();
    const timerResetAfter = await page.locator('#timer-reset').boundingBox();
    assert.ok(Math.abs(timerResetBefore.x - timerResetAfter.x) < 1, 'pause label does not move its neighbor');
    await page.locator('#another-button').click();
    await page.waitForTimeout(350);
    assert.equal(await page.locator('#task-copy').evaluate(el => el.getAnimations().length), 0, 'card animation is released after delivery');
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('#task-copy').evaluate(el => el.getAnimations().length), 0, 'timer ticks never replay delivery');

    const rapid = await page.evaluate(key => {
      for (let i = 0; i < 16; i++) document.getElementById('another-button').click();
      document.querySelector('[data-mode="move"]').click();
      document.querySelector('[data-duration="30"]').click();
      document.getElementById('another-button').click();
      return {
        session: JSON.parse(localStorage.getItem(key)).session,
        animationCount: document.getElementById('task-copy').getAnimations().length,
      };
    }, storageKey);
    assert.equal(rapid.session.task.category, 'движение');
    assert.ok(rapid.session.task.durationSec <= 30);
    assert.equal(rapid.animationCount, 1, 'rapid delivery replaces the previous animation');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await face.evaluate(el => getComputedStyle(el).transitionDuration), '0s', 'reduced motion disables CSS transitions');
    await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));
    await page.locator('#done-button').click();
    assert.equal(await page.locator('#completion-task').isVisible(), true);
    assert.equal(await page.locator('#completion-title').evaluate(el => el === document.activeElement), true);
    assert.equal(await page.evaluate(() => document.getAnimations().some(animation => animation.playState === 'running')), false);
    await page.locator('#return-button').click();
    await start.hover();
    const reducedFace = await face.evaluate(el => getComputedStyle(el).transform);
    await page.mouse.down();
    assert.equal(await face.evaluate(el => getComputedStyle(el).transform), reducedFace, 'reduced motion keeps the held surface still');
    await page.mouse.up();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('#done-button').click();
    await page.locator('#return-button').click();
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#completion-task').isHidden(), true);
    assert.equal(await page.locator('#start-button').evaluate(el => el === document.activeElement), true);

    // Holding a shortcut is one action, and typing preserves the field selection.
    await page.keyboard.press('Enter');
    const firstId = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).session.task.id, storageKey);
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', repeat: true, bubbles: true })));
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).session.task.id, storageKey), firstId);
    await page.locator('.settings-link').click();
    await page.locator('[name="title"]').fill('занятие с длинным названием');
    await page.locator('[name="title"]').evaluate(el => { el.focus(); el.setSelectionRange(3, 9); });
    await page.locator('#timer-toggle').evaluate(el => el.click());
    assert.deepEqual(await page.locator('[name="title"]').evaluate(el => [el === document.activeElement, el.selectionStart, el.selectionEnd]), [true, 3, 9]);
    await page.locator('[name="prompt"]').fill('посмотри вокруг');
    await page.locator('#custom-submit').click();
    const edit = page.locator('.custom-task-edit');
    await edit.focus();
    await page.locator('[data-duration="60"]').evaluate(el => el.click());
    assert.equal(await edit.evaluate(el => el === document.activeElement), true, 'filter changes preserve custom-list focus');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.settings-link').evaluate(el => el === document.activeElement), true);

    // Touch has no decorative hover, and all controls still work.
    const touch = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
    const mobile = await touch.newPage();
    await mobile.goto(base);
    await mobile.locator('#start-button').tap();
    await mobile.locator('#timer-toggle').tap();
    assert.equal(await mobile.locator('#timer-toggle').getAttribute('aria-pressed'), 'true');
    await mobile.locator('#done-button').tap();
    assert.equal(await mobile.locator('#completion-task').isVisible(), true);
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await touch.close();

    // A full imported library must preserve focus, scroll and the complete export.
    const bulk = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    bulk.on('pageerror', error => errors.push(error.message));
    await bulk.goto(base);
    await bulk.locator('.settings-link').click();
    const tasks = Array.from({ length: 200 }, (_, i) => ({
      id: `motion-bulk-${i}`, category: 'своё', durationSec: 120,
      title: `${i} ` + 'длинноеназвание'.repeat(6).slice(0, 75),
      prompt: `${i} ` + 'посмотри вокруг и сделай маленькую паузу. '.repeat(6).slice(0, 235).trim(),
    }));
    await bulk.locator('#import-file').focus();
    await bulk.locator('#import-file').setInputFiles({ name: 'bulk.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tasks)) });
    await bulk.waitForFunction(() => document.querySelectorAll('.custom-task-item').length === 200);
    assert.equal(await bulk.locator('#import-file').evaluate(el => el === document.activeElement && !el.disabled), true, 'import restores the file control focus');
    assert.equal(await bulk.locator('#settings-message').getAttribute('aria-busy'), null);
    await bulk.locator('.custom-task-edit').last().focus();
    const listScroll = await bulk.locator('#custom-task-list').evaluate(el => el.scrollTop);
    await bulk.locator('[data-duration="30"]').evaluate(el => el.click());
    assert.equal(await bulk.locator('#custom-task-list').evaluate(el => el.scrollTop), listScroll);
    assert.equal(await bulk.locator('.custom-task-edit').last().evaluate(el => el === document.activeElement), true);
    const downloadPromise = bulk.waitForEvent('download');
    await bulk.locator('#export-button').click();
    const download = await downloadPromise;
    const exported = JSON.parse(require('node:fs').readFileSync(await download.path(), 'utf8'));
    assert.deepEqual(exported.tasks, tasks, 'export contains every complete task and no motion state');
    await bulk.locator('.custom-task-edit').last().click();
    await bulk.locator('[name="title"]').fill('изменённое длинное занятие');
    await bulk.locator('#custom-submit').click();
    assert.equal(await bulk.locator('.custom-task-item strong').last().textContent(), 'изменённое длинное занятие');
    await bulk.locator('#settings summary').first().click();
    await bulk.evaluate(key => {
      const state = JSON.parse(localStorage.getItem(key));
      state.favoriteIds = [state.customTasks[0].id];
      localStorage.setItem(key, JSON.stringify(state));
    }, storageKey);
    await bulk.reload();
    await bulk.locator('[data-mode="favorites"]').click();
    await bulk.locator('[data-duration="120"]').click();
    await bulk.locator('#start-button').click();
    await bulk.locator('#timer-toggle').click();
    const restoredTitle = await bulk.locator('#task-title').textContent();
    await bulk.reload();
    assert.equal(await bulk.locator('#task-title').textContent(), restoredTitle);
    assert.equal(await bulk.locator('#task-copy').evaluate(el => el.getAnimations().length), 0, 'restoration has no delivery animation');
    for (const width of [320, 360, 740, 1440]) {
      await bulk.setViewportSize({ width, height: 900 });
      assert.ok(await bulk.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `large library and long copy fit ${width}px`);
    }
    await bulk.context().setOffline(true);
    await bulk.locator('#another-button').click();
    await bulk.locator('#done-button').click();
    assert.equal(await bulk.locator('#completion-task').isVisible(), true);
    await bulk.close();

    // Programmatic animations are progressive enhancement, including file://.
    const offline = await browser.newPage({ viewport: { width: 360, height: 800 } });
    await offline.addInitScript(() => { Element.prototype.animate = undefined; });
    await offline.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname, '../index.html')).href);
    await offline.locator('#start-button').click();
    await offline.locator('#done-button').click();
    assert.equal(await offline.locator('#completion-task').isVisible(), true);
    await offline.close();
    assert.deepEqual(errors, []);
    console.log('motion checks passed: fixed hit areas, focus/selection/scroll, interruption, live reduced motion, keyboard, touch, 200 tasks, import/export, restoration, offline and file://.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
