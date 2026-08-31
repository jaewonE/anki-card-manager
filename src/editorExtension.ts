import {
	EditorState,
	StateEffect,
	StateField,
} from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import {
	Decoration,
	EditorView,
	ViewPlugin,
} from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import type { App } from 'obsidian';
import { AnkiCardsWidget } from './editorWidgets';
import { parseAnkiCards } from './parser';
import { groupAdjacentCards } from './cardGrouping';
import { protectCardDeletion } from './editorDeletion';
import type { AnkiCard, CardPlacement } from './types';
import { DEFAULT_MARKERS, sameMarkers } from './markers';
import type { CardMarkers } from './markers';

interface AnkiDecorationState {
	decorations: DecorationSet;
	editorFocused: boolean;
	placement: CardPlacement;
	truncateTitles: boolean;
	markers: CardMarkers;
	blocked: boolean;
}

function selectionTouchesCard(state: EditorState, card: AnkiCard): boolean {
	return state.selection.ranges.some((range) =>
		range.empty
			? range.from >= card.renderFrom && (range.from < card.renderTo || range.from === state.doc.length && range.from === card.renderTo)
			: range.from < card.renderTo && range.to > card.renderFrom,
	);
}

function buildDecorations(
	state: EditorState,
	app: App,
	placement: CardPlacement,
	renderFocusedCard: boolean,
	truncateTitles: boolean,
	markers: CardMarkers,
): DecorationSet {
	const sourcePath = state.field(editorInfoField, false)?.file?.path ?? '';
	const cards = parseAnkiCards(state.doc.toString(), sourcePath, undefined, markers);
	const ranges = [];

	const visibleCards = cards.filter((card) => renderFocusedCard || !selectionTouchesCard(state, card));
	const groups = placement === 'inline'
		? groupAdjacentCards(state.doc.toString(), visibleCards) : visibleCards.map((card) => [card]);
	for (const group of groups) {
		const first = group[0];
		const last = group[group.length - 1];
		if (!first || !last) continue;
		const decoration =
			placement === 'inline'
				? Decoration.replace({
						widget: new AnkiCardsWidget(app, group, false, truncateTitles),
						block: true,
						inclusive: false,
					})
				: Decoration.replace({ inclusive: false });
		ranges.push(decoration.range(first.renderFrom, last.renderTo));
	}

	if (placement === 'document-end' && cards.length > 0) {
		ranges.push(
			Decoration.widget({
				widget: new AnkiCardsWidget(app, cards, true, truncateTitles),
				block: true,
				side: 1,
			}).range(state.doc.length),
		);
	}

	return Decoration.set(ranges, true);
}

function safeBuildDecorations(
	state: EditorState,
	app: App,
	placement: CardPlacement,
	renderFocusedCard: boolean,
	truncateTitles: boolean,
	markers: CardMarkers,
): DecorationSet {
	try {
		return buildDecorations(state, app, placement, renderFocusedCard, truncateTitles, markers);
	} catch (error) {
		console.error('Anki Card Manager: card rendering was disabled for this editor', error);
		return Decoration.none;
	}
}

function eventTargetsWidget(target: EventTarget | null): boolean {
	const element = target as Element | null;
	return (
		typeof element?.closest === 'function' &&
		element.closest('.anki-card-manager-editor-widget') !== null
	);
}

export function createAnkiCardEditorExtension(
	app: App,
	getPlacement: () => CardPlacement,
	getTruncateTitles: () => boolean = () => false,
	getMarkers: () => CardMarkers = () => DEFAULT_MARKERS,
	isBlocked: () => boolean = () => false,
): Extension {
	const focusEffect = StateEffect.define<boolean>();
	const decorationField = StateField.define<AnkiDecorationState>({
		create(state) {
			const placement = getPlacement();
			const truncateTitles = getTruncateTitles();
			const markers = { ...getMarkers() };
			const blocked = isBlocked();
			return {
				decorations: blocked ? Decoration.none : safeBuildDecorations(state, app, placement, false, truncateTitles, markers),
				editorFocused: true,
				placement,
				truncateTitles,
				markers, blocked,
			};
		},
		update(value, transaction) {
			let editorFocused = value.editorFocused;
			for (const effect of transaction.effects) {
				if (effect.is(focusEffect)) editorFocused = effect.value;
			}
			const placement = getPlacement();
			const truncateTitles = getTruncateTitles();
			const markers = { ...getMarkers() };
			const blocked = isBlocked();
			const selectionChanged = !transaction.startState.selection.eq(
				transaction.state.selection,
			);
			if (
				!transaction.docChanged &&
				!selectionChanged &&
				editorFocused === value.editorFocused &&
				placement === value.placement && truncateTitles === value.truncateTitles &&
				blocked === value.blocked && sameMarkers(markers, value.markers)
			) {
				return value;
			}
			return {
				decorations: blocked ? Decoration.none : safeBuildDecorations(
					transaction.state,
					app,
					placement,
					!editorFocused,
					truncateTitles,
					markers,
				),
				editorFocused,
				placement,
				truncateTitles,
				markers, blocked,
			};
		},
		provide(field) {
			return [
				// Block and multiline replacements must be available before layout.
				// A ViewPlugin decorations callback runs after viewport computation.
				EditorView.decorations.from(field, (value) => value.decorations),
				EditorView.atomicRanges.of(
					(view) => view.state.field(field).decorations,
				),
			];
		},
	});

	function setEditorFocused(view: EditorView, focused: boolean): void {
		const current = view.state.field(decorationField, false);
		if (!current || current.editorFocused === focused) return;
		view.dispatch({ effects: focusEffect.of(focused) });
	}

	const focusWatcher = ViewPlugin.fromClass(class {
		private destroyed = false;
		private scheduled = false;

		constructor(private readonly view: EditorView) {
			view.dom.addEventListener('focusin', this.scheduleFocusUpdate);
			view.dom.addEventListener('focusout', this.scheduleFocusUpdate);
			this.scheduleFocusUpdate();
		}

		private readonly scheduleFocusUpdate = (): void => {
			if (this.scheduled) return;
			this.scheduled = true;
			// Removing a focused widget can fire blur during an editor update.
			// Defer and coalesce focus events to avoid reentrant dispatches.
			queueMicrotask(() => {
				this.scheduled = false;
				if (this.destroyed) return;
				setEditorFocused(this.view,
					this.view.hasFocus &&
					!eventTargetsWidget(this.view.dom.ownerDocument.activeElement),
				);
			});
		};

		destroy(): void {
			this.destroyed = true;
			this.view.dom.removeEventListener('focusin', this.scheduleFocusUpdate);
			this.view.dom.removeEventListener('focusout', this.scheduleFocusUpdate);
		}
	});

	return [decorationField, focusWatcher,
		protectCardDeletion((state) => state.field(decorationField).decorations, focusEffect, getPlacement, getMarkers)];
}
