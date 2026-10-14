// Real interface screenshots, without compositing or replacing UI content.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.BORING_BUTTON_URL || 'http://127.0.0.1:8017';
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
    // Reproducible selection from the actual built-in library.
    await page.addInitScript(() => { Math.random = () => 0; });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(base);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    const capture = name => page.screenshot({ path: path.join(root, 'docs/screenshots', name), fullPage: true, animations: 'disabled' });
    fs.mkdirSync(path.join(root, 'docs/screenshots'), { recursive: true });
    await capture('desktop.png');
    await page.locator('[data-mode="move"]').click();
    await page.locator('[data-duration="30"]').click();
    await page.locator('#start-button').click();
    await page.locator('#timer-toggle').click();
    await capture('active-task.png');
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('mobile.png');
    await page.setViewportSize({ width: 360, height: 600 });
    await page.goto(`${base}/extension/popup.html`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('networkidle');
    await capture('popup.png');
    console.log('Captured desktop, active task, mobile and popup screenshots.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
