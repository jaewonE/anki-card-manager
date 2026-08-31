import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import type { App, WorkspaceLeaf } from 'obsidian';
import { parseAnkiCards } from '../src/parser';
import { installDomHelpers } from './support/dom';
import { DEFAULT_MARKERS, replaceTriggers } from '../src/markers';
import type { CardMarkers } from '../src/markers';
import type { TriggerJournal, TriggerJournalStore } from '../src/triggerMigration';
import type AnkiCardManagerPlugin from '../src/main';

type Harness = typeof import('./support/managerHarness');
let harness: Harness;
let dom: JSDOM;
const basic = (name: string) => `<START_ANKI>\nObsidian-Basic\n${name}\nBack:\nAnswer for ${name}\n<!--ID: ${name}-->\n<END_ANKI>\n`;
const yaml = '---\nanki_deck: Mother::Child\nanki_tags: [Inbox, Study/UML]\nother: keep\n---\n';
const note = yaml + 'Intro\n\n' + basic('One') + '\n' + basic('Two') + '\nTail\n';
const fixture = () => new Map([['a.md', note], ['b.md', yaml.replace('Child', 'Other') + basic('Three')]]);

before(async () => {
	dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
	installDomHelpers(dom.window as unknown as Window & typeof globalThis);
	const result = await build({ entryPoints: [fileURLToPath(new URL('./support/managerHarness.ts', import.meta.url))],
		bundle: true, write: false, platform: 'node', format: 'cjs', external: ['@codemirror/state', 'markdown-it', 'js-yaml'],
		alias: { obsidian: fileURLToPath(new URL('./support/obsidianMock.ts', import.meta.url)) } });
	const bundled = { exports: {} as Harness };
	runInNewContext(result.outputFiles[0]!.text, { module: bundled, exports: bundled.exports,
		require: createRequire(import.meta.url), document: dom.window.document, console, setTimeout, clearTimeout });
	harness = bundled.exports;
});
after(() => dom.window.close());

function parse(source = note, path = 'a.md') {
	return parseAnkiCards(source, path, harness.cardMetadataFromSource(source));
}

function appFor(sources = fixture()) {
	const files = new Map([...sources.keys()].map((path) => { const file = new harness.TFile(); file.path = path; return [path, file]; }));
	const writes: string[] = [];
	const app = { vault: {
		getMarkdownFiles: () => [...files.values()], getAbstractFileByPath: (path: string) => files.get(path),
		read: (file: { path: string }) => Promise.resolve(sources.get(file.path)!),
		cachedRead: (file: { path: string }) => Promise.resolve(sources.get(file.path)!),
		process: (file: { path: string }, transform: (source: string) => string) => {
			sources.set(file.path, transform(sources.get(file.path)!)); writes.push(file.path); return Promise.resolve(sources.get(file.path)!);
		}, on: () => ({}),
	}, workspace: { getLeavesOfType: () => [] } } as unknown as App;
	return { app, sources, writes };
}

test('bulk unregister/delete applies only selected blocks once and preserves other text', () => {
	const cards = parse();
	const updated = harness.transformBulkSource(note, [cards[0]!, cards[0]!], { kind: 'unregister' }, cards);
	assert.equal(parse(updated)[0]!.registered, false);
	assert.equal(parse(updated)[0]!.id, undefined);
	assert.equal(parse(updated)[1]!.raw, cards[1]!.raw);
	assert.ok(updated.startsWith(yaml + 'Intro\n\n'));
	assert.ok(updated.endsWith('\nTail\n'));
	const deleted = harness.transformBulkSource(note, cards, { kind: 'delete' }, cards);
	assert.equal(deleted, yaml + 'Intro\n\n\n\nTail\n');
	const registered = harness.transformBulkSource(updated, parse(updated), { kind: 'register' }, parse(updated));
	assert.ok(parse(registered).every((card) => card.registered));
});

test('bulk delete removes only exclusive fences and handles CRLF', () => {
	const source = ('before\n```php-template\n' + basic('One') + '```\nafter\n' + basic('Two')).replace(/\n/g, '\r\n');
	const cards = parse(source);
	const updated = harness.transformBulkSource(source, [cards[0]!], { kind: 'delete' }, cards);
	assert.equal(updated, 'before\r\nafter\r\n' + basic('Two').replace(/\n/g, '\r\n'));
});

