import { App, PluginSettingTab, Setting } from 'obsidian';
import type AnkiCardManagerPlugin from './main';
import type { AnkiCardManagerSettings, CardPlacement } from './types';

export const DEFAULT_SETTINGS: AnkiCardManagerSettings = {
	cardPlacement: 'inline',
	truncateTitles: false,
	autoCompleteCards: true,
	defaultCardType: 'Obsidian-Basic',
	defaultDeck: 'Inbox',
	defaultTag: 'Inbox',
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

		new Setting(containerEl)
			.setName('Card placement')
			.setDesc(
				'Keep rendered cards at their source position, or collect them at the end of the current document.',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('inline', 'Keep in place')
					.addOption('document-end', 'Collect at document end')
					.setValue(this.plugin.settings.cardPlacement)
					.onChange(async (value) => {
						this.plugin.settings.cardPlacement = value as CardPlacement;
						await this.plugin.saveSettings();
						this.plugin.refreshEditorDecorations();
					}),
			);

		new Setting(containerEl)
			.setName('Single-line titles')
			.setDesc('Keep questions on one line and replace overflow with an ellipsis. Off by default.')
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
				'Complete a line containing <START_ANKI> and add missing anki_deck and anki_tags YAML properties.',
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
		this.addRequiredTextSetting(
			containerEl,
			'Card type',
			'The first line in every completed card block.',
			'defaultCardType',
		);
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
	}

	private addRequiredTextSetting(
		container: HTMLElement,
		name: string,
		description: string,
		key: 'defaultCardType' | 'defaultDeck' | 'defaultTag',
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
