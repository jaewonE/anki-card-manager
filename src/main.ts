import { Notice, Plugin } from 'obsidian';
import { AnkiCardAutoCompleter } from './autocomplete';
import { createAnkiCardEditorExtension } from './editorExtension';
import {
	AnkiCardManagerSettingTab,
	DEFAULT_SETTINGS,
} from './settings';
import type { AnkiCardManagerSettings } from './types';
import {
	ANKI_MANAGER_VIEW_TYPE,
	AnkiManagerView,
} from './ui/managerView';

export default class AnkiCardManagerPlugin extends Plugin {
	settings!: AnkiCardManagerSettings;
	private autoCompleter!: AnkiCardAutoCompleter;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.autoCompleter = new AnkiCardAutoCompleter(
			this.app,
			() => this.settings,
		);

		this.registerView(
			ANKI_MANAGER_VIEW_TYPE,
			(leaf) => new AnkiManagerView(leaf),
		);
		this.registerEditorExtension(
			createAnkiCardEditorExtension(
				this.app,
				() => this.settings.cardPlacement,
				() => this.settings.truncateTitles,
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
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	refreshEditorDecorations(): void {
		this.app.workspace.updateOptions();
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