test('deck YAML applies to every card in the file, preserving body and unrelated properties', () => {
	const cards = parse();
	const updated = harness.transformBulkSource(note, [cards[0]!], { kind: 'deck', deck: 'New::Child' }, cards);
	const body = (source: string) => source.slice(harness.frontmatterRange(source).contentStart);
	assert.equal(body(updated), body(note));
	assert.ok(parse(updated).every((card) => card.deck === 'New::Child'));
	assert.equal(harness.sourceFrontmatter(updated).other, 'keep');
	assert.equal(harness.affectedCards([cards[0]!], cards, true).length, 2);
});

test('tag add/remove/replace keeps YAML string-list type, order and unique values', () => {
	let source = note;
	for (const [mode, tags, expected] of [
		['add', ['Inbox', 'New tag'], ['Inbox', 'Study/UML', 'New tag']],
		['remove', ['Inbox'], ['Study/UML', 'New tag']],
		['replace', [], []],
	] as const) {
		const cards = parse(source);
		source = harness.transformBulkSource(source, [cards[0]!], { kind: 'tags', mode, tags: [...tags] }, cards);
		assert.equal(JSON.stringify(parse(source)[0]!.tags), JSON.stringify(expected));
		assert.equal(parse(source)[0]!.metadataReady, true);
	}
});

test('metadata edits preserve CRLF/BOM/body and can create missing YAML', () => {
	for (const source of ['\uFEFF' + note.replace(/\n/g, '\r\n'), basic('One')]) {
		const cards = parse(source);
		const updated = harness.transformBulkSource(source, cards, { kind: 'deck', deck: 'Inbox' }, cards);
		assert.equal(updated.slice(harness.frontmatterRange(updated).contentStart), source.slice(harness.frontmatterRange(source).contentStart));
		assert.equal(parse(updated)[0]!.deck, 'Inbox');
	}
});

test('stale cards, ambiguous targets, metadata drift, new affected cards and invalid decks reject writes', () => {
	const cards = parse();
	assert.throws(() => harness.transformBulkSource(note.replace('Answer for One', 'changed'), [cards[0]!], { kind: 'delete' }, cards));
	assert.throws(() => harness.transformBulkSource(note.replace('Mother::Child', 'Elsewhere'), [cards[0]!], { kind: 'deck', deck: 'Inbox' }, cards));
	assert.throws(() => harness.transformBulkSource(note + basic('New'), [cards[0]!], { kind: 'tags', mode: 'replace', tags: [] }, cards));
	assert.throws(() => harness.transformBulkSource(note, cards, { kind: 'deck', deck: 'A::::B' }, cards));
	const identical = basic('Same') + basic('Same');
	assert.throws(() => harness.transformBulkSource(basic('Same'), [parse(identical)[0]!], { kind: 'delete' }, parse(identical)));
});

test('multi-file preflight failure causes zero writes', async () => {
	const { app, sources, writes } = appFor();
	const cards = [...sources].flatMap(([path, source]) => parse(source, path));
	sources.set('b.md', sources.get('b.md')!.replace('Answer for Three', 'changed'));
	await assert.rejects(harness.applyBulkAction(app, cards, { kind: 'delete' }, cards));
	assert.equal(writes.length, 0);
	assert.equal(sources.get('a.md'), note);
});

test('bulk writes each source once and reports partial failure without clobbering concurrent edits', async () => {
	const { app, sources, writes } = appFor();
	const cards = [...sources].flatMap(([path, source]) => parse(source, path));
	const original = app.vault.process.bind(app.vault);
	app.vault.process = async (file, transform) => {
		if (file.path === 'b.md') sources.set('b.md', sources.get('b.md')! + 'Concurrent edit');
		return original(file, transform);
	};
	await assert.rejects(harness.applyBulkAction(app, [...cards, cards[0]!], { kind: 'unregister' }, cards), /1 files updated; stopped at b.md/);
	assert.deepEqual(writes, ['a.md']);
	assert.ok(parse(sources.get('a.md')).every((card) => !card.registered));
	assert.ok(sources.get('b.md')!.endsWith('Concurrent edit'));
});

async function openView() {
	const fixtureApp = appFor();
	const container = dom.window.document.body.createDiv();
	const leaf = new harness.WorkspaceLeaf(fixtureApp.app, container) as unknown as WorkspaceLeaf;
	const view = new harness.AnkiManagerView(leaf);
	await view.onOpen();
	return { ...fixtureApp, container, view, close: async () => { await view.onClose(); container.remove(); } };
}
const inputEvent = () => new dom.window.Event('input', { bubbles: true });
const button = (container: HTMLElement, text: string) => [...container.querySelectorAll('button')].find((element) => element.textContent === text)!;

