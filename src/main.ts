import { Notice, Plugin } from 'obsidian';
import { AnkiCardAutoCompleter } from './autocomplete';
import { createAnkiCardEditorExtension } from './editorExtension';
import {
	AnkiCardManagerSettingTab,
	DEFAULT_SETTINGS,
} from './settings';
import type { AnkiCardManagerSettings } from './types';
import { DEFAULT_MARKERS, validateMarkers } from './markers';
import type { CardMarkers } from './markers';
import { CARD_TYPES } from './cardTypes';
import { VaultTriggerJournal } from './triggerJournal';
import { migrateTriggers, recoverTriggers } from './triggerMigration';
import {
	ANKI_MANAGER_VIEW_TYPE,
	AnkiManagerView,
} from './ui/managerView';

export default class AnkiCardManagerPlugin extends Plugin {
	settings!: AnkiCardManagerSettings;
	private autoCompleter!: AnkiCardAutoCompleter;
	private triggerJournal!: VaultTriggerJournal;
	migrationBlocked = false;
	migrationBusy = false;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.triggerJournal = new VaultTriggerJournal(this.app, this.manifest.id);
		this.migrationBlocked = await this.hasPendingMigration();
		if (this.migrationBlocked) new Notice('Unfinished trigger migration: open Anki card manager settings to recover. Card automation is paused.', 10000);
		this.autoCompleter = new AnkiCardAutoCompleter(
			this.app,
			() => this.settings,
			() => this.migrationBlocked,
		);

		this.registerView(
			ANKI_MANAGER_VIEW_TYPE,
			(leaf) => new AnkiManagerView(leaf, () => this.settings.markers, () => this.migrationBlocked),
		);
		this.registerEditorExtension(
			createAnkiCardEditorExtension(
				this.app,
				() => this.settings.cardPlacement,
				() => this.settings.truncateTitles,
				() => this.settings.markers,
				() => this.migrationBlocked,
			),
		);
		this.registerEvent(
			this.app.workspace.on('editor-change', (editor, info) => {
				void this.autoCompleter.onEditorChange(editor, info);
			}),
		);

		this.addRibbonIcon('library-big', 'Open Anki card manager', () => {
			void this.activateManagerView();
		});
		this.addCommand({
			id: 'open-card-manager',
			name: 'Open card manager',
			callback: () => void this.activateManagerView(),
		});
		this.addCommand({
			id: 'insert-anki-card',
			name: 'Insert Anki card',
			editorCallback: (editor, info) => {
				void this.autoCompleter.insertAtCursor(editor, info);
			},
		});

		this.addSettingTab(new AnkiCardManagerSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<AnkiCardManagerSettings>,
		);
		this.settings.markers = { ...DEFAULT_MARKERS, ...this.settings.markers };
		try { validateMarkers(this.settings.markers); }
		catch { this.settings.markers = { ...DEFAULT_MARKERS }; new Notice('Invalid trigger settings; using default triggers. No files were changed.'); }
		if (!CARD_TYPES.some((type) => type.name === this.settings.defaultCardType)) this.settings.defaultCardType = 'Obsidian-Basic';
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	refreshEditorDecorations(): void {
		this.app.workspace.updateOptions();
	}

	private async hasPendingMigration(): Promise<boolean> {
		try { return Boolean(await this.triggerJournal.read()); }
		catch { return true; }
	}

	private async persistMarkers(markers: CardMarkers): Promise<void> {
		await this.saveData({ ...this.settings, markers: { ...markers } });
		this.settings.markers = { ...markers };
	}

	async applyTriggers(markers: CardMarkers): Promise<void> {
		await this.runMigration(async () => {
			const result = await migrateTriggers(this.app, this.settings.markers, markers, this.triggerJournal,
				(value) => this.persistMarkers(value));
			new Notice(`Triggers saved; ${result.files} Markdown files updated.${result.backup ? ` Backup: ${result.backup}` : ''}`, 10000);
		});
	}

	async recoverTriggerMigration(): Promise<void> {
		await this.runMigration(async () => {
			const backup = await recoverTriggers(this.app, this.triggerJournal, this.settings.markers, (value) => this.persistMarkers(value));
			new Notice(`Trigger recovery completed.${backup ? ` Backup: ${backup}` : ''}`, 10000);
		});
	}

	private async runMigration(action: () => Promise<void>): Promise<void> {
		if (this.migrationBusy) throw new Error('A trigger migration is already running.');
		this.migrationBusy = this.migrationBlocked = true;
		try { await this.refreshViews(); await action(); }
		finally {
			this.migrationBusy = false;
			this.migrationBlocked = await this.hasPendingMigration();
			await this.refreshViews();
		}
	}

	private async refreshViews(): Promise<void> {
		this.refreshEditorDecorations();
		for (const leaf of this.app.workspace.getLeavesOfType(ANKI_MANAGER_VIEW_TYPE)) {
			if (leaf.view instanceof AnkiManagerView) await leaf.view.refresh();
		}
	}

	private async activateManagerView(): Promise<void> {
		let leaf = this.app.workspace.getLeavesOfType(ANKI_MANAGER_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = this.app.workspace.getLeaf('tab');
			await leaf.setViewState({
				type: ANKI_MANAGER_VIEW_TYPE,
				active: true,
			});
		}
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
		const view = leaf.view;
		if (view instanceof AnkiManagerView) await view.refresh();
		else new Notice('Could not open the Anki card manager.');
	}
}
