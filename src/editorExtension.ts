import { RangeSetBuilder } from '@codemirror/state';
import {
	Decoration,
	EditorView,
	ViewPlugin,
	WidgetType,
} from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { Component, editorInfoField } from 'obsidian';
import type { App } from 'obsidian';
import { renderAnkiCard } from './cardRenderer';
import { parseAnkiCards } from './parser';
import type { AnkiCard, CardPlacement } from './types';

class AnkiCardWidget extends WidgetType {
	private component?: Component;

	constructor(
		private readonly app: App,
		private readonly card: AnkiCard,
	) {
		super();
	}

	eq(other: AnkiCardWidget): boolean {
		return this.card.raw === other.card.raw && this.card.key === other.card.key;
	}

	toDOM(): HTMLElement {
		const container = createDiv({ cls: 'anki-card-manager-editor-widget' });
		this.component = new Component();
		this.component.load();
		renderAnkiCard(this.app, container, this.card, this.component);
		return container;
	}

	destroy(): void {
		this.component?.unload();
		this.component = undefined;
	}
}

class AnkiCardCollectionWidget extends WidgetType {
	private component?: Component;

	constructor(
		private readonly app: App,
		private readonly cards: AnkiCard[],
	) {
		super();
	}

	eq(other: AnkiCardCollectionWidget): boolean {
		return (
			this.cards.length === other.cards.length &&
			this.cards.every((card, index) => card.raw === other.cards[index]?.raw)
		);
	}

	toDOM(): HTMLElement {
		const container = createDiv({
			cls: ['anki-card-manager-editor-widget', 'is-document-end'],
		});
		container.createDiv({
			cls: 'anki-card-manager-collection-heading',
			text: `Anki cards (${this.cards.length})`,
		});
		this.component = new Component();
		this.component.load();
		for (const card of this.cards) {
			renderAnkiCard(this.app, container, card, this.component, { compact: true });
		}
		return container;
	}

	destroy(): void {
		this.component?.unload();
		this.component = undefined;
	}
}

function selectionTouchesCard(view: EditorView, card: AnkiCard): boolean {
	return view.state.selection.ranges.some((range) =>
		range.empty
			? range.from >= card.renderFrom && range.from < card.renderTo
			: range.from < card.renderTo && range.to > card.renderFrom,
	);
}

function buildDecorations(
	view: EditorView,
	app: App,
	placement: CardPlacement,
): DecorationSet {
	const sourcePath = view.state.field(editorInfoField).file?.path ?? '';
	const cards = parseAnkiCards(view.state.doc.toString(), sourcePath);
	const builder = new RangeSetBuilder<Decoration>();
	const focusedCards = new Set(
		cards.filter((card) => selectionTouchesCard(view, card)).map((card) => card.key),
	);

	for (const card of cards) {
		if (focusedCards.has(card.key)) continue;
		const decoration =
			placement === 'inline'
				? Decoration.replace({
						widget: new AnkiCardWidget(app, card),
						block: true,
					})
				: Decoration.replace({});
		builder.add(card.renderFrom, card.renderTo, decoration);
	}

	if (placement === 'document-end' && cards.length > 0) {
		builder.add(
			view.state.doc.length,
			view.state.doc.length,
			Decoration.widget({
				widget: new AnkiCardCollectionWidget(app, cards),
				block: true,
				side: 1,
			}),
		);
	}

	return builder.finish();
}

export function createAnkiCardEditorExtension(
	app: App,
	getPlacement: () => CardPlacement,
) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, app, getPlacement());
			}

			update(update: ViewUpdate): void {
				if (update.docChanged || update.selectionSet) {
					this.decorations = buildDecorations(
						update.view,
						app,
						getPlacement(),
					);
				}
			}
		},
		{
			decorations: (value) => value.decorations,
		},
	);
}
