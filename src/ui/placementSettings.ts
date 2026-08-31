import { ButtonComponent, Modal, Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type AnkiCardManagerPlugin from '../main';

export class ConfirmCardCollectionModal extends Modal {
	constructor(app: App, private readonly apply: () => Promise<void>, private readonly finished: () => void) { super(app); }
	onOpen(): void {
		this.titleEl.setText('Move card source blocks across the entire vault?');
		this.contentEl.createEl('p', { text: 'This physically moves registered and unregistered card blocks to the end of every Markdown note, before the first footnote definition. Blank gaps at the old locations become a single newline. Card contents, identifiers and order are preserved.' });
		this.contentEl.createEl('p', { text: 'This is not just a display preference. Returning to in-place display does not restore original positions. A complete before/after backup is kept in this plugin’s placement-backups folder. Keep an independent vault backup and do not edit notes during collection.' });
		const label = this.contentEl.createEl('label', { text: 'I understand that source files throughout this vault will be changed.' });
		const consent = label.createEl('input', { type: 'checkbox', attr: { 'aria-label': 'Confirm physical card relocation' } });
		label.prepend(consent);
		const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
		const cancel = new ButtonComponent(actions).setButtonText('Cancel').onClick(() => this.close());
		const confirm = new ButtonComponent(actions).setButtonText('Move all cards').setWarning().setDisabled(true);
		consent.addEventListener('change', () => { confirm.setDisabled(!consent.checked); });
		confirm.onClick(() => { void (async () => {
			if (!consent.checked) return;
			consent.disabled = true; confirm.setDisabled(true); cancel.setDisabled(true);
			try { await this.apply(); }
			catch (error) { new Notice(error instanceof Error ? error.message : 'Could not collect cards.', 15000); }
			finally { this.close(); this.finished(); }
		})(); });
	}
	onClose(): void { this.contentEl.empty(); }
}

export function renderPlacementSettings(container: HTMLElement, plugin: AnkiCardManagerPlugin, redisplay: () => void): void {
	const confirm = (): void => new ConfirmCardCollectionModal(plugin.app, () => plugin.collectCards(), redisplay).open();
	new Setting(container).setName('Card placement')
		.setDesc('Keep cards at their actual source positions. Collecting physically moves card blocks across the vault after a second confirmation; it never runs automatically on startup.')
		.addDropdown((dropdown) => dropdown.addOption('inline', 'Keep in place').addOption('document-end', 'Collect at document end')
			.setValue(plugin.settings.cardPlacement).setDisabled(plugin.migrationBlocked)
			.onChange(async (value) => {
				dropdown.setValue(plugin.settings.cardPlacement);
				if (value === plugin.settings.cardPlacement) return;
				if (value === 'document-end') confirm();
				else {
					try { await plugin.keepCardsInPlace(); redisplay(); }
					catch (error) { new Notice(error instanceof Error ? error.message : 'Could not save placement.'); }
				}
			}));
	if (plugin.settings.cardPlacement === 'document-end') new Setting(container).setName('Collect newly added cards')
		.setDesc('Run the confirmed vault-wide relocation again. Rendering and typing do not move source text.')
		.addButton((button) => button.setButtonText('Collect cards again').setDisabled(plugin.migrationBlocked).onClick(confirm));
	if (plugin.placementRecoveryPending) new Setting(container).setName('Unfinished card placement migration')
		.setDesc('Recovery restores unchanged migrated files, or finalizes the backup after a completed move. Concurrent edits are never overwritten.')
		.addButton((button) => button.setButtonText('Recover card placement').setDisabled(plugin.migrationBusy).onClick(() => { void (async () => {
			button.setDisabled(true);
			try { await plugin.recoverCardPlacement(); }
			catch (error) { new Notice(error instanceof Error ? error.message : 'Recovery failed.', 15000); }
			finally { redisplay(); }
		})(); }));
}
