// Real screenshots of both language variants of the shipped interface.
const { chromium } = require('playwright');
const { selectMode, selectDuration } = require('./browser-controls.cjs');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.BORING_BUTTON_URL || 'http://127.0.0.1:8017';
const root = path.resolve(__dirname, '..');
(async () => {
 const browser = await chromium.launch({ headless: true });
 try {
  for (const lang of ['ru', 'en']) {
   const context = await browser.newContext({locale:lang === 'ru' ? 'ru-RU' : 'en-US',viewport:{width:1440,height:1050},deviceScaleFactor:1,reducedMotion:'reduce'});
   const page = await context.newPage();
   await page.addInitScript(() => { Math.random = () => 0; });
   const folder = path.join(root, 'docs/screenshots', lang === 'en' ? 'en' : '');
   fs.mkdirSync(folder,{recursive:true});
   const capture = name => page.screenshot({path:path.join(folder,name),fullPage:true,animations:'disabled'});
   await page.goto(base + '/?lang=' + lang);await page.waitForLoadState('networkidle');await page.evaluate(() => document.fonts.ready);
   await capture('desktop.png');await capture('motion-button.png');
   await selectMode(page,'move');await selectDuration(page,30);await page.locator('#start-button').click();await page.locator('#timer-toggle').click();
   await capture('active-task.png');
   await page.setViewportSize({width:390,height:844});await capture('mobile.png');
   await page.setViewportSize({width:1440,height:1050});await page.locator('#done-button').click();await capture('motion-complete.png');
   await page.setViewportSize({width:360,height:600});
   await page.goto(base + '/extension/popup.html?lang=' + lang);await page.evaluate(() => localStorage.clear());await page.reload();await page.waitForLoadState('networkidle');await page.evaluate(() => document.fonts.ready);
   await capture('popup.png');await capture('motion-popup.png');await context.close();
  }
  console.log('Captured ru/en desktop, active task, mobile and popup screenshots.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
