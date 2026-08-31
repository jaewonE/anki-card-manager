import { Notice, Setting } from 'obsidian';
import type AnkiCardManagerPlugin from '../main';
import { MARKER_KEYS, validateMarkers } from '../markers';

const SAVE_TRIGGER_LABEL = '저장 및 전체 Vault에 적용';

export function renderTriggerSettings(container: HTMLElement, plugin: AnkiCardManagerPlugin, redisplay: () => void): void {
	const draft = { ...plugin.settings.markers };
	new Setting(container).setName('Card triggers').setHeading();
	container.createEl('p', { text: 'Trigger edits remain a draft until you apply them. This literally replaces every occurrence of the four current triggers in all vault Markdown, including prose, code examples and YAML. It does not change binary files or configure Obsidian-to-Anki; update that plugin separately to use the same triggers.' });
	container.createEl('p', { text: 'A source backup is kept in this plugin’s trigger-backups folder. Keep an independent vault backup and avoid editing notes during migration. Closing settings discards unapplied trigger edits.' });
	const names = { registeredStart: 'Registered card start', registeredEnd: 'Registered card end',
		unregisteredStart: 'Unregistered card start', unregisteredEnd: 'Unregistered card end' };
	for (const key of MARKER_KEYS) {
		new Setting(container).setName(names[key]).addText((text) => text.setValue(draft[key])
			.setDisabled(plugin.migrationBlocked).onChange((value) => { draft[key] = value; }));
	}
	const run = async (action: () => Promise<void>): Promise<void> => {
		for (const input of Array.from(container.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select'))) input.disabled = true;
		try { await action(); }
		catch (error) { new Notice(error instanceof Error ? error.message : 'Could not apply triggers.', 15000); }
		finally { redisplay(); }
	};
	new Setting(container).setName('Save and apply to the entire vault').setDesc('All four triggers must be distinct single-line strings that do not contain each other.')
		.addButton((button) => button.setButtonText(SAVE_TRIGGER_LABEL).setCta().setDisabled(plugin.migrationBlocked)
			.onClick(() => {
				try { validateMarkers(draft); }
				catch (error) { new Notice(error instanceof Error ? error.message : 'Invalid triggers.'); return; }
				void run(() => plugin.applyTriggers(draft));
			}));
	if (plugin.migrationBlocked) {
		new Setting(container).setName('Unfinished trigger migration').setDesc('Card automation is paused. Recovery restores unchanged migrated files without overwriting concurrent edits, or finalizes a completed migration backup.')
			.addButton((button) => button.setButtonText('Recover trigger migration').setDisabled(plugin.migrationBusy)
				.onClick(() => void run(() => plugin.recoverTriggerMigration())));
	}
}
