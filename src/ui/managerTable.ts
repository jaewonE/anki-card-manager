import { setIcon } from 'obsidian';
import { cardPreview } from '../parser';
import type { AnkiCard } from '../types';

export function iconButton(container: HTMLElement, icon: string, label: string, onClick: () => void,
	warning = false): HTMLButtonElement {
	const button = container.createEl('button', {
		cls: warning ? ['clickable-icon', 'is-warning'] : 'clickable-icon',
		attr: { 'aria-label': label, title: label, type: 'button' },
	});
	setIcon(button, icon);
	button.addEventListener('click', onClick);
	return button;
}

export interface TableActions {
	select: (container: HTMLElement, cards: AnkiCard[], label: string) => void;
	open: (card: AnkiCard) => void;
	edit: (card: AnkiCard) => void;
	toggle: (card: AnkiCard) => void;
	delete: (card: AnkiCard) => void;
}

export function renderTable(container: HTMLElement, cards: AnkiCard[], actions: TableActions): void {
	const wrapper = container.createDiv({ cls: 'anki-card-manager-table-wrapper' });
	const table = wrapper.createEl('table', { cls: 'anki-card-manager-table' });
	const header = table.createEl('thead').createEl('tr');
	actions.select(header.createEl('th'), cards, 'Select all cards in table');
	for (const label of ['Question', 'Answer', 'Type', 'Deck', 'Tags', 'Source', 'Status', 'Actions']) header.createEl('th', { text: label });
	const body = table.createEl('tbody');
	for (const card of cards) {
		const row = body.createEl('tr');
		row.dataset.cardKey = card.key;
		actions.select(row.createEl('td', { attr: { 'data-label': 'Select' } }), [card], `Select card: ${cardPreview(card.front, 60)}`);
		for (const [label, text] of [
			['Question', cardPreview(card.front) || 'Empty question'], ['Answer', cardPreview(card.back) || 'Empty answer'],
			['Type', card.cardType], ['Deck', card.deck || 'No deck'], ['Tags', card.tags.join(', ') || 'Untagged'],
		]) row.createEl('td', { text, attr: { 'data-label': label! } });
		const source = row.createEl('td', { attr: { 'data-label': 'Source' } }).createEl('button', {
			cls: 'anki-card-manager-source-link', text: `${card.sourcePath}:${card.startLine + 1}`,
		});
		source.addEventListener('click', () => actions.open(card));
		const status = row.createEl('td', { attr: { 'data-label': 'Status' } });
		status.createSpan({ cls: ['anki-card-manager-status', card.registered ? 'is-on' : 'is-off'], text: card.registered ? 'Registered' : 'Unregistered' });
		if (!card.metadataReady) status.createDiv({ cls: 'anki-card-manager-metadata-warning', text: 'YAML missing or invalid' });
		const cell = row.createEl('td', { cls: 'anki-card-manager-row-actions', attr: { 'data-label': 'Actions' } });
		iconButton(cell, 'pencil', 'Edit card', () => actions.edit(card));
		iconButton(cell, card.registered ? 'circle-pause' : 'circle-play', card.registered ? 'Unregister card' : 'Register card', () => actions.toggle(card));
		iconButton(cell, 'trash-2', 'Delete card', () => actions.delete(card), true);
	}
}
