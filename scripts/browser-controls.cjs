// Real UI controls shared by the browser regression checks.
async function openChoice(page) {
  if (await page.locator('#completion-task').isVisible()) await page.locator('#return-button').click();
  if (!await page.locator('#next-picker').evaluate(el => el.open)) await page.locator('#next-picker > summary').click();
}
async function selectMode(page, mode) {
  await openChoice(page);
  await page.locator('#mode-select').selectOption(mode);
}
async function selectDuration(page, seconds) {
  await openChoice(page);
  await page.locator(`[data-duration="${seconds}"]`).click();
}
module.exports = { selectMode, selectDuration };