test('typing and scan refresh preserve the search DOM, focus, caret and IME composition', async () => {
	const { view, container, close } = await openView();
	const input = container.querySelector<HTMLInputElement>('input[type=search]')!;
	input.focus();
	for (const char of 'tags:Inbox') {
		input.value += char; input.dispatchEvent(inputEvent());
		assert.equal(dom.window.document.activeElement, input);
		assert.equal(container.querySelector('input[type=search]'), input);
	}
	input.setSelectionRange(3, 5);
	await view.refresh();
	assert.equal(input.selectionStart, 3);
	assert.equal(input.selectionEnd, 5);
	input.dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles: true }));
	input.value = '구성'; input.dispatchEvent(inputEvent());
	assert.equal(dom.window.document.activeElement, input);
	input.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true }));
	await close();
});

test('deck + tag groups support unique selection, mixed state, duplicates and reset', async () => {
	const { container, close } = await openView();
	assert.equal(container.querySelectorAll('thead th').length, 9);
	button(container, 'Group by deck hierarchy').click();
	button(container, 'Group by tag').click();
	const parent = container.querySelector<HTMLInputElement>('input[aria-label="Select deck group: Mother"]')!;
	const expanded = parent.closest('details')!.open;
	parent.click();
	assert.equal(parent.closest('details')!.open, expanded, 'selecting a group must not collapse it');
	assert.ok(container.textContent?.includes('3 selected'));
	const rows = [...container.querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]')];
	assert.equal(rows.length, 6);
	assert.ok(rows.every((row) => row.checked));
	rows[0]!.click();
	assert.equal(parent.indeterminate, true);
	assert.ok(container.textContent?.includes('2 selected'));
	const reset = container.querySelector<HTMLButtonElement>('[aria-label^="Reset search"]')!;
	reset.click();
	assert.equal(container.querySelectorAll('details').length, 0);
	assert.ok(container.textContent?.includes('0 selected'));
	assert.equal(button(container, 'Group by tag').getAttribute('aria-pressed'), 'false');
	assert.equal(container.querySelector('[aria-label^="Sync manager"]')?.getAttribute('data-icon'), 'arrow-right-left');
	await close();
});

test('bulk tag replace and deletion run through confirmation and clear selection after saving', async () => {
	const { container, writes, sources, close } = await openView();
	container.querySelector<HTMLInputElement>('[aria-label="Select all matching cards"]')!.click();
	button(container, 'Change tags').click();
	let modal = dom.window.document.querySelector<HTMLElement>('.modal')!;
	modal.querySelector('select')!.value = 'replace';
	modal.querySelector('textarea')!.value = 'Updated\nUpdated\nSecond';
	button(modal, 'Apply to all 3 cards in these files').click();
	await new Promise((resolve) => setTimeout(resolve, 20));
	assert.deepEqual(writes, ['a.md', 'b.md']);
	assert.equal(JSON.stringify(parse(sources.get('a.md'))[0]!.tags), '["Updated","Second"]');
	assert.ok(container.textContent?.includes('0 selected'));
	container.querySelector<HTMLInputElement>('tbody input')!.click();
	button(container, 'Delete').click();
	modal = dom.window.document.querySelector<HTMLElement>('.modal')!;
	button(modal, 'Confirm delete').click();
	await new Promise((resolve) => setTimeout(resolve, 20));
	assert.equal(parse(sources.get('a.md')).length, 1);
	assert.equal(parse(sources.get('a.md'))[0]!.front, 'Two');
	assert.equal(parse(sources.get('b.md'), 'b.md').length, 1);
	await close();
});

test('reset clears query and status, and sync preserves them without losing input focus', async () => {
	const { container, view, close } = await openView();
	const search = container.querySelector<HTMLInputElement>('input[type=search]')!;
	const status = container.querySelector('select')!;
	search.value = 'type:Cloze'; search.dispatchEvent(inputEvent());
	status.value = 'unregistered'; status.dispatchEvent(new dom.window.Event('change'));
	search.focus();
	await view.refresh();
	assert.equal(search.value, 'type:Cloze');
	assert.equal(status.value, 'unregistered');
	assert.equal(dom.window.document.activeElement, search);
	container.querySelector<HTMLButtonElement>('[aria-label^="Reset search"]')!.click();
	assert.equal(search.value, ''); assert.equal(status.value, 'all');
	assert.equal(container.querySelectorAll('tbody tr').length, 3);
	await close();
});

