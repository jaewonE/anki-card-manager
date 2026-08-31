import { normalizePath } from 'obsidian';
import type { App } from 'obsidian';
import { validateMarkers } from './markers';
import type { TriggerJournal, TriggerJournalStore } from './triggerMigration';

/** Backups stay inside this Vault's plugin directory, outside Markdown scans. */
export class VaultTriggerJournal implements TriggerJournalStore {
	readonly path: string;
	readonly backupDirectory: string;
	constructor(private readonly app: App, pluginId: string) {
		const base = normalizePath(`${app.vault.configDir}/plugins/${pluginId}`);
		this.path = `${base}/trigger-migration.json`;
		this.backupDirectory = `${base}/trigger-backups`;
	}
	async read(): Promise<TriggerJournal | null> {
		if (!await this.app.vault.adapter.exists(this.path)) return null;
		const parsed: unknown = JSON.parse(await this.app.vault.adapter.read(this.path));
		if (!parsed || typeof parsed !== 'object') throw new Error('Invalid trigger migration backup.');
		const journal = parsed as TriggerJournal;
		if (journal.version !== 1 || !['prepared', 'written'].includes(journal.phase) || !Array.isArray(journal.files) ||
			journal.files.some((entry) => !entry || typeof entry.path !== 'string' || typeof entry.before !== 'string' || typeof entry.after !== 'string')) {
			throw new Error('Invalid trigger migration backup. Restore it before applying new triggers.');
		}
		validateMarkers(journal.previous); validateMarkers(journal.next);
		return journal;
	}
	async write(journal: TriggerJournal): Promise<void> {
		const contents = JSON.stringify(journal);
		await this.app.vault.adapter.write(this.path, contents);
		if (await this.app.vault.adapter.read(this.path) !== contents) throw new Error('Could not verify the trigger backup. No source files were changed.');
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
