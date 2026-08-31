import { normalizePath } from 'obsidian';
import type { App } from 'obsidian';
import type { PlacementJournal, PlacementJournalStore } from './placementMigration';

export class VaultPlacementJournal implements PlacementJournalStore {
	readonly path: string;
	readonly backupDirectory: string;
	constructor(private readonly app: App, pluginId: string) {
		const base = normalizePath(`${app.vault.configDir}/plugins/${pluginId}`);
		this.path = `${base}/placement-migration.json`;
		this.backupDirectory = `${base}/placement-backups`;
	}
	async read(): Promise<PlacementJournal | null> {
		if (!await this.app.vault.adapter.exists(this.path)) return null;
		const parsed: unknown = JSON.parse(await this.app.vault.adapter.read(this.path));
		if (!parsed || typeof parsed !== 'object') throw new Error('Invalid placement migration backup.');
		const journal = parsed as PlacementJournal;
		if (journal.version !== 1 || typeof journal.id !== 'string' || !journal.id ||
			!journal.previous || !['inline', 'document-end'].includes(journal.previous.cardPlacement) ||
			typeof journal.previous.placementMigrationId !== 'string' || !Array.isArray(journal.files) ||
			journal.files.some((entry) => !entry || typeof entry.path !== 'string' || typeof entry.before !== 'string' || typeof entry.after !== 'string')) {
			throw new Error('Invalid placement migration backup. Restore it before collecting cards.');
		}
		return journal;
	}
	async write(journal: PlacementJournal): Promise<void> {
		const contents = JSON.stringify(journal);
		await this.app.vault.adapter.write(this.path, contents);
		if (await this.app.vault.adapter.read(this.path) !== contents) throw new Error('Could not verify the placement backup. No source files were changed.');
	}
	async archive(outcome: 'applied' | 'restored'): Promise<string> {
		const adapter = this.app.vault.adapter;
		if (!await adapter.exists(this.backupDirectory)) await adapter.mkdir(this.backupDirectory);
		let suffix = 0;
		const stamp = Date.now();
		let destination: string;
		do { destination = `${this.backupDirectory}/${stamp}-${outcome}-${suffix++}.json`; }
		while (await adapter.exists(destination));
		await adapter.rename(this.path, destination);
		return destination;
	}
}
