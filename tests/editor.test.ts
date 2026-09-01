import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import type { EditorView as EditorViewType } from '@codemirror/view';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import type { App, MarkdownFileInfo } from 'obsidian';
import { parseAnkiCards } from '../src/parser';
import type { CardPlacement } from '../src/types';
import { DEFAULT_MARKERS } from '../src/markers';
import type { CardMarkers } from '../src/markers';
import { textEditor } from './support/textEditor';

const require = createRequire(import.meta.url);
type Harness = typeof import('./support/editorHarness');
type ViewModule = typeof import('@codemirror/view');
type StateModule = typeof import('@codemirror/state');

const card = '<START_ANKI>\nObsidian-Basic\n소프트웨어 생명 주기란 무엇인가?\nBack:\n' +
	'소프트웨어 기획부터 폐기까지 전 과정입니다.\n'.repeat(12) +
	'<!--ID: 1775887365861-->\n<END_ANKI>';
const documentText = `앞 문단\n\n\`\`\`php-template\n${card}\n\`\`\`\n\n뒷 문단\n`;

function createElement(document: Document, tag: string, options: DomElementInfo = {}): HTMLElement {
	const element = document.createElement(tag);
	if (options.cls) element.className = Array.isArray(options.cls) ? options.cls.join(' ') : options.cls;
	if (typeof options.text === 'string') element.textContent = options.text;
	else if (options.text) element.appendChild(options.text);
	for (const [name, value] of Object.entries(options.attr ?? {})) {
		if (value !== null) element.setAttribute(name, String(value));
	}
	return element;
}

async function settle(): Promise<void> {
	// Drain focus effects, async Markdown renders and native details toggle events.
	await new Promise((resolve) => setTimeout(resolve, 25));
}

