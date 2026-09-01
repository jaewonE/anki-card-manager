import { App, PluginSettingTab, Setting } from 'obsidian';
import type AnkiCardManagerPlugin from './main';
import type { AnkiCardManagerSettings } from './types';
import { DEFAULT_MARKERS } from './markers';
import { CARD_TYPES } from './cardTypes';
import { renderTriggerSettings } from './ui/triggerSettings';
import { renderPlacementSettings } from './ui/placementSettings';

export const DEFAULT_SETTINGS: AnkiCardManagerSettings = {
	indexNamespace: '',
	cardPlacement: 'inline',
	placementMigrationId: '',
	truncateTitles: false,
	autoCompleteCards: true,
	defaultCardType: 'Obsidian-Basic',
	defaultDeck: 'Inbox',
	defaultTag: 'Inbox',
	markers: { ...DEFAULT_MARKERS },
};

export class AnkiCardManagerSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: AnkiCardManagerPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		renderPlacementSettings(containerEl, this.plugin, () => this.display());

		new Setting(containerEl)
			.setName('Single-line titles')
			.setDesc('Truncate closed cards only; expanding a card shows the full question. Off by default.')
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.truncateTitles)
				.onChange(async (value) => {
					this.plugin.settings.truncateTitles = value;
					await this.plugin.saveSettings();
					this.plugin.refreshEditorDecorations();
				}));

		new Setting(containerEl)
			.setName('Complete start markers')
			.setDesc(
				`Complete a line containing ${this.plugin.settings.markers.registeredStart} and add missing anki_deck and anki_tags YAML properties.`,
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoCompleteCards)
					.onChange(async (value) => {
						this.plugin.settings.autoCompleteCards = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName('New card defaults').setHeading();
		new Setting(containerEl).setName('Card type').setDesc('The first line in every completed card block.')
			.addDropdown((dropdown) => {
				for (const type of CARD_TYPES) dropdown.addOption(type.name, type.name);
				dropdown.setValue(this.plugin.settings.defaultCardType).onChange(async (value) => {
					this.plugin.settings.defaultCardType = value;
					await this.plugin.saveSettings();
				});
			});
		this.addRequiredTextSetting(
			containerEl,
			'Deck',
			'Used when anki_deck is missing from the file YAML.',
			'defaultDeck',
		);
		this.addRequiredTextSetting(
			containerEl,
			'Tag',
			'Added as a one-item list when anki_tags is missing from the file YAML.',
			'defaultTag',
		);
		renderTriggerSettings(containerEl, this.plugin, () => this.display());
	}

	private addRequiredTextSetting(
		container: HTMLElement,
		name: string,
		description: string,
		key: 'defaultDeck' | 'defaultTag',
	): void {
		new Setting(container)
			.setName(name)
			.setDesc(description)
			.addText((text) =>
				text
					.setValue(this.plugin.settings[key])
					.onChange(async (value) => {
						const normalized = value.trim();
						if (normalized === '') return;
						this.plugin.settings[key] = normalized;
						await this.plugin.saveSettings();
					}),
			);
	}
}
