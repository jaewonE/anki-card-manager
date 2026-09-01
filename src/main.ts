import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
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
import { VaultPlacementJournal } from './placementJournal';
import { migratePlacement, recoverPlacement } from './placementMigration';
import type { PlacementState } from './placementMigration';
import { createReadingPostProcessor } from './readingView';
import {
	ANKI_MANAGER_VIEW_TYPE,
	AnkiManagerView,
} from './ui/managerView';
import { CardIndexService } from './cardIndex';

export default class AnkiCardManagerPlugin extends Plugin {
	settings!: AnkiCardManagerSettings;
	private autoCompleter!: AnkiCardAutoCompleter;
	private triggerJournal!: VaultTriggerJournal;
	private placementJournal!: VaultPlacementJournal;
	private cardIndex!: CardIndexService;
	migrationBlocked = false;
	migrationBusy = false;
	triggerRecoveryPending = false;
	placementRecoveryPending = false;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.cardIndex = new CardIndexService(
			this.app,
			() => this.settings.markers,
			`${this.manifest.id}:${this.settings.indexNamespace ?? this.app.vault.getName()}`,
		);
		await this.cardIndex.initialize();
		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (file instanceof TFile) this.cardIndex.schedule(file);
		}));
		this.registerEvent(this.app.vault.on('create', (file) => {
			if (file instanceof TFile) this.cardIndex.schedule(file);
		}));
		this.registerEvent(this.app.vault.on('delete', (file) => {
			if (file instanceof TFile) void this.cardIndex.remove(file.path);
		}));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFile) void this.cardIndex.rename(file, oldPath);
		}));
		this.triggerJournal = new VaultTriggerJournal(this.app, this.manifest.id);
		this.placementJournal = new VaultPlacementJournal(this.app, this.manifest.id);
		this.migrationBlocked = await this.hasPendingMigration();
		if (this.migrationBlocked) new Notice('Unfinished card migration: open Anki card manager settings to recover. Card automation is paused.', 10000);
		this.autoCompleter = new AnkiCardAutoCompleter(
			this.app,
			() => this.settings,
			() => this.migrationBlocked,
		);

		this.registerView(
			ANKI_MANAGER_VIEW_TYPE,
			(leaf) => new AnkiManagerView(leaf, () => this.settings.markers, () => this.migrationBlocked, this.cardIndex),
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
		this.registerMarkdownPostProcessor(createReadingPostProcessor(this.app, () => this.settings,
			() => this.migrationBlocked, () => this.refreshEditorDecorations()));
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
		this.addCommand({
			id: 'rebuild-card-index',
			name: 'Rebuild card index',
			callback: () => void this.rebuildCardIndex(),
		});

		this.addSettingTab(new AnkiCardManagerSettingTab(this.app, this));
		this.app.workspace.onLayoutReady(() => {
			this.refreshEditorDecorations();
			void this.cardIndex.refresh();
		});
	}

	onunload(): void {
		this.cardIndex.dispose();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<AnkiCardManagerSettings>,
		);
		this.settings.markers = { ...DEFAULT_MARKERS, ...this.settings.markers };
		if (!this.settings.indexNamespace) {
			this.settings.indexNamespace = window.crypto.randomUUID?.() ??
				`${Date.now()}-${Math.random().toString(36).slice(2)}`;
			await this.saveData(this.settings);
		}
		try { validateMarkers(this.settings.markers); }
		catch { this.settings.markers = { ...DEFAULT_MARKERS }; new Notice('Invalid trigger settings; using default triggers. No files were changed.'); }
		if (!CARD_TYPES.some((type) => type.name === this.settings.defaultCardType)) this.settings.defaultCardType = 'Obsidian-Basic';
		if (this.settings.cardPlacement === 'document-end' && !this.settings.placementMigrationId) {
			this.settings.cardPlacement = 'inline';
			new Notice('Collect at document end now moves source files. Keep in place is active until you confirm collection in settings. No notes were moved.', 10000);
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	refreshEditorDecorations(): void {
		this.app.workspace.updateOptions();
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
			if (leaf.view instanceof MarkdownView && leaf.view.getMode() === 'preview') leaf.view.previewMode.rerender(true);
		}
	}

	private async hasPendingMigration(): Promise<boolean> {
		try { this.triggerRecoveryPending = Boolean(await this.triggerJournal.read()); }
		catch { this.triggerRecoveryPending = true; }
		try { this.placementRecoveryPending = Boolean(await this.placementJournal.read()); }
		catch { this.placementRecoveryPending = true; }
		return this.triggerRecoveryPending || this.placementRecoveryPending;
	}

	private async persistMarkers(markers: CardMarkers): Promise<void> {
		await this.saveData({ ...this.settings, markers: { ...markers } });
		this.settings.markers = { ...markers };
	}

	async applyTriggers(markers: CardMarkers): Promise<void> {
		if (this.migrationBlocked) throw new Error('Recover the unfinished migration first.');
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

	private placementState(): PlacementState {
		return { cardPlacement: this.settings.cardPlacement, placementMigrationId: this.settings.placementMigrationId ?? '' };
	}
	private async persistPlacement(value: PlacementState): Promise<void> {
		await this.saveData({ ...this.settings, ...value });
		Object.assign(this.settings, value);
	}
	async keepCardsInPlace(): Promise<void> {
		if (this.migrationBlocked) throw new Error('Recover the unfinished migration first.');
		await this.persistPlacement({ ...this.placementState(), cardPlacement: 'inline' });
		this.refreshEditorDecorations();
	}
	async collectCards(): Promise<void> {
		if (this.migrationBlocked) throw new Error('Recover the unfinished migration first.');
		await this.runMigration(async () => {
			const result = await migratePlacement(this.app, this.placementState(), this.settings.markers,
				this.placementJournal, (value) => this.persistPlacement(value));
			new Notice(`Cards collected in ${result.files} Markdown files. Backup: ${result.backup}`, 10000);
		});
	}
	async recoverCardPlacement(): Promise<void> {
		await this.runMigration(async () => {
			const backup = await recoverPlacement(this.app, this.placementJournal, this.placementState(), (value) => this.persistPlacement(value));
			new Notice(`Card placement recovery completed. Backup: ${backup}`, 10000);
		});
	}

	private async runMigration(action: () => Promise<void>): Promise<void> {
		if (this.migrationBusy) throw new Error('A card migration is already running.');
		this.migrationBusy = this.migrationBlocked = true;
		try { await this.refreshViews(); await action(); }
		finally {
			this.migrationBusy = false;
			this.migrationBlocked = await this.hasPendingMigration();
			try { await this.cardIndex.refresh(true); }
			catch (error) { console.error('Anki Card Manager: index refresh after migration failed', error); }
			await this.refreshViews();
		}
	}

	private async refreshViews(): Promise<void> {
		this.refreshEditorDecorations();
		for (const leaf of this.app.workspace.getLeavesOfType(ANKI_MANAGER_VIEW_TYPE)) {
			if (leaf.view instanceof AnkiManagerView) leaf.view.refreshState();
		}
	}

	private async activateManagerView(): Promise<void> {
		let leaf = this.app.workspace.getLeavesOfType(ANKI_MANAGER_VIEW_TYPE)[0];
		let created = false;
		if (!leaf) {
			created = true;
			leaf = this.app.workspace.getLeaf('tab');
			await leaf.setViewState({
				type: ANKI_MANAGER_VIEW_TYPE,
				active: true,
			});
		}
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
		const view = leaf.view;
		if (!(view instanceof AnkiManagerView)) new Notice('Could not open the Anki card manager.');
		else if (!created) await view.refresh();
	}

	private async rebuildCardIndex(): Promise<void> {
		if (this.migrationBlocked) {
			new Notice('Recover the unfinished card migration before rebuilding the index.');
			return;
		}
		new Notice('Rebuilding the Anki card index…');
		try {
			await this.cardIndex.rebuild();
			new Notice(`Anki card index rebuilt: ${this.cardIndex.snapshot().cards.length} cards.`);
		} catch (error) {
			console.error('Anki Card Manager: index rebuild failed', error);
			new Notice(error instanceof Error ? error.message : 'Could not rebuild the Anki card index.', 10000);
		}
	}
}