test('filtering prunes hidden selection and refresh cannot retarget a changed source range', async () => {
	const { container, view, sources, close } = await openView();
	container.querySelector<HTMLInputElement>('[aria-label="Select all matching cards"]')!.click();
	const search = container.querySelector<HTMLInputElement>('input[type=search]')!;
	search.value = 'front:One'; search.dispatchEvent(inputEvent());
	assert.ok(container.textContent?.includes('1 selected'));
	sources.set('a.md', note.replace('One', 'New'));
	await view.refresh();
	assert.ok(container.textContent?.includes('0 selected'));
	await close();
});

test('bulk deck confirmation explicitly includes unselected same-file cards and cancel writes nothing', async () => {
	const { container, writes, close } = await openView();
	container.querySelector<HTMLInputElement>('tbody input')!.click();
	button(container, 'Change deck').click();
	const modal = dom.window.document.querySelector<HTMLElement>('.modal')!;
	assert.ok(modal.textContent?.includes('all 2 cards in 1 files, including 1 unselected cards'));
	button(modal, 'Cancel').click();
	assert.equal(writes.length, 0);
	await close();
});

test('confirmed bulk deck change writes YAML once then refreshes rows from current source', async () => {
	const { container, writes, sources, close } = await openView();
	container.querySelector<HTMLInputElement>('tbody input')!.click();
	button(container, 'Change deck').click();
	const modal = dom.window.document.querySelector<HTMLElement>('.modal')!;
	modal.querySelector<HTMLInputElement>('input')!.value = 'New::Child';
	button(modal, 'Apply to all 2 cards in these files').click();
	await new Promise((resolve) => setTimeout(resolve, 20));
	assert.deepEqual(writes, ['a.md']);
	assert.equal(parse(sources.get('a.md'))[0]!.deck, 'New::Child');
	assert.equal(container.querySelector('[data-label=Deck]')?.textContent, 'New::Child');
	assert.equal(dom.window.document.querySelector('.modal'), null);
	await close();
});

const custom = { registeredStart: '[RS.$]', registeredEnd: '[RE.$]', unregisteredStart: '[US.$]', unregisteredEnd: '[UE.$]' };
function migrationStore() {
	let pending: TriggerJournal | null = null;
	const backups: TriggerJournal[] = [];
	const store: TriggerJournalStore = {
		read: () => Promise.resolve(pending),
		write: (journal) => { pending = JSON.parse(JSON.stringify(journal)) as TriggerJournal; return Promise.resolve(); },
		archive: () => { if (pending) backups.push(pending); pending = null; return Promise.resolve('trigger-backups/test.json'); },
	};
	return { store, backups };
}

test('trigger migration journals before writes, replaces all literals and saves settings only after every file', async () => {
	const { app, sources, writes } = appFor(new Map([['a.md', note + 'Example <START_ANKI>'], ['b.md', basic('Three')], ['keep.md', 'untouched']]));
	const { store, backups } = migrationStore();
	const original = app.vault.process.bind(app.vault);
	app.vault.process = async (file, transform) => { assert.ok(await store.read(), 'backup precedes every source write'); return original(file, transform); };
	let saved: CardMarkers = { ...DEFAULT_MARKERS };
	const result = await harness.migrateTriggers(app, DEFAULT_MARKERS, custom, store, (value) => {
		assert.deepEqual(writes, ['a.md', 'b.md']); saved = value; return Promise.resolve();
	});
	assert.equal(result.files, 2);
	assert.equal(saved.registeredStart, custom.registeredStart);
	assert.equal(sources.get('a.md'), replaceTriggers(note + 'Example <START_ANKI>', DEFAULT_MARKERS, custom));
	assert.equal(sources.get('keep.md'), 'untouched');
	assert.equal(backups[0]!.files[0]!.before, note + 'Example <START_ANKI>');
	assert.equal(await store.read(), null);
	const cards = parseAnkiCards(sources.get('a.md')!, 'a.md', harness.cardMetadataFromSource(sources.get('a.md')!), custom);
	const updated = harness.transformBulkSource(sources.get('a.md')!, [cards[0]!], { kind: 'unregister' }, cards);
	assert.equal(parseAnkiCards(updated, 'a.md', undefined, custom)[0]!.registered, false);
});

