const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tasks = JSON.parse(fs.readFileSync(path.join(root, 'tasks.json'), 'utf8'));
const serialized = `// Generated from tasks.json. Keep the extension copy in sync with node scripts/sync-tasks.js.\nwindow.BoringButtonTasks = ${JSON.stringify(tasks, null, 2)};\n`;
for (const file of ['tasks.js', path.join('extension', 'tasks.js')]) {
  fs.writeFileSync(path.join(root, file), serialized);
}
console.log(`Synced ${Array.isArray(tasks) ? tasks.length : tasks.tasks.length} tasks to tasks.js and extension/tasks.js.`);
