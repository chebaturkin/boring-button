const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const base = process.env.BORING_BUTTON_URL || 'http://127.0.0.1:4431';
const url = path => new URL(path, base + '/').href;
const text = page => page.locator('body').innerText();
(async () => {
 const browser = await chromium.launch();
 try {
  for (const language of ['en-US', 'ru-RU']) {
   const context = await browser.newContext({ locale: language, viewport: { width: 390, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true, timezoneId: 'Europe/Moscow' });
   const page = await context.newPage(); const errors = [];
   page.on('pageerror', error => errors.push(error.message));
   await page.goto(url('?keep=yes#draft'));
   await page.waitForFunction(() => document.documentElement.lang === navigator.language.slice(0, 2));
   const initial = language.slice(0, 2), target = initial === 'en' ? 'ru' : 'en';
   await page.evaluate(() => document.fonts.ready);
   await page.setViewportSize({width:1440,height:1000});await page.setViewportSize({width:320,height:900});
   await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
   assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'idle duration controls must fit after resizing 1440 to 320');
   assert.ok(await page.locator('.duration-options').evaluate(row => [...row.querySelectorAll('button')].every(button => button.getBoundingClientRect().right <= row.getBoundingClientRect().right)), 'every duration label stays within its segmented control');
   await page.setViewportSize({width:390,height:900});
   
   await page.locator('#start-button').click(); await page.locator('#timer-toggle').click();
   const timer = await page.locator('#timer').textContent();
   const englishTitle = await page.locator('#task-title').textContent();
   await page.locator('header [data-locale="en"]').click();const enTitle = await page.locator('#task-title').textContent();
   await page.locator('header [data-locale="ru"]').click();assert.notEqual(await page.locator('#task-title').textContent(), enTitle);
   await page.locator('header [data-locale="en"]').click();assert.equal(await page.locator('#task-title').textContent(), enTitle);
   await page.locator('header [data-locale="' + initial + '"]').click();
   await page.locator('#favorite-button').click();
   await page.locator('#settings').evaluate(n => n.open = true);
   await page.locator('[name="title"]').fill('my pending title / мой текст');
   await page.locator('[name="prompt"]').fill('my pending instructions');

   const before = await page.evaluate(() => ({ hash: location.hash, data: Object.fromEntries(Object.entries(localStorage).filter(([key]) => !key.endsWith(':locale'))) }));
   await page.locator('header [data-locale="' + target + '"]').focus();
   await page.keyboard.press('Enter');
   assert.equal(await page.locator('html').getAttribute('lang'), target);
   assert.equal(await page.locator('header [data-locale="' + target + '"]').getAttribute('aria-pressed'), 'true');
   const after = await page.evaluate(() => ({ hash: location.hash, data: Object.fromEntries(Object.entries(localStorage).filter(([key]) => !key.endsWith(':locale'))) }));
   assert.equal(after.hash, before.hash); assert.ok(page.url().includes('keep=yes')); assert.deepEqual(after.data, before.data);
   
   assert.equal(await page.locator('[name="title"]').inputValue(), 'my pending title / мой текст');
   assert.equal(await page.locator('[name="prompt"]').inputValue(), 'my pending instructions');
   assert.equal(await page.locator('#timer').textContent(), timer);
   assert.equal(await page.locator('#favorite-button').getAttribute('aria-pressed'), 'true');

   await page.locator('header [data-locale="en"]').click();
   
   assert.doesNotMatch(await page.locator('#task-title').innerText(), /[А-Яа-яЁё]/);
   assert.equal(await page.locator('#timer-toggle').textContent(), 'continue');
   await page.locator('#custom-submit').click();
   await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{')});
   await page.waitForFunction(() => document.querySelector('#settings-message').textContent.includes('could not parse json'));
   await page.locator('#import-file').setInputFiles({name:'tasks.csv',mimeType:'text/csv',buffer:Buffer.from('id,category,title,prompt,durationSec\nenglish-import,custom,Keep My Case,leave my text intact,30')});
   await page.waitForFunction(() => document.querySelector('#settings-message').textContent.includes('tasks added: 1'));
   const downloading = page.waitForEvent('download'); await page.locator('#export-button').click();
   const download = await downloading; const saved = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
   assert.equal(saved.tasks.find(t => t.id === 'english-import').title, 'Keep My Case');
   assert.ok(saved.tasks.some(t => t.title === 'my pending title / мой текст'));

   for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [320, 390, 768, 1440]) {
     await page.setViewportSize({ width, height: 1000 });
     assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}/${scheme}`);
    }
   }
   await page.reload();
   assert.equal(await page.locator('html').getAttribute('lang'), 'en');
   await page.goto(url('?lang=ru&keep=yes'));
   assert.equal(await page.locator('html').getAttribute('lang'), 'ru', 'query overrides saved English');
   assert.deepEqual(errors, []);
   await context.close();
  }
  const blocked = await browser.newContext({ locale: 'en-US', viewport: { width: 390, height: 900 } });
  await blocked.addInitScript(() => {
   Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked storage'); } });
   history.replaceState = () => { throw new Error('blocked history'); };
  });
  const restricted = await blocked.newPage(); await restricted.goto(url(''));
  await restricted.locator('header [data-locale="ru"]').click();
  assert.equal(await restricted.locator('html').getAttribute('lang'), 'ru');
  await restricted.locator('header [data-locale="en"]').click();
  assert.equal(await restricted.locator('html').getAttribute('lang'), 'en');
  
  await restricted.locator('#start-button').click();
  assert.ok(await restricted.locator('#active-task').isVisible());

  await blocked.close();
  
  const popup = await browser.newPage({locale:'en-US',viewport:{width:360,height:700}});
  await popup.goto(url('extension/popup.html?lang=en')); await popup.locator('#start-button').click(); await popup.locator('#timer-toggle').click();
  const frozen = await popup.locator('#timer').textContent(); await popup.locator('[data-locale="ru"]').click(); assert.equal(await popup.locator('#timer').textContent(), frozen);
  await popup.close();
  const offline = await browser.newPage({locale:'en-US'});
  await offline.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../index.html')).href + '?lang=en');
  await offline.locator('#start-button').click(); assert.doesNotMatch(await offline.locator('#task-title').innerText(), /[А-Яа-яЁё]/);
  await offline.locator('[data-locale="ru"]').click(); assert.equal(await offline.locator('html').getAttribute('lang'),'ru');await offline.close();

  const blank = await browser.newPage({locale:'en-US'});await blank.goto(url('?lang=en'));await blank.locator('#settings').evaluate(n=>n.open=true);await blank.locator('#custom-submit').click();assert.equal(await blank.locator('#settings-message').textContent(),'check the fields: this task already exists or the data is invalid.');await blank.close();
  console.log('boring-button bilingual browser checks passed: browser defaults, in-place state, keyboard, imports/errors/exports, persistence, blocked storage/history and 320/390/768/1440 light/dark.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
