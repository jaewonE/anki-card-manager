import { EditorView, WidgetType } from '@codemirror/view';
import { Component } from 'obsidian';
import type { App } from 'obsidian';
import { renderAnkiCard } from './cardRenderer';
import type { AnkiCard } from './types';
import { registerCardRaw, serializeCard, unregisterCardRaw } from './parser';
import { CardConflictError } from './cardActions';
import { estimateCardChunkHeight } from './cardChunks';
import type { CardStackPosition } from './cardChunks';

// CodeMirror can reuse DOM while replacing an equal WidgetType instance.
// Own the Markdown lifecycle by DOM node, not by the transient widget object.
const components = new WeakMap<HTMLElement, Component>();
const reopen = new WeakMap<EditorView, number>();
const openCards = new WeakMap<EditorView, Set<string>>();

export class AnkiCardsWidget extends WidgetType {
	constructor(
		private readonly app: App,
		private readonly cards: AnkiCard[],
		private readonly collection = false,
		private readonly truncateTitles = false,
		private readonly stackPosition: CardStackPosition = 'single',
	) {
		super();
	}

	eq(other: AnkiCardsWidget): boolean {
		return this.collection === other.collection &&
			this.truncateTitles === other.truncateTitles &&
			this.stackPosition === other.stackPosition &&
			this.cards.length === other.cards.length &&
			this.cards.every((card, index) =>
				card.raw === other.cards[index]?.raw && card.key === other.cards[index]?.key,
			);
	}

	get estimatedHeight(): number {
		return estimateCardChunkHeight(this.cards.length, this.collection);
	}

	toDOM(view: EditorView): HTMLElement {
		const container = createDiv({ cls: 'anki-card-manager-editor-widget' });
		const isStack = this.collection || this.cards.length > 1 || this.stackPosition !== 'single';
		if (isStack) container.addClass('is-stack-chunk', `is-stack-${this.stackPosition}`);
		if (this.collection) {
			container.addClass('is-document-end');
			container.createDiv({
				cls: 'anki-card-manager-collection-heading',
				text: `Anki cards (${this.cards.length})`,
			});
		}
		const component = new Component();
		components.set(container, component);
		component.load();
		const target = isStack
			? container.createDiv({ cls: 'anki-card-manager-stack' }) : container;
		const rememberedOpenCards = openCards.get(view) ?? new Set<string>();
		openCards.set(view, rememberedOpenCards);
		for (const card of this.cards) {
			const mutate = (raw: string): void => {
				if (!components.has(container) || view.state.doc.sliceString(card.from, card.to) !== card.raw) throw new CardConflictError();
				reopen.set(view, card.from);
				// Use the live editor transaction: native undo/save and unsaved text stay intact.
				view.dispatch({ changes: { from: card.from, to: card.to, insert: raw }, userEvent: 'input' });
			};
			const reopenAfterMutation = reopen.get(view) === card.from;
			renderAnkiCard(this.app, target, card, component, {
				compact: this.collection,
				truncateTitle: this.truncateTitles,
				initiallyOpen: reopenAfterMutation || rememberedOpenCards.has(card.key),
				onOpenChange: (open) => {
					if (open) rememberedOpenCards.add(card.key);
					else rememberedOpenCards.delete(card.key);
				},
				onTypeChange: (type) => mutate(serializeCard(card, { ...card, cardType: type })),
				onToggleRegistration: () => mutate(card.registered ? unregisterCardRaw(card.raw, card.markers) : registerCardRaw(card.raw, card.markers)),
				onSizeChange: () => {
					if (components.has(container) && container.isConnected) view.requestMeasure();
				},
				onEdit: () => {
					view.dispatch({ selection: { anchor: card.from }, scrollIntoView: true });
					view.focus();
				},
			});
			if (reopenAfterMutation) reopen.delete(view);
		}
		return container;
	}

	destroy(dom: HTMLElement): void {
		components.get(dom)?.unload();
		components.delete(dom);
	}
}
