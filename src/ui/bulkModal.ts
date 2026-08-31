import { Modal, Notice } from 'obsidian';
import type { App } from 'obsidian';
import { affectedCards, applyBulkAction, isMetadataAction, validateBulkAction } from '../bulkActions';
import type { BulkAction } from '../bulkActions';
import type { AnkiCard } from '../types';

export class BulkActionModal extends Modal {
	constructor(app: App, private readonly selected: AnkiCard[], private readonly all: AnkiCard[],
		private readonly kind: BulkAction['kind'], private readonly onDone: () => Promise<void>) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(`Bulk ${this.kind}: ${this.selected.length} selected cards`);
		this.modalEl.addClass('anki-card-manager-modal');
		const metadata = this.kind === 'deck' || this.kind === 'tags';
		const affected = affectedCards(this.selected, this.all, metadata);
		const paths = [...new Set(affected.map((card) => card.sourcePath))];
		this.contentEl.createEl('p', { text: metadata
			? `Deck and tags belong to the file YAML. This changes all ${affected.length} cards in ${paths.length} files, including ${affected.length - this.selected.length} unselected cards. Card blocks stay in their original files.`
			: `This changes ${this.selected.length} selected card blocks in ${paths.length} files. Other cards are not changed.` });
		const list = this.contentEl.createEl('details');
		list.createEl('summary', { text: 'Affected source files' });
		const files = list.createEl('ul');
		for (const path of paths) files.createEl('li', { text: path });
		let input: HTMLInputElement | HTMLTextAreaElement | undefined;
		let mode: HTMLSelectElement | undefined;
		if (this.kind === 'deck') {
			const label = this.contentEl.createEl('label', { cls: 'anki-card-manager-modal-field', text: 'Deck name' });
			input = label.createEl('input', { type: 'text', placeholder: 'Mother::Child' });
			const decks = new Set(this.selected.map((card) => card.deck));
			if (decks.size === 1) input.value = this.selected[0]?.deck ?? '';
		}
		if (this.kind === 'tags') {
			const modeLabel = this.contentEl.createEl('label', { cls: 'anki-card-manager-modal-field', text: 'Tag operation' });
			mode = modeLabel.createEl('select');
			for (const [value, text] of [['add', 'Add tags'], ['remove', 'Remove tags'], ['replace', 'Replace all tags']]) {
				mode.createEl('option', { value, text });
			}
			const label = this.contentEl.createEl('label', { cls: 'anki-card-manager-modal-field', text: 'Tags (one per line)' });
			input = label.createEl('textarea', { cls: 'anki-card-manager-modal-textarea', placeholder: 'Inbox\nStudy' });
		}
		this.contentEl.createEl('p', { text: this.kind === 'unregister'
			? 'Standalone Anki IDs are removed and markers are disabled. Existing notes in Anki are not deleted.'
			: this.kind === 'delete' ? 'Selected blocks (and exclusive fences) are removed from Markdown. Existing notes in Anki are not deleted. Keep a backup before continuing.'
				: metadata ? 'YAML formatting may be normalized. Other properties and the Markdown body are preserved. Keep a backup before bulk changes.'
					: 'Enables the Anki markers only. This does not run an Anki sync.' });
		const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
		const cancel = actions.createEl('button', { text: 'Cancel' });
		cancel.addEventListener('click', () => this.close());
		const confirm = actions.createEl('button', {
			text: metadata ? `Apply to all ${affected.length} cards in these files` : `Confirm ${this.kind}`,
			cls: this.kind === 'delete' || this.kind === 'unregister' ? 'mod-warning' : 'mod-cta',
		});
		confirm.addEventListener('click', () => {
			const action: BulkAction = this.kind === 'deck' ? { kind: 'deck', deck: input?.value ?? '' }
				: this.kind === 'tags' ? { kind: 'tags', mode: (mode?.value ?? 'add') as 'add' | 'remove' | 'replace',
					tags: [...new Set((input?.value ?? '').split(/\r?\n/).map((tag) => tag.trim()).filter(Boolean))] }
					: { kind: this.kind };
			try { validateBulkAction(action); }
			catch (error) { new Notice(error instanceof Error ? error.message : 'Invalid input.'); return; }
			confirm.disabled = true;
			cancel.disabled = true;
			void this.apply(action).finally(() => { confirm.disabled = false; cancel.disabled = false; });
		});
	}

	private async apply(action: BulkAction): Promise<void> {
		try {
			await applyBulkAction(this.app, this.selected, action, this.all);
			new Notice(isMetadataAction(action) ? 'File YAML updated.' : 'Selected cards updated.');
			await this.onDone();
			this.close();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : 'Bulk update failed.', 10000);
			await this.onDone();
			// Refresh snapshots before retrying; partial writes must not be replayed from stale rows.
			this.close();
		}
	}

	onClose(): void { this.contentEl.empty(); }
}
