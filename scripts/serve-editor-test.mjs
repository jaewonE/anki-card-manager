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
const manager = await build({
	entryPoints: [root + 'tests/browser/manager.ts'], bundle: true, write: false, format: 'iife',
	alias: { obsidian: root + 'tests/support/obsidianMock.ts' },
});
const reading = await build({
	entryPoints: [root + 'tests/browser/reading.ts'], bundle: true, write: false, format: 'iife',
	alias: { obsidian: root + 'tests/support/obsidianMock.ts' },
});
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>Anki editor regression</title>
<style>
:root { --color-yellow:#d19b17; --background-primary:#fff; --background-secondary:#f5f5f5; --background-modifier-border:#ddd;
 --text-normal:#222; --text-muted:#666; --text-accent:#7c55bd; --interactive-accent:#7c55bd; --background-modifier-hover:#e8e8e8; --font-ui-small:13px; --font-ui-smaller:12px;
 --font-semibold:600; --font-medium:500; --size-4-1:4px; --size-4-2:8px; --size-4-3:12px; --size-4-4:16px; --size-4-5:20px; --size-4-8:32px; --radius-m:8px; }
body {font-family:system-ui;max-width:900px;margin:32px auto;padding:0 24px;color:#222;background:#fafafa;}
body.theme-dark {color:#ddd;background:#202226;--text-normal:#ddd;--text-muted:#b5b7bf;--background-primary:#24262b;--background-secondary:#292c31;--background-modifier-border:#494d56;--background-modifier-hover:#383c42;}
nav {display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px} button,select{padding:6px 10px}
.menu{position:fixed;z-index:100;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:6px;padding:4px;box-shadow:0 2px 8px #0003}.menu button{display:block;width:100%;text-align:left;color:var(--text-normal);background:transparent;border:0}.menu button:hover{background:var(--background-modifier-hover)}
output {display:block;margin:12px 0;color:#555;font-size:13px}
#editor {border:1px solid var(--background-modifier-border);background:var(--background-primary);} .cm-content {padding:20px;font-size:16px;line-height:1.7;font-family:system-ui;}
${stylesheet}
/* Exercise host-theme pressed/hover specificity after plugin styles. */
.markdown-rendered button[aria-pressed="true"], .markdown-rendered button[aria-pressed="true"]:hover {color:var(--text-normal);background:var(--background-primary)}
</style><body><h1>Anki editor regression</h1><p>Real CodeMirror 6.43.9; Obsidian host APIs are stubbed. No Vault files are accessed.</p>
<nav><button id="outside">Blur editor</button><label>Placement <select id="placement"><option value="inline">Inline</option><option value="document-end">Document end</option></select></label>
<button id="stress">Run 50 edit cycles</button><button id="disable">Disable extension</button><button id="enable">Enable extension</button>
<label><input id="truncate" type="checkbox">Single-line titles</label><label><input id="raw" type="checkbox">Source mode</label><label><input id="dark" type="checkbox">Dark mode</label><button id="below">Cursor below stack</button></nav>
<output id="status"></output><output id="stress-result">Ready</output><div id="editor" class="markdown-rendered"></div><script src="/editor.js"></script></body></html>`;

createServer((request, response) => {
	response.setHeader('Content-Type', request.url?.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8');
	const managerHtml = html.slice(0, html.indexOf('<body>')) + `<body><style>
	body{max-width:1400px}*{box-sizing:border-box}button,input,select,textarea{font:inherit;color:var(--text-normal);background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:5px;padding:7px}button:disabled{opacity:.4}button{cursor:pointer}input[type=checkbox]{width:16px;height:16px}svg{width:18px;height:18px}button svg{display:block}:root{--text-on-accent:#fff;--color-green:#398851;--text-error:#d84c4c;--text-faint:#888}.modal{position:fixed;z-index:100;left:50%;top:50%;transform:translate(-50%,-50%);max-height:90vh;overflow:auto;background:var(--background-primary);padding:24px;box-shadow:0 0 0 200vmax #0008;border:1px solid var(--background-modifier-border);border-radius:10px}.modal-button-container{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}pre{white-space:pre-wrap}
	/* Host theme interaction rules must not recolor or underline table links. */
	#manager{max-width:100%;max-height:900px;overflow:auto}
	.anki-card-manager-table button:hover,.anki-card-manager-table button:focus{color:var(--text-accent);text-decoration:underline}
	</style><p>Manager UI regression · Real manager code, sample documents and stubbed Obsidian APIs.</p><label><input id="dark" type="checkbox">Dark mode</label>
	<label>Pane width <select id="pane-width"><option value="100%">Auto</option><option value="320px">320</option><option value="390px">390</option><option value="640px">640</option><option value="1024px">1024</option></select></label>
	<output id="manager-status"></output><div id="manager"></div><details><summary>Inspect sample source files</summary><div id="sample-sources"></div></details><script src="/manager.js"></script></body></html>`;
	const readingHtml = managerHtml.slice(0, managerHtml.indexOf('<p>Manager UI regression')) + `<h1>Reading view regression</h1><p>Sample-only reading sections and confirmed collection. No real Vault access.</p><label><input id="dark" type="checkbox">Dark mode</label><button id="collect">Collect sample cards</button><output id="reading-status"></output><div id="reading" class="markdown-preview-view markdown-rendered"></div><details><summary>Inspect sample source</summary><pre id="reading-source"></pre></details><script src="/reading.js"></script></body></html>`;
	const responsiveHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Manager responsive regression</title>
	<style>body{font-family:system-ui;margin:16px}iframe{display:block;width:390px;height:1800px;border:1px solid #aaa;margin-top:12px}</style>
	<h1>Manager responsive regression</h1><label>Preview width <select id="width"><option>320</option><option selected>390</option><option>640</option><option>1024</option></select></label>
	<iframe title="Manager preview" src="/manager"></iframe><script>document.querySelector('#width').addEventListener('change',event=>{document.querySelector('iframe').style.width=event.target.value+'px'});</script></html>`;
	response.end(request.url === '/editor.js' ? result.outputFiles[0].text : request.url === '/manager.js' ? manager.outputFiles[0].text : request.url === '/reading.js' ? reading.outputFiles[0].text : request.url === '/manager' ? managerHtml : request.url === '/manager-responsive' ? responsiveHtml : request.url === '/reading' ? readingHtml : html);
}).listen(0, '127.0.0.1', function () {
	console.log(`Editor QA: http://127.0.0.1:${this.address().port}`);
	console.log(`Manager QA: http://127.0.0.1:${this.address().port}/manager`);
	console.log(`Responsive QA: http://127.0.0.1:${this.address().port}/manager-responsive`);
});
