import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import type { CardMarkers } from './markers';
import type { CardPlacement } from './types';
import { collectCardsAtEnd } from './cardPlacement';
import { flushEditors, restore } from './triggerMigration';

export interface PlacementState { cardPlacement: CardPlacement; placementMigrationId: string }
export interface PlacementJournal {
	version: 1;
	id: string;
	previous: PlacementState;
	files: { path: string; before: string; after: string }[];
}
export interface PlacementJournalStore {
	read(): Promise<PlacementJournal | null>;
	write(journal: PlacementJournal): Promise<void>;
	archive(outcome: 'applied' | 'restored'): Promise<string>;
}
type SavePlacement = (state: PlacementState) => Promise<void>;

export async function migratePlacement(app: App, previous: PlacementState, markers: CardMarkers,
	store: PlacementJournalStore, save: SavePlacement): Promise<{ files: number; backup: string }> {
	if (await store.read()) throw new Error('Recover the unfinished card placement migration first.');
	await flushEditors(app);
	const journal: PlacementJournal = { version: 1, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		previous: { ...previous }, files: [] };
	for (const file of app.vault.getMarkdownFiles()) {
		const before = await app.vault.read(file);
		let after: string;
		try { after = collectCardsAtEnd(before, markers); }
		catch (error) { throw new Error(`${file.path}: ${error instanceof Error ? error.message : 'Could not plan card placement'}`); }
		if (before !== after) journal.files.push({ path: file.path, before, after });
	}
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
		await save({ cardPlacement: 'document-end', placementMigrationId: journal.id });
		committed = true;
		return { files: journal.files.length, backup: await store.archive('applied') };
	} catch (error) {
		const reason = error instanceof Error ? error.message : 'Card placement failed.';
		if (committed) throw new Error(`${reason} Cards were moved; use recovery to finalize the backup.`);
		try { await restore(app, journal); await save(previous); await store.archive('restored'); }
		catch (recoveryError) {
			throw new Error(`${reason} ${recoveryError instanceof Error ? recoveryError.message : 'Recovery needs attention.'} Card automation remains paused until recovery completes.`);
		}
		throw new Error(`${reason} Original files and placement settings were restored.`);
	}
}

export async function recoverPlacement(app: App, store: PlacementJournalStore, current: PlacementState, save: SavePlacement): Promise<string> {
	const journal = await store.read();
	if (!journal) return '';
	await flushEditors(app);
	// A unique commit stamp also distinguishes interrupted repeat collections.
	if (current.placementMigrationId === journal.id) return store.archive('applied');
	await restore(app, journal);
	await save(journal.previous);
	return store.archive('restored');
}
