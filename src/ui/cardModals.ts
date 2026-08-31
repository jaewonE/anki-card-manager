import { ButtonComponent, Modal, Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import { deleteCard, updateCard } from '../cardActions';
import { cardPreview } from '../parser';
import type { AnkiCard, CardEdit } from '../types';
import { CARD_TYPES } from '../cardTypes';
import { openCardSource } from '../sourceNavigation';

export class EditCardModal extends Modal {
	private edit: CardEdit;

	constructor(
		app: App,
		private readonly card: AnkiCard,
		private readonly onSaved: () => Promise<void>,
	) {
		super(app);
		this.edit = {
			cardType: CARD_TYPES.some((type) => type.name === card.cardType) ? card.cardType : 'Obsidian-Basic',
			front: card.front,
			back: card.back,
		};
	}

	onOpen(): void {
		this.titleEl.setText('Edit Anki card');
		this.modalEl.addClass('anki-card-manager-modal');
		new Setting(this.contentEl)
			.setName('Card type')
			.setDesc('Converting a cloze card to a basic card unwraps blanks when saved, using the same conversion as individual cards.')
			.addDropdown((dropdown) => {
				for (const type of CARD_TYPES) dropdown.addOption(type.name, type.name);
				dropdown.setValue(this.edit.cardType).onChange((value) => {
					this.edit.cardType = value;
				});
			});

		this.createTextarea('Question', this.edit.front, (value) => {
			this.edit.front = value;
		});
		this.createTextarea('Answer / cloze text', this.edit.back, (value) => {
			this.edit.back = value;
		});

		const source = this.contentEl.createEl('button', {
			cls: 'anki-card-manager-modal-source',
			text: `${this.card.sourcePath}:${this.card.startLine + 1}`,
			attr: { type: 'button', 'aria-label': 'Open card source file' },
		});
		source.setAttr('title', 'Open source file (unsaved dialog edits are discarded)');
		source.addEventListener('click', () => { void openCardSource(this.app, this.card).then((opened) => { if (opened) this.close(); }); });

		const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
		new ButtonComponent(actions).setButtonText('Cancel').onClick(() => this.close());
		new ButtonComponent(actions)
			.setButtonText('Save changes')
			.setCta()
			.onClick(() => void this.save());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private createTextarea(
		label: string,
		value: string,
		onChange: (value: string) => void,
	): void {
		const field = this.contentEl.createDiv({ cls: 'anki-card-manager-modal-field' });
		field.createEl('label', { text: label });
		const textarea = field.createEl('textarea', {
			cls: 'anki-card-manager-modal-textarea',
			attr: { 'aria-label': label },
		});
		textarea.value = value;
		textarea.addEventListener('input', () => onChange(textarea.value));
	}

	private async save(): Promise<void> {
		if (this.edit.cardType.trim() === '') {
			new Notice('Card type cannot be empty.');
			return;
		}
		try {
			await updateCard(this.app, this.card, this.edit);
			await this.onSaved();
			new Notice('Anki card updated.');
			this.close();
		} catch (error) {
			console.error('Anki Card Manager: update failed', error);
			new Notice(error instanceof Error ? error.message : 'Could not update the card.');
		}
	}
}

export class DeleteCardModal extends Modal {
	constructor(
		app: App,
		private readonly card: AnkiCard,
		private readonly onDeleted: () => Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText('Delete Anki card?');
		this.contentEl.createEl('p', {
			text: 'This removes the card block directly from the source Markdown file.',
		});
		this.contentEl.createEl('blockquote', {
			text: cardPreview(this.card.front) || 'Empty question',
		});
		this.contentEl.createDiv({
			cls: 'anki-card-manager-modal-source',
			text: `${this.card.sourcePath}:${this.card.startLine + 1}`,
		});

		const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
		new ButtonComponent(actions).setButtonText('Cancel').onClick(() => this.close());
		new ButtonComponent(actions)
			.setButtonText('Delete')
			.setWarning()
			.onClick(() => void this.remove());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async remove(): Promise<void> {
		try {
			await deleteCard(this.app, this.card);
			await this.onDeleted();
			new Notice('Anki card deleted.');
			this.close();
		} catch (error) {
			console.error('Anki Card Manager: delete failed', error);
			new Notice(error instanceof Error ? error.message : 'Could not delete the card.');
		}
	}
}
