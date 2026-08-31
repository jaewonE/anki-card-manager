import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const view = require.resolve('@codemirror/view-tiles');
const state = createRequire(view).resolve('@codemirror/state');
const result = await build({
	entryPoints: [root + 'tests/browser/main.ts'],
	bundle: true,
	write: false,
	format: 'iife',
	alias: {
		obsidian: root + 'tests/support/obsidianMock.ts',
		'@codemirror/view': view,
		'@codemirror/state': state,
	},
});
const stylesheet = await readFile(root + 'styles.css', 'utf8');
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>Anki editor regression</title>
<style>
:root { --color-yellow:#d19b17; --background-primary:#fff; --background-secondary:#f5f5f5; --background-modifier-border:#ddd;
 --text-normal:#222; --text-muted:#666; --text-accent:#7c55bd; --interactive-accent:#7c55bd; --background-modifier-hover:#e8e8e8; --font-ui-small:13px; --font-ui-smaller:12px;
 --font-semibold:600; --font-medium:500; --size-4-1:4px; --size-4-2:8px; --size-4-3:12px; --size-4-4:16px; --size-4-5:20px; --size-4-8:32px; --radius-m:8px; }
body {font-family:system-ui;max-width:900px;margin:32px auto;padding:0 24px;color:#222;background:#fafafa;}
body.theme-dark {color:#ddd;background:#202226;--text-normal:#ddd;--text-muted:#b5b7bf;--background-primary:#24262b;--background-secondary:#292c31;--background-modifier-border:#494d56;--background-modifier-hover:#383c42;}
nav {display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px} button,select{padding:6px 10px}
output {display:block;margin:12px 0;color:#555;font-size:13px}
#editor {border:1px solid var(--background-modifier-border);background:var(--background-primary);} .cm-content {padding:20px;font-size:16px;line-height:1.7;font-family:system-ui;}
${stylesheet}
</style><body><h1>Anki editor regression</h1><p>Real CodeMirror 6.43.9; Obsidian host APIs are stubbed. No Vault files are accessed.</p>
<nav><button id="outside">Blur editor</button><label>Placement <select id="placement"><option value="inline">Inline</option><option value="document-end">Document end</option></select></label>
<button id="stress">Run 50 edit cycles</button><button id="disable">Disable extension</button><button id="enable">Enable extension</button>
<label><input id="truncate" type="checkbox">Single-line titles</label><label><input id="dark" type="checkbox">Dark mode</label><button id="below">Cursor below stack</button></nav>
<output id="status"></output><output id="stress-result">Ready</output><div id="editor"></div><script src="/editor.js"></script></body></html>`;

createServer((request, response) => {
	response.setHeader('Content-Type', request.url === '/editor.js' ? 'text/javascript' : 'text/html; charset=utf-8');
	response.end(request.url === '/editor.js' ? result.outputFiles[0].text : html);
}).listen(0, '127.0.0.1', function () {
	console.log(`Editor QA: http://127.0.0.1:${this.address().port}`);
});