test('trigger backup/read failures prevent source writes and settings changes', async () => {
	const { app, writes } = appFor();
	const { store } = migrationStore();
	store.write = () => Promise.reject(new Error('disk full'));
	let saved = false;
	await assert.rejects(harness.migrateTriggers(app, DEFAULT_MARKERS, custom, store, () => { saved = true; return Promise.resolve(); }), /disk full/);
	assert.equal(writes.length, 0); assert.equal(saved, false);
	app.vault.read = () => Promise.reject(new Error('cannot read'));
	await assert.rejects(harness.migrateTriggers(app, DEFAULT_MARKERS, custom, migrationStore().store, () => Promise.resolve()), /cannot read/);
	assert.equal(writes.length, 0);
});

test('failed source writes roll back exact original snapshots and old settings', async () => {
	const { app, sources } = appFor();
	const originalSources = new Map(sources);
	const { store, backups } = migrationStore();
	const process = app.vault.process.bind(app.vault);
	let fail = true;
	app.vault.process = (file, transform) => {
		if (file.path === 'b.md' && fail) { fail = false; return Promise.reject(new Error('write failed')); }
		return process(file, transform);
	};
	let saved: CardMarkers | undefined;
	await assert.rejects(harness.migrateTriggers(app, DEFAULT_MARKERS, custom, store, (value) => { saved = value; return Promise.resolve(); }), /Original files and triggers were restored/);
	assert.deepEqual(sources, originalSources);
	assert.equal(saved!.registeredStart, DEFAULT_MARKERS.registeredStart);
	assert.equal(backups.length, 1); assert.equal(await store.read(), null);
});

test('failed settings commit rolls back sources; failed archive can finalize after restart without overwriting edits', async () => {
	const { app, sources } = appFor();
	const { store } = migrationStore();
	await assert.rejects(harness.migrateTriggers(app, DEFAULT_MARKERS, custom, store, (value) =>
		value.registeredStart === custom.registeredStart ? Promise.reject(new Error('settings failed')) : Promise.resolve()), /Original files/);
	assert.equal(sources.get('a.md'), note);
	const archive = store.archive.bind(store);
	store.archive = () => Promise.reject(new Error('archive failed'));
	await assert.rejects(harness.migrateTriggers(app, DEFAULT_MARKERS, custom, store, () => Promise.resolve()), /Triggers were applied/);
	store.archive = archive;
	sources.set('a.md', sources.get('a.md')! + 'later user edit');
	await harness.recoverTriggers(app, store, custom, () => Promise.reject(new Error('must not change committed settings')));
	assert.ok(sources.get('a.md')!.endsWith('later user edit'));
	assert.equal(await store.read(), null);
});

test('concurrent edits are not overwritten during rollback and pending recovery survives restart', async () => {
	const { app, sources } = appFor();
	const { store } = migrationStore();
	const process = app.vault.process.bind(app.vault);
	let fail = true;
	app.vault.process = (file, transform) => {
		if (file.path === 'b.md' && fail) {
			fail = false; sources.set('a.md', sources.get('a.md')! + 'concurrent edit');
			return Promise.reject(new Error('write failed'));
		}
		return process(file, transform);
	};
	await assert.rejects(harness.migrateTriggers(app, DEFAULT_MARKERS, custom, store, () => Promise.resolve()), /remains paused/);
	assert.ok(sources.get('a.md')!.endsWith('concurrent edit'));
	assert.ok(await store.read());
	await assert.rejects(harness.migrateTriggers(app, DEFAULT_MARKERS, custom, store, () => Promise.resolve()), /Recover the unfinished/);
	await assert.rejects(harness.recoverTriggers(app, store, DEFAULT_MARKERS, () => Promise.resolve()), /left edited/);
	// Simulate a user restoring the conflicted file from the durable snapshot, then retry.
	sources.set('a.md', note);
	await harness.recoverTriggers(app, store, DEFAULT_MARKERS, () => Promise.resolve());
	assert.equal(sources.get('a.md'), note); assert.equal(await store.read(), null);
});

