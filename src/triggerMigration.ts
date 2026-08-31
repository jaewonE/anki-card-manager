import { MarkdownView, TFile } from 'obsidian';
import type { App } from 'obsidian';
import { replaceTriggers, sameMarkers, validateMarkers } from './markers';
import type { CardMarkers } from './markers';

export interface TriggerJournal {
	version: 1;
	phase: 'prepared' | 'written';
	previous: CardMarkers;
	next: CardMarkers;
	files: { path: string; before: string; after: string }[];
}
export interface TriggerJournalStore {
	read(): Promise<TriggerJournal | null>;
	write(journal: TriggerJournal): Promise<void>;
	archive(outcome: 'applied' | 'restored'): Promise<string>;
}
export type SaveMarkers = (markers: CardMarkers) => Promise<void>;

async function flushEditors(app: App): Promise<void> {
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		if (leaf.view instanceof MarkdownView) await leaf.view.save();
	}
}

async function restore(app: App, journal: TriggerJournal): Promise<void> {
	const conflicts: string[] = [];
	for (const entry of [...journal.files].reverse()) {
		try {
			const file = app.vault.getAbstractFileByPath(entry.path);
			if (!(file instanceof TFile)) throw new Error('Missing file');
			await app.vault.process(file, (source) => {
				if (source === entry.before) return source;
				if (source !== entry.after) throw new Error('Concurrent edit');
				return entry.before;
			});
		} catch { conflicts.push(entry.path); }
	}
	if (conflicts.length) throw new Error(`Recovery left edited/missing files untouched: ${conflicts.join(', ')}. Restore these from the trigger migration backup, then retry recovery.`);
}

export async function migrateTriggers(app: App, previous: CardMarkers, next: CardMarkers,
	store: TriggerJournalStore, save: SaveMarkers): Promise<{ files: number; backup: string }> {
	validateMarkers(previous); validateMarkers(next);
	if (await store.read()) throw new Error('Recover the unfinished trigger migration before applying new triggers.');
	if (sameMarkers(previous, next)) return { files: 0, backup: '' };
	await flushEditors(app);
	const journal: TriggerJournal = { version: 1, phase: 'prepared', previous: { ...previous }, next: { ...next }, files: [] };
	for (const file of app.vault.getMarkdownFiles()) {
		const before = await app.vault.read(file);
		const after = replaceTriggers(before, previous, next);
		if (before !== after) journal.files.push({ path: file.path, before, after });
	}
	// A durable journal is required before the first source write. Never guess a reverse replacement.
	await store.write(journal);
	let committed = false;
	try {
		for (const entry of journal.files) {
			const file = app.vault.getAbstractFileByPath(entry.path);
			if (!(file instanceof TFile)) throw new Error(`File disappeared: ${entry.path}`);
			await app.vault.process(file, (source) => {
				if (source !== entry.before) throw new Error(`File changed during migration: ${entry.path}`);
				return entry.after;
			});
		}
		await save(next);
		committed = true;
		return { files: journal.files.length, backup: await store.archive('applied') };
	} catch (error) {
		const reason = error instanceof Error ? error.message : 'Trigger migration failed.';
		if (committed) throw new Error(`${reason} Triggers were applied; use recovery to finalize the backup.`);
		try {
			await restore(app, journal);
			await save(previous);
			await store.archive('restored');
		} catch (recoveryError) {
			throw new Error(`${reason} ${recoveryError instanceof Error ? recoveryError.message : 'Recovery needs attention.'} Card automation remains paused until recovery completes.`);
		}
		throw new Error(`${reason} Original files and triggers were restored.`);
	}
}

export async function recoverTriggers(app: App, store: TriggerJournalStore, current: CardMarkers, save: SaveMarkers): Promise<string> {
	const journal = await store.read();
	if (!journal) return '';
	await flushEditors(app);
	// Settings are committed only after every file write. The original backup stays immutable.
	if (sameMarkers(current, journal.next)) return store.archive('applied');
	await restore(app, journal);
	await save(journal.previous);
	return store.archive('restored');
}
