import { Modal, Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { ManagerCardSource } from '../cardIndex';

export class IndexRebuildModal extends Modal {
	private unsubscribe?: () => void;
	private progress!: HTMLProgressElement;
	private status!: HTMLElement;
	private cancel!: HTMLButtonElement;
	private confirm!: HTMLButtonElement;
	private started = false;
	private completed = false;
	private failed = false;
	private failureMessage = '';

	constructor(app: App, private readonly source: ManagerCardSource) { super(app); }

	onOpen(): void {
		this.titleEl.setText('Rebuild the complete card index?');
		this.modalEl.addClass('anki-card-manager-modal');
		this.modalEl.addClass('anki-card-manager-index-modal');
		this.contentEl.createEl('p', {
			text: 'This clears the saved manager index and reparses every Markdown file in the vault. It can take time in a large vault.',
		});
		this.contentEl.createEl('p', {
			text: 'Source Markdown and Anki are not changed. Automatic vault updates remain incremental after the rebuild.',
		});
		const progressArea = this.contentEl.createDiv({ cls: 'anki-card-manager-index-progress' });
		this.progress = progressArea.createEl('progress', {
			attr: { max: '1', value: '0', 'aria-label': 'Card index rebuild progress' },
		});
		this.progress.hidden = true;
		this.status = progressArea.createDiv({ attr: { role: 'status', 'aria-live': 'polite' } });
		const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
		this.cancel = actions.createEl('button', { text: 'Cancel' });
		this.cancel.addEventListener('click', () => this.close());
		this.confirm = actions.createEl('button', { text: 'Rebuild all Markdown files', cls: 'mod-warning' });
		this.confirm.addEventListener('click', () => {
			if (this.completed) this.close();
			else void this.start();
		});
		this.unsubscribe = this.source.subscribe(() => this.renderProgress());
		this.renderProgress();
	}

	onClose(): void {
		this.unsubscribe?.();
		this.unsubscribe = undefined;
		this.contentEl.empty();
	}

	private async start(): Promise<void> {
		if (this.started && !this.failed) return;
		this.started = true;
		this.completed = this.failed = false;
		this.failureMessage = '';
		this.status.classList.remove('is-error', 'is-success');
		this.confirm.classList.remove('mod-cta');
		this.confirm.classList.add('mod-warning');
		this.confirm.setText('Rebuild all Markdown files');
		this.confirm.hidden = false;
		this.cancel.hidden = false;
		this.confirm.disabled = true;
		this.cancel.disabled = true;
		this.progress.hidden = false;
		this.status.setText('Preparing the complete card index rebuild…');
		try {
			await this.source.rebuild();
			this.completed = true;
			new Notice(`Anki card index rebuilt: ${this.source.snapshot().cards.length} cards.`);
		} catch (error) {
			this.failed = true;
			this.failureMessage = error instanceof Error ? error.message : 'Could not rebuild the Anki card index.';
			console.error('Anki Card Manager: index rebuild failed', error);
			new Notice(`Rebuild failed. The previous card index was restored. ${this.failureMessage}`, 10000);
		}
		this.renderProgress();
	}

	private renderProgress(): void {
		const snapshot = this.source.snapshot();
		if (!this.started) {
			this.confirm.disabled = snapshot.syncing;
			this.status.setText(snapshot.syncing ? 'Wait for the current incremental index update to finish.' : 'Ready to rebuild every Markdown file.');
			return;
		}
		const { completed, total } = snapshot.progress;
		this.progress.max = Math.max(1, total);
		this.progress.value = total === 0 && this.completed ? 1 : completed;
		if (this.failed) {
			this.status.classList.add('is-error');
			this.status.classList.remove('is-success');
			this.status.setText(`Rebuild failed. The previous card index was restored. ${this.failureMessage}`);
			this.confirm.setText('Try again');
			this.confirm.classList.remove('mod-cta');
			this.confirm.classList.add('mod-warning');
			this.confirm.disabled = false;
			this.cancel.setText('Close');
			this.cancel.hidden = false;
			this.cancel.disabled = false;
		} else if (this.completed) {
			this.status.classList.remove('is-error');
			this.status.classList.add('is-success');
			this.status.setText(`Complete · ${completed} of ${total} Markdown files · ${snapshot.cards.length} cards indexed`);
			this.confirm.setText('Done');
			this.confirm.classList.remove('mod-warning');
			this.confirm.classList.add('mod-cta');
			this.confirm.hidden = false;
			this.confirm.disabled = false;
			this.cancel.hidden = true;
		} else if (snapshot.syncing) {
			this.status.setText(`Reindexing · ${completed} of ${total} Markdown files`);
		}
	}
}
