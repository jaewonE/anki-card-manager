import { cardPreview } from '../parser';
import type { AnkiCard } from '../types';

export interface TableActions {
	select: (container: HTMLElement, cards: AnkiCard[], label: string) => void;
	open: (card: AnkiCard) => void;
	edit: (card: AnkiCard) => void;
}

let nextTableLabel = 0;

export function renderTable(container: HTMLElement, cards: AnkiCard[], actions: TableActions): void {
	const labelId = `anki-card-manager-table-label-${++nextTableLabel}`;
	const wrapper = container.createDiv({ cls: 'anki-card-manager-table-wrapper',
		attr: { role: 'region', 'aria-labelledby': labelId, tabindex: '0' } });
	// Obsidian treats aria-label as a tooltip. A referenced label keeps the accessible name without one.
	wrapper.createSpan({ text: 'Anki cards table', attr: { id: labelId, hidden: '' } });
	const table = wrapper.createEl('table', { cls: 'anki-card-manager-table' });
	const header = table.createEl('thead').createEl('tr');
	actions.select(header.createEl('th'), cards, 'Select all cards in table');
	for (const label of ['Question', 'Answer', 'Type', 'Deck', 'Tags', 'Source', 'Status']) header.createEl('th', { text: label });
	const body = table.createEl('tbody');
	for (const card of cards) {
		const row = body.createEl('tr');
		row.dataset.cardKey = card.key;
		actions.select(row.createEl('td', { attr: { 'data-label': 'Select' } }), [card], `Select card: ${cardPreview(card.front, 60)}`);
		const question = row.createEl('td', { attr: { 'data-label': 'Question' } }).createEl('button', {
			cls: 'anki-card-manager-question-link', text: cardPreview(card.front) || 'Empty question',
			attr: { type: 'button', 'aria-label': `Edit card: ${cardPreview(card.front, 60)}`, title: 'Edit card' },
		});
		question.addEventListener('click', () => actions.edit(card));
		for (const [label, text] of [
			['Answer', cardPreview(card.back) || 'Empty answer'],
			['Type', card.cardType], ['Deck', card.deck || 'No deck'], ['Tags', card.tags.join(', ') || 'Untagged'],
		]) row.createEl('td', { text, attr: { 'data-label': label! } });
		const source = row.createEl('td', { attr: { 'data-label': 'Source' } }).createEl('button', {
			cls: 'anki-card-manager-source-link', text: `${card.sourcePath}:${card.startLine + 1}`,
		});
		source.addEventListener('click', () => actions.open(card));
		const status = row.createEl('td', { attr: { 'data-label': 'Status' } });
		status.createSpan({ cls: ['anki-card-manager-status', card.registered ? 'is-on' : 'is-off'], text: card.registered ? 'Registered' : 'Unregistered' });
		if (!card.metadataReady) status.createDiv({ cls: 'anki-card-manager-metadata-warning', text: 'YAML missing or invalid' });
	}
}
