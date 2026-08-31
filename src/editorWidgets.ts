import { EditorView, WidgetType } from '@codemirror/view';
import { Component } from 'obsidian';
import type { App } from 'obsidian';
import { renderAnkiCard } from './cardRenderer';
import type { AnkiCard } from './types';

// CodeMirror can reuse DOM while replacing an equal WidgetType instance.
// Own the Markdown lifecycle by DOM node, not by the transient widget object.
const components = new WeakMap<HTMLElement, Component>();

export class AnkiCardsWidget extends WidgetType {
	constructor(
		private readonly app: App,
		private readonly cards: AnkiCard[],
		private readonly collection = false,
		private readonly truncateTitles = false,
	) {
		super();
	}

	eq(other: AnkiCardsWidget): boolean {
		return this.collection === other.collection &&
			this.truncateTitles === other.truncateTitles &&
			this.cards.length === other.cards.length &&
			this.cards.every((card, index) =>
				card.raw === other.cards[index]?.raw && card.key === other.cards[index]?.key,
			);
	}

	toDOM(view: EditorView): HTMLElement {
		const container = createDiv({ cls: 'anki-card-manager-editor-widget' });
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
		const target = this.collection || this.cards.length > 1
			? container.createDiv({ cls: 'anki-card-manager-stack' }) : container;
		for (const card of this.cards) {
			renderAnkiCard(this.app, target, card, component, {
				compact: this.collection,
				truncateTitle: this.truncateTitles,
				onSizeChange: () => {
					if (components.has(container) && container.isConnected) view.requestMeasure();
				},
				onEdit: () => {
					view.dispatch({ selection: { anchor: card.from }, scrollIntoView: true });
					view.focus();
				},
			});
		}
		return container;
	}

	destroy(dom: HTMLElement): void {
		components.get(dom)?.unload();
		components.delete(dom);
	}
}
