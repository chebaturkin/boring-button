const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('all shipped task libraries match tasks.json', () => {
  const source = JSON.parse(read('tasks.json'));
  assert.deepEqual(JSON.parse(read('extension/tasks.json')), source);
  for (const file of ['tasks.js', 'extension/tasks.js']) {
    const context = { window: {} };
    vm.runInNewContext(read(file), context);
    assert.deepEqual(JSON.parse(JSON.stringify(context.window.BoringButtonTasks)), source);
  }
});

test('website and popup ship the same behavior and styles', () => {
  for (const [source, copy] of [['app.js', 'extension/popup.js'], ['core.js', 'extension/core.js'], ['styles.css', 'extension/styles.css'], ['assets/button.svg', 'extension/assets/button.svg']]) {
    assert.equal(read(copy), read(source), `${copy} is out of sync; run node scripts/sync-ui.js`);
  }
});

test('every intent has a short break and the shipped library is valid', () => {
  const tasks = JSON.parse(read('tasks.json'));
  const core = require('../core.js');
  assert.equal(core.normalizeTasks(tasks).length, tasks.length);
  for (const mode of ['move', 'switch', 'tidy', 'play']) {
    assert.ok(core.filterTasks(tasks, { mode, maxDuration: 30 }).length > 0, `missing short breaks for ${mode}`);
  }
});

test('extension needs no permissions and every declared icon exists', () => {
  const manifest = JSON.parse(read('extension/manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  for (const field of ['permissions', 'host_permissions', 'content_scripts']) assert.equal(manifest[field], undefined);
  assert.equal(manifest.action.default_popup, 'popup.html');
  for (const icon of Object.values(manifest.icons)) {
    const bytes = fs.readFileSync(path.join(root, 'extension', icon));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  }
});