test('durable journal round-trips, validates data, archives without overwriting backups, and retains no active journal', async () => {
	const files = new Map<string, string>();
	const directories = new Set<string>();
	const app = { vault: { configDir: 'custom-config', adapter: {
		exists: (path: string) => Promise.resolve(files.has(path) || directories.has(path)),
		read: (path: string) => Promise.resolve(files.get(path)!),
		write: (path: string, text: string) => { files.set(path, text); return Promise.resolve(); },
		mkdir: (path: string) => { directories.add(path); return Promise.resolve(); },
		rename: (from: string, to: string) => { assert.ok(!files.has(to)); files.set(to, files.get(from)!); files.delete(from); return Promise.resolve(); },
	} } } as unknown as App;
	const store = new harness.VaultTriggerJournal(app, 'anki-card-manager');
	assert.equal(await store.read(), null);
	const journal: TriggerJournal = { version: 1, phase: 'prepared', previous: { ...DEFAULT_MARKERS }, next: custom, files: [{ path: 'a.md', before: note, after: replaceTriggers(note, DEFAULT_MARKERS, custom) }] };
	await store.write(journal);
	assert.equal((await store.read())!.files[0]!.before, note);
	const first = await store.archive('applied');
	assert.ok(first.startsWith('custom-config/plugins/anki-card-manager/trigger-backups/'));
	await store.write(journal); const second = await store.archive('restored');
	assert.notEqual(first, second); assert.equal(files.size, 2);
	files.set(store.path, '{broken');
	await assert.rejects(store.read());
});

test('manager rescans custom triggers and suspends row actions until migration recovery finishes', async () => {
	const { app } = appFor(new Map([['a.md', replaceTriggers(note, DEFAULT_MARKERS, custom)]]));
	const container = dom.window.document.body.createDiv();
	const leaf = new harness.WorkspaceLeaf(app, container) as unknown as WorkspaceLeaf;
	let markers = custom; let paused = false;
	const view = new harness.AnkiManagerView(leaf, () => markers, () => paused);
	try {
		await view.onOpen();
		assert.equal(container.querySelectorAll('tbody tr').length, 2);
		container.querySelector<HTMLInputElement>('[aria-label="Select all matching cards"]')!.click();
		paused = true; await view.refresh();
		assert.equal(container.querySelectorAll('tbody tr').length, 0);
		assert.equal(button(container, 'Delete').disabled, true);
		assert.ok(container.textContent?.includes('Trigger migration is pending'));
		paused = false; await view.refresh();
		assert.equal(container.querySelectorAll('tbody tr').length, 2);
		assert.ok(container.textContent?.includes('0 selected'));
		markers = { ...DEFAULT_MARKERS }; await view.refresh();
		assert.equal(container.querySelectorAll('tbody tr').length, 0);
	} finally { await view.onClose(); container.remove(); }
});

test('trigger settings stay draft until Apply; closing discards drafts and default type has only two choices', async () => {
	const { app } = appFor();
	let applied = 0; let saves = 0;
	const plugin = { settings: { ...harness.DEFAULT_SETTINGS, markers: { ...DEFAULT_MARKERS } }, migrationBlocked: false, migrationBusy: false,
		saveSettings: () => { saves += 1; return Promise.resolve(); }, refreshEditorDecorations: () => {},
		applyTriggers: (markers: CardMarkers) => { applied += 1; plugin.settings.markers = { ...markers }; return Promise.resolve(); },
	} as unknown as AnkiCardManagerPlugin;
	const tab = new harness.AnkiCardManagerSettingTab(app, plugin);
	dom.window.document.body.append(tab.containerEl); tab.display();
	const choices = tab.containerEl.querySelector<HTMLSelectElement>('select[aria-label="Card type"]')!;
	assert.deepEqual([...choices.options].map((option) => option.value), ['Obsidian-Basic', 'Cloze']);
	const draft = tab.containerEl.querySelector<HTMLInputElement>('input[aria-label="Registered card start"]')!;
	draft.value = '[MY_START]'; draft.dispatchEvent(inputEvent());
	assert.equal(plugin.settings.markers.registeredStart, DEFAULT_MARKERS.registeredStart);
	assert.equal(applied, 0); assert.equal(saves, 0);
	tab.display();
	const restored = tab.containerEl.querySelector<HTMLInputElement>('input[aria-label="Registered card start"]')!;
	assert.equal(restored.value, DEFAULT_MARKERS.registeredStart);
	restored.value = '[MY_START]'; restored.dispatchEvent(inputEvent());
	button(tab.containerEl, '저장 및 전체 Vault에 적용').click();
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal(applied, 1); assert.equal(plugin.settings.markers.registeredStart, '[MY_START]');
	assert.equal(saves, 0, 'draft does not use ordinary immediate settings persistence');
	tab.containerEl.remove();
});
