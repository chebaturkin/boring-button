// The website is the source of the shared interface. The popup only changes
// its entry point, body class and script filename; behavior stays identical.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const [source, destination] of [['i18n.js', 'i18n.js'], ['core.js', 'core.js'], ['app.js', 'popup.js'], ['styles.css', 'styles.css'], ['assets/button.svg', 'assets/button.svg']]) {
  fs.copyFileSync(path.join(root, source), path.join(root, 'extension', destination));
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace('<body>', '<body class="popup">')
  .replace('href="."', 'href="#main"')
  .replace('src="app.js"', 'src="popup.js"');
fs.writeFileSync(path.join(root, 'extension', 'popup.html'), html);
console.log('Synced website interface to extension popup.');
