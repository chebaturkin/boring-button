const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.BORING_BUTTON_URL || 'http://127.0.0.1:8031';
const key = 'boring-button-state-v2';
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [pathname, width, height] of [['',390,844],['',768,1024],['',1440,1000],['/extension/popup.html',360,600]]) {
      const page = await browser.newPage({ locale: 'ru-RU', viewport: { width, height }, reducedMotion: 'reduce' });
      await page.goto(base + pathname);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.getByText('меньше скролла.', { exact: false }).count(), 0, 'the slogan must not occupy the workspace');
      const start = await page.locator('#start-button').boundingBox();
      assert.ok(start.y >= 0 && start.y + start.height <= height, 'the whole start button is visible without scrolling');
      assert.equal(await page.locator('.timer-unit').isVisible(), false, 'no idle timer competes with the start button');
      await page.locator('#start-button').click();
      assert.equal(await page.locator('#active-task').isVisible(), true);
      assert.equal(await page.locator('#empty-task').isVisible(), false);
      assert.equal(await page.locator('#next-picker').evaluate(el => el.open), false);
      const first = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).session, key);
      await page.locator('#next-picker > summary').click();
      await page.locator('#mode-select').selectOption('move');
      await page.locator('[data-duration="30"]').click();
      const changed = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).session, key);
      assert.equal(changed.startedAt, first.startedAt);
      assert.equal(changed.task.id, first.task.id);
      await page.locator('#timer-toggle').click();
      await page.reload();
      assert.equal(await page.locator('#timer-toggle').textContent(), 'продолжить');
      assert.equal(await page.locator('#next-picker').evaluate(el => el.open), false);
      await page.locator('#done-button').click();
      assert.equal(await page.locator('#completion-task').isVisible(), true);
      assert.equal(await page.locator('#active-task').isVisible(), false);
      assert.equal(await page.locator('.timer-unit').isVisible(), false);
      await page.locator('#return-button').click();
      assert.equal(await page.locator('#mode-select').inputValue(), 'move');
      assert.equal(await page.locator('#start-button').isVisible(), true);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.close();
    }
    // Another tab saving the same session must not close a user's open choice or steal focus.
    const context = await browser.newContext({ locale: 'ru-RU', reducedMotion: 'reduce' });
    const firstPage = await context.newPage();
    const otherPage = await context.newPage();
    await firstPage.goto(base);
    await firstPage.locator('#start-button').click();
    await otherPage.goto(base);
    await firstPage.locator('#next-picker > summary').click();
    await firstPage.locator('[data-duration="30"]').focus();
    await otherPage.locator('#favorite-button').click();
    await firstPage.waitForFunction(() => document.getElementById('favorite-button').getAttribute('aria-pressed') === 'true');
    assert.equal(await firstPage.locator('#next-picker').evaluate(el => el.open), true, 'cross-tab saves preserve the open next choice');
    assert.equal(await firstPage.locator('[data-duration="30"]').evaluate(el => el === document.activeElement), true, 'cross-tab saves preserve filter focus');
    await context.close();
    console.log('workspace checks passed: visible start, scene changes, next-choice semantics, paused restoration, completion and responsive layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