for (const [version, packageName] of [
	['6.38.6', '@codemirror/view'],
	['6.43.9 (tiles)', '@codemirror/view-tiles'],
] as const) {
	describe(`editor DOM regression: CodeMirror ${version}`, () => {
		let dom: JSDOM;
		let harness: Harness;
		let cm: ViewModule;
		let stateModule: StateModule;
		let view: EditorViewType | undefined;
		let placement: CardPlacement;
		let truncateTitles: boolean;
		let markers: CardMarkers;
		let blocked: boolean;
		let errors: unknown[];
		let outside: HTMLButtonElement;
		beforeEach(() => {
			errors = [];
			placement = 'inline';
			truncateTitles = false;
			markers = { ...DEFAULT_MARKERS };
			blocked = false;
			if (harness) harness.MarkdownRenderer.renders.length = 0;
		});

		before(async () => {
			dom = new JSDOM('<!doctype html><body><button>Outside</button></body>', {
				pretendToBeVisual: true,
			});
			const win = dom.window;
			for (const key of ['window', 'document', 'navigator', 'MutationObserver', 'HTMLElement', 'Node', 'Window', 'DOMRect', 'Range']) {
				Object.defineProperty(globalThis, key, { configurable: true, value: Reflect.get(win, key) });
			}
			Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: win.getComputedStyle.bind(win) });
			win.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
			win.Range.prototype.getBoundingClientRect = () => new DOMRect();
			win.HTMLElement.prototype.createEl = function (this: HTMLElement, tag: string, options?: DomElementInfo) {
				const child = createElement(win.document, tag, options);
				this.appendChild(child);
				return child;
			} as HTMLElement['createEl'];
			win.HTMLElement.prototype.createDiv = function (options?: DomElementInfo) { return this.createEl('div', options); };
			win.HTMLElement.prototype.createSpan = function (options?: DomElementInfo) { return this.createEl('span', options); };
			win.HTMLElement.prototype.addClass = function (...classes: string[]) { this.classList.add(...classes); };
			outside = win.document.querySelector('button')!;
			cm = require(packageName) as ViewModule;
			stateModule = createRequire(require.resolve(packageName))('@codemirror/state') as StateModule;
			const result = await build({
				entryPoints: [fileURLToPath(new URL('./support/editorHarness.ts', import.meta.url))],
				bundle: true,
				write: false,
				platform: 'node',
				format: 'cjs',
				external: ['@codemirror/state', '@codemirror/view', 'markdown-it'],
				alias: { obsidian: fileURLToPath(new URL('./support/obsidianMock.ts', import.meta.url)) },
			});
			const bundled = { exports: {} as Harness };
			runInNewContext(result.outputFiles[0]!.text, {
				module: bundled,
				exports: bundled.exports,
				require: (name: string): unknown => name === '@codemirror/view' ? cm :
					name === '@codemirror/state' ? stateModule : require(name),
				createDiv: (options: DomElementInfo) => createElement(win.document, 'div', options),
				queueMicrotask,
				document: win.document,
				console: { error: (...args: unknown[]) => errors.push(args) },
			});
			harness = bundled.exports;
			win.addEventListener('error', (event) => { errors.push(event.error); event.preventDefault(); });
		});

		function open(doc = documentText, anchor = 251, parseCards = parseAnkiCards): EditorViewType {
			errors = [];
			placement = 'inline';
			view = new cm.EditorView({
				parent: dom.window.document.body,
				state: stateModule.EditorState.create({
					doc,
					selection: { anchor },
					extensions: [
						harness.editorInfoField,
						harness.editorLivePreviewField,
						harness.createAnkiCardEditorExtension({} as App, () => placement, () => truncateTitles, () => markers, () => blocked, parseCards),
						cm.EditorView.exceptionSink.of((error) => errors.push(error)),
					],
				}),
			});
			return view;
		}

		afterEach(async () => {
			view?.destroy();
			view = undefined;
			await settle();
			assert.equal(harness.Component.active, 0, 'all Markdown components must unload, including reused widget DOM');
			assert.deepEqual(errors, [], 'no editor, layout, async render or focus errors');
		});
		after(() => dom.window.close());

		test('Source mode never replaces raw text, including after blur or placement changes', async () => {
			const editor = open(documentText, 0);
			await settle();
			assert.equal(editor.dom.querySelectorAll('details').length, 1);
			editor.dispatch({ effects: harness.setLivePreview.of(false) });
			outside.focus(); placement = 'document-end'; editor.dispatch({}); await settle();
			assert.equal(editor.dom.querySelectorAll('details').length, 0);
			assert.ok(editor.contentDOM.textContent?.includes('<START_ANKI>'));
			assert.equal(editor.state.doc.toString(), documentText);
			editor.dispatch({ effects: harness.setLivePreview.of(true) }); await settle();
			assert.equal(editor.dom.querySelectorAll('details').length, 1);
		});

		test('ArrowUp below a stack enters the last closing marker at any column without editing', async () => {
			const source = `intro\n${card}\n\n${card}\nTAIL`;
			const last = parseAnkiCards(source)[1]!;
			const editor = open(source, source.length);
			editor.focus(); await settle();
			const key = new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
			editor.contentDOM.dispatchEvent(key); await settle();
			assert.equal(key.defaultPrevented, true);
			assert.equal(editor.state.selection.main.head, editor.state.doc.line(last.endLine + 1).to);
			assert.equal(editor.state.doc.toString(), source);
			assert.ok(editor.contentDOM.textContent?.includes('<END_ANKI>'));
			assert.equal(editor.dom.querySelectorAll('details').length, 1, 'only the last card becomes source');
		});

		test('ArrowUp in a lower wrapped row below a card keeps ordinary vertical movement', async () => {
			const source = `intro\n${card}\nlong trailing paragraph`;
			const editor = open(source, source.length); editor.focus(); await settle();
			const position = editor.state.selection.main.head;
			const original = editor.coordsAtPos.bind(editor);
			editor.coordsAtPos = (pos) => ({ left: 0, right: 0, top: pos === position ? 40 : 0, bottom: pos === position ? 60 : 20 });
			const key = new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
			editor.contentDOM.dispatchEvent(key);
			editor.coordsAtPos = original;
			assert.equal(key.defaultPrevented, false);
			assert.equal(editor.state.doc.toString(), source);
		});

		test('type menu converts Cloze text and status toggles through live editor transactions, keeping the card open', async () => {
			const source = 'intro\n<START_ANKI>\nCloze\nQuestion\nText:\n{{c1::**answer**}} {{c2:other}}\n<!--ID: 123-->\n<END_ANKI>\ntail';
			const editor = open(source, 0);
			await settle();
			editor.dom.querySelector('details')!.open = true;
			await settle();
			editor.dom.querySelector<HTMLButtonElement>('.anki-card-manager-type-selector')!.click();
			assert.deepEqual(Array.from(harness.Menu.last!.items, (item) => item.title), ['Obsidian-Basic', 'Cloze']);
			harness.Menu.last!.items[0]!.callback();
			await settle();
			let parsed = parseAnkiCards(editor.state.doc.toString())[0]!;
			assert.equal(parsed.cardType, 'Obsidian-Basic');
			assert.equal(parsed.back, '**answer** other');
			assert.equal(parsed.id, '123');
			assert.equal(editor.dom.querySelector('details')!.open, true);
			assert.equal(editor.dom.querySelector('[data-card-icon]')?.getAttribute('data-card-icon'), 'anki');
			editor.dom.querySelector<HTMLButtonElement>('.anki-card-manager-registration-toggle')!.click();
			await settle();
			parsed = parseAnkiCards(editor.state.doc.toString())[0]!;
			assert.equal(parsed.registered, false);
			assert.equal(parsed.id, undefined);
			assert.equal(editor.dom.querySelector('details')!.open, true);
			assert.equal(editor.dom.querySelector('.anki-card-manager-registration-toggle')?.textContent, 'Unregistered');
			assert.ok(editor.state.doc.toString().startsWith('intro\n'));
			assert.ok(editor.state.doc.toString().endsWith('\ntail'));
		});

		test('custom triggers refresh render/deletion protection and block safely during migration', async () => {
			markers = { registeredStart: '[RS]', registeredEnd: '[RE]', unregisteredStart: '[US]', unregisteredEnd: '[UE]' };
			const source = 'intro\n[RS]\nCloze\nQ\nText:\n{{c1::A}}\n[RE]\ntail';
			const editor = open(source, source.indexOf('tail'));
			editor.focus();
			await settle();
			assert.equal(editor.dom.querySelectorAll('details').length, 1);
			editor.contentDOM.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
			assert.equal(editor.state.doc.toString(), source);
			assert.ok(editor.state.selection.main.head < source.indexOf('tail'));
			outside.focus();
			await settle();
			blocked = true; editor.dispatch({});
			assert.equal(editor.dom.querySelectorAll('details').length, 0);
			blocked = false; editor.dispatch({});
			assert.equal(editor.dom.querySelectorAll('details').length, 1);
			markers = { ...DEFAULT_MARKERS }; editor.dispatch({});
			assert.equal(editor.dom.querySelectorAll('details').length, 0);
		});

		test('groups consecutive cards, keeps prose separate and refreshes title truncation', async () => {
			const source = `intro\n${card}\n\n${card}\nprose\n${card}`;
			const editor = open(source, 0);
			await settle();
			assert.equal(editor.dom.querySelectorAll('.anki-card-manager-stack').length, 1);
			assert.equal(editor.dom.querySelectorAll('.anki-card-manager-stack details').length, 2);
			assert.equal(editor.dom.querySelectorAll('.is-title-truncated').length, 0);
			assert.equal(editor.dom.querySelectorAll('summary .anki-card-manager-badge').length, 0);
			assert.equal(editor.dom.querySelectorAll('.anki-card-manager-answer-header .anki-card-manager-badge').length, 0);
			editor.dom.querySelector('details')!.open = true;
			await settle();
			assert.equal(editor.dom.querySelectorAll('.anki-card-manager-answer-header .anki-card-manager-badge').length, 1);
			truncateTitles = true;
			editor.dispatch({});
			await settle();
			assert.equal(editor.dom.querySelectorAll('.is-title-truncated').length, 3);
			assert.equal(editor.state.doc.toString(), source);
		});

		test('large adjacent stacks use bounded widgets and render answers only when opened', async () => {
			const largeCard = (index: number): string =>
				`<ANKI_START>\nObsidian-Basic\nQuestion ${index}\nBack:\nAnswer ${index}\n<ANKI_END>`;
			const source = `intro\n${Array.from({ length: 120 }, (_, index) => largeCard(index)).join('\n\n')}`;
			const editor = open(source, 0);
			await settle();
			let decorationCount = 0;
			for (const value of editor.state.facet(cm.EditorView.decorations)) {
				if (typeof value !== 'function') value.between(0, editor.state.doc.length, () => { decorationCount += 1; });
			}
			assert.equal(decorationCount, 5);
			const stackSizes = Array.from(editor.dom.querySelectorAll('.anki-card-manager-stack'),
				(stack) => stack.querySelectorAll('details').length);
			assert.deepEqual(stackSizes, [24, 24, 24, 24, 24]);
			assert.ok(stackSizes.every((size) => size <= 24));
			assert.equal(editor.dom.querySelectorAll('.anki-card-manager-answer').length, 0);
			assert.equal(harness.MarkdownRenderer.renders.some((markdown) => markdown.startsWith('Answer ')), false);
			const first = editor.dom.querySelector('details')!;
			first.open = true;
			await settle();
			assert.equal(first.querySelectorAll('.anki-card-manager-answer').length, 1);
			assert.equal(harness.MarkdownRenderer.renders.some((markdown) => markdown.startsWith('Answer ')), true);
		});

		test('selection and presentation changes reuse parsed cards until source or markers change', async () => {
			let parseCalls = 0;
			const countingParser: typeof parseAnkiCards = (...args) => {
				parseCalls += 1;
				return parseAnkiCards(...args);
			};
			const editor = open(`intro\n${card}\ntail`, 0, countingParser);
			await settle();
			assert.equal(parseCalls, 1);
			editor.dispatch({ selection: { anchor: 1 } });
			truncateTitles = true;
			placement = 'document-end';
			editor.dispatch({});
			await settle();
			assert.equal(parseCalls, 1);
			editor.dispatch({ changes: { from: 0, insert: 'x' } });
			await settle();
			assert.equal(parseCalls, 2);
			markers = { ...markers, registeredStart: '[START]' };
			editor.dispatch({});
			await settle();
			assert.equal(parseCalls, 3);
		});

		test('Cloze masks are independent, preserve Markdown, toggle all and reset on close', async () => {
			const source = 'intro\n<ANKI_START>\nCloze\n**UML** question\nText:\n{{c1: 언어}} {{c1::**사물**}} {{c2::`<<>>`}}\n<ANKI_END>';
			const editor = open(source, 0);
			await settle();
			const details = editor.dom.querySelector('details')!;
			assert.ok(details.classList.contains('is-unregistered'));
			assert.equal(details.querySelector('svg')?.getAttribute('aria-label'), 'Cloze: unregistered');
			details.open = true;
			await settle();
			const masks = Array.from(details.querySelectorAll<HTMLElement>('.anki-card-manager-cloze-mask'));
			assert.equal(masks.length, 3);
			assert.ok(masks.every((mask) => mask.classList.contains('is-hidden')));
			assert.equal(masks[1]!.querySelector('strong')?.textContent, '사물');
			assert.equal(masks[2]!.querySelector('code')?.textContent, '<<>>');
			masks[0]!.click();
			assert.deepEqual(masks.map((mask) => mask.classList.contains('is-hidden')), [false, true, true]);
			const toggle = details.querySelector<HTMLButtonElement>('.anki-card-manager-cloze-toggle')!;
			toggle.click();
			assert.ok(masks.every((mask) => !mask.classList.contains('is-hidden')));
			toggle.click();
			assert.ok(masks.every((mask) => mask.classList.contains('is-hidden')));
			masks[1]!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			assert.equal(masks[1]!.getAttribute('aria-expanded'), 'true');
			details.open = false;
			await settle();
			details.open = true;
			await settle();
			assert.ok(masks.every((mask) => mask.classList.contains('is-hidden')));
			assert.ok(masks.every((mask) => mask.querySelector('span')?.getAttribute('aria-hidden') === 'true'));
			assert.equal(editor.state.doc.toString(), source);
		});

		test('Backspace after a stack reveals the last source without deletion, then allows text edits', async () => {
			const source = `intro\n${card}\n\n${card}\nTAIL`;
			const last = parseAnkiCards(source)[1]!;
			const editor = open(source, last.renderTo);
			editor.focus();
			await settle();
			const key = new dom.window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
			editor.contentDOM.dispatchEvent(key);
			await settle();
			assert.equal(key.defaultPrevented, true);
			assert.equal(editor.state.doc.toString(), source);
			assert.ok(editor.contentDOM.textContent?.includes('<END_ANKI>'));
			const position = editor.state.selection.main.head;
			editor.dispatch({ changes: { from: position - 1, to: position }, userEvent: 'delete.backward' });
			assert.equal(editor.state.doc.length, source.length - 1);
		});

		test('native forward deletion and backward atomic deletion transactions reveal source', async () => {
			const source = `intro\n${card}\nTAIL`;
			const parsed = parseAnkiCards(source)[0]!;
			const editor = open(source, parsed.renderFrom - 1);
			editor.focus();
			await settle();
			const input = new dom.window.InputEvent('beforeinput', { inputType: 'deleteContentForward', bubbles: true, cancelable: true });
			editor.contentDOM.dispatchEvent(input);
			assert.equal(input.defaultPrevented, true);
			assert.equal(editor.state.doc.toString(), source);
			editor.dispatch({ selection: { anchor: parsed.renderTo } });
			editor.dispatch({ changes: { from: parsed.renderFrom, to: parsed.renderTo }, userEvent: 'delete.backward' });
			assert.equal(editor.state.doc.toString(), source);
			assert.ok(editor.state.selection.main.head < parsed.renderTo);
		});

		test('Backspace below physically placed collection reveals its actual source', async () => {
			const source = `intro\n${card}\nTAIL`;
			const editor = open(source, 0);
			placement = 'document-end';
			editor.dispatch({ selection: { anchor: source.indexOf('TAIL') } });
			editor.focus();
			await settle();
			editor.contentDOM.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
			assert.equal(editor.state.doc.toString(), source);
			assert.ok(editor.state.selection.main.head < source.indexOf('TAIL'));
		});

		test('ordinary trailing text deletion and explicit selections are not intercepted', async () => {
			const source = `intro\n${card}\nTAIL`;
			const parsed = parseAnkiCards(source)[0]!;
			const editor = open(source, parsed.renderTo + 1);
			editor.focus();
			await settle();
			editor.dispatch({ changes: { from: parsed.renderTo, to: parsed.renderTo + 1 }, userEvent: 'delete.backward' });
			assert.equal(editor.state.doc.toString(), source.replace('TAIL', 'AIL'));
			editor.dispatch({ selection: { anchor: parsed.renderFrom, head: parsed.renderTo } });
			editor.dispatch({ changes: { from: parsed.renderFrom, to: parsed.renderTo }, userEvent: 'delete.backward' });
			assert.equal(parseAnkiCards(editor.state.doc.toString()).length, 0);
		});

		test('autocomplete skips complete cards on typing or Enter and inserts before a nested start', async () => {
			const settings = { autoCompleteCards: true, cardPlacement: 'inline' as const, truncateTitles: false,
				defaultCardType: 'Cloze', defaultDeck: 'Inbox', defaultTag: 'Inbox', markers: { ...DEFAULT_MARKERS } };
			const completer = new harness.AnkiCardAutoCompleter({} as App, () => settings);
			const info = { file: null } as MarkdownFileInfo;
			for (const cursor of [{ line: 0, ch: 12 }, { line: 1, ch: 0 }]) {
				const existing = '<START_ANKI>\n\nCloze\nQ\nText:\nA\n<END_ANKI>';
				const sample = textEditor(existing, cursor);
				await completer.onEditorChange(sample.editor, info);
				assert.equal(sample.text(), existing);
			}
			const nested = textEditor('<START_ANKI>\n\n<START_ANKI>asd<END_ANKI>', { line: 1, ch: 0 });
			await completer.onEditorChange(nested.editor, info);
			assert.match(nested.text(), /^<START_ANKI>\nCloze\n\nText:\n\n<END_ANKI>/);
			assert.ok(nested.text().endsWith('<START_ANKI>asd<END_ANKI>'));
			settings.autoCompleteCards = false;
			const disabled = textEditor('<START_ANKI>', { line: 0, ch: 12 });
			await completer.onEditorChange(disabled.editor, info);
			assert.equal(disabled.text(), '<START_ANKI>');
		});

		test('autocomplete and insert command honor custom triggers and pause during migration', async () => {
			const custom = { registeredStart: '[ON.*]', registeredEnd: '[/ON.*]', unregisteredStart: '[OFF$]', unregisteredEnd: '[/OFF$]' };
			const settings = { autoCompleteCards: true, cardPlacement: 'inline' as const, truncateTitles: false,
				defaultCardType: 'Cloze', defaultDeck: 'Inbox', defaultTag: 'Inbox', markers: custom };
			let paused = false;
			const completer = new harness.AnkiCardAutoCompleter({} as App, () => settings, () => paused);
			const info = { file: null } as MarkdownFileInfo;
			const complete = '[ON.*]\nCloze\nQ\nText:\nA\n[/ON.*]';
			const existing = textEditor(complete, { line: 0, ch: custom.registeredStart.length });
			await completer.onEditorChange(existing.editor, info);
			assert.equal(existing.text(), complete);
			const nested = textEditor('[ON.*]\n\n[ON.*]Other[/ON.*]', { line: 1, ch: 0 });
			await completer.onEditorChange(nested.editor, info);
			assert.ok(nested.text().startsWith('[ON.*]\nCloze\n\nText:\n\n[/ON.*]'));
			assert.ok(nested.text().endsWith('[ON.*]Other[/ON.*]'));
			const inserted = textEditor('', { line: 0, ch: 0 });
			await completer.insertAtCursor(inserted.editor, info);
			assert.equal(inserted.text(), '[ON.*]\nCloze\n\nText:\n\n[/ON.*]');
			paused = true;
			const blocked = textEditor('[ON.*]', { line: 0, ch: custom.registeredStart.length });
			await completer.onEditorChange(blocked.editor, info);
			await completer.insertAtCursor(blocked.editor, info);
			assert.equal(blocked.text(), '[ON.*]');
		});

		test('manager updates and registration toggles preserve Cloze Text and tokens', async () => {
			let source = '<START_ANKI>\nCloze\nQuestion\nText:\n{{c1::answer}}\n<!--ID: 123-->\n<END_ANKI>';
			const file = new harness.TFile();
			const app = { vault: { getAbstractFileByPath: () => file,
				process: (_file: unknown, transform: (value: string) => string) => { source = transform(source); } },
				workspace: { getLeavesOfType: () => [] } } as unknown as App;
			let parsed = parseAnkiCards(source, 'test.md')[0]!;
			await harness.updateCard(app, parsed, { ...parsed, front: 'Edited question' });
			assert.match(source, /Edited question\nText:\n\{\{c1::answer\}\}/);
			parsed = parseAnkiCards(source, 'test.md')[0]!;
			await harness.toggleCardRegistration(app, parsed);
			assert.match(source, /^<ANKI_START>/);
			assert.doesNotMatch(source, /<!--ID:/);
			assert.equal(parseAnkiCards(source)[0]?.back, '{{c1::answer}}');
		});

		test('initial inactive editor renders fenced card even with cursor at position 251', async () => {
			const editor = open();
			await settle();
			assert.equal(editor.dom.querySelectorAll('details').length, 1);
			assert.equal(editor.state.doc.toString(), documentText);
			assert.equal(editor.state.selection.main.head, 251);
			assert.ok(editor.state.facet(cm.EditorView.decorations).every((value) => typeof value !== 'function'));
			assert.ok(editor.domAtPos(251).node);
		});

		test('focus, blur, cursor movement and edit-source round-trip preserve source', async () => {
			const editor = open();
			editor.focus();
			await settle();
			assert.equal(editor.dom.querySelectorAll('details').length, 0);
			outside.focus();
			await settle();
			assert.equal(editor.dom.querySelectorAll('details').length, 1);
			editor.dom.querySelector<HTMLButtonElement>('.anki-card-manager-edit-source')!.click();
			await settle();
			assert.equal(editor.hasFocus, true);
			assert.equal(editor.dom.querySelectorAll('details').length, 0);
			assert.equal(editor.state.selection.main.head, parseAnkiCards(documentText)[0]!.from);
			editor.dispatch({ selection: { anchor: 0 } });
			await settle();
			assert.equal(editor.dom.querySelectorAll('details').length, 1);
			assert.equal(editor.state.doc.toString(), documentText);
		});

		test('dropdown remains interactive and requests height measurement', async () => {
			const editor = open();
			await settle();
			let measurements = 0;
			const original = editor.requestMeasure.bind(editor);
			editor.requestMeasure = (...args) => { measurements += 1; original(...args); };
			const details = editor.dom.querySelector('details')!;
			details.querySelector('summary')!.focus();
			details.open = true;
			await settle();
			assert.equal(editor.dom.querySelector('details'), details);
			assert.equal(details.open, true);
			assert.ok(measurements > 0);
		});

		test('document-end collection and source buttons follow shifted offsets', async () => {
			const editor = open(`prefix\n${card}\n\n${card}`, 0);
			await settle();
			placement = 'document-end';
			editor.dispatch({});
			await settle();
			assert.equal(editor.dom.querySelectorAll('.anki-card-manager-stack details').length, 2);
			editor.dispatch({ changes: { from: 0, insert: 'new text\n' } });
			await settle();
			const expected = parseAnkiCards(editor.state.doc.toString())[1]!.from;
			editor.dom.querySelectorAll<HTMLButtonElement>('.anki-card-manager-edit-source')[1]!.click();
			await settle();
			assert.equal(editor.state.selection.main.head, expected);
			assert.ok(editor.contentDOM.textContent?.includes('<START_ANKI>'));
			placement = 'inline';
			editor.dispatch({});
			await settle();
			assert.equal(editor.dom.querySelector('.is-document-end'), null);
		});

		test('repeated edits, selections, reconfiguration and deletes never corrupt positions', async () => {
			const editor = open();
			for (let index = 0; index < 30; index += 1) {
				editor.focus();
				await Promise.resolve();
				editor.dispatch({ selection: { anchor: 251 } });
				editor.dispatch({ changes: { from: 251, insert: 'x' } });
				editor.dispatch({ changes: { from: 251, to: 252 } });
				editor.dispatch({ selection: stateModule.EditorSelection.single(0, editor.state.doc.length) });
				editor.dispatch({ selection: { anchor: 0 } });
				outside.focus();
				await Promise.resolve();
				assert.ok(editor.domAtPos(251).node);
			}
			await settle();
			assert.equal(editor.state.doc.toString(), documentText);
			assert.equal(harness.Component.active, 1);
			editor.dispatch({ changes: { from: 0, to: editor.state.doc.length } });
			await settle();
			assert.equal(editor.dom.querySelectorAll('details').length, 0);
			editor.dispatch({ effects: stateModule.StateEffect.reconfigure.of([]) });
			await settle();
		});

		test('adjacent cards at EOF and disabling while focus is queued are safe', async () => {
			const editor = open(`${card}\n${card}`, 0);
			await settle();
			assert.equal(editor.dom.querySelectorAll('details').length, 2);
			editor.focus();
			editor.dispatch({ effects: stateModule.StateEffect.reconfigure.of([]) });
			await settle();
			assert.equal(editor.dom.querySelectorAll('details').length, 0);
			assert.equal(harness.Component.active, 0);
		});
	});
}
