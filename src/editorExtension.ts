import {
	EditorState,
	StateEffect,
	StateField,
} from '@codemirror/state';
import type { Extension, Text } from '@codemirror/state';
import {
	Decoration,
	EditorView,
	ViewPlugin,
} from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { editorInfoField, editorLivePreviewField } from 'obsidian';
import type { App } from 'obsidian';
import { AnkiCardsWidget } from './editorWidgets';
import { parseAnkiCards } from './parser';
import { chunkAdjacentCards } from './cardChunks';
import { protectCardDeletion } from './editorDeletion';
import type { AnkiCard, CardPlacement } from './types';
import { DEFAULT_MARKERS, sameMarkers } from './markers';
import type { CardMarkers } from './markers';

interface AnkiDecorationState {
	decorations: DecorationSet;
	parsed?: ParsedEditorCards;
	editorFocused: boolean;
	placement: CardPlacement;
	truncateTitles: boolean;
	markers: CardMarkers;
	blocked: boolean;
	livePreview: boolean;
}

interface ParsedEditorCards {
	doc: Text;
	source: string;
	sourcePath: string;
	cards: AnkiCard[];
}

type ParseCards = typeof parseAnkiCards;

function parseEditorCards(state: EditorState, markers: CardMarkers, parseCards: ParseCards): ParsedEditorCards {
	const source = state.doc.toString();
	const sourcePath = state.field(editorInfoField, false)?.file?.path ?? '';
	return {
		doc: state.doc,
		source,
		sourcePath,
		cards: parseCards(source, sourcePath, undefined, markers),
	};
}

function safeParseEditorCards(state: EditorState, markers: CardMarkers, parseCards: ParseCards): ParsedEditorCards | undefined {
	try {
		return parseEditorCards(state, markers, parseCards);
	} catch (error) {
		console.error('Anki Card Manager: card parsing was disabled for this editor', error);
		return undefined;
	}
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
	parsed: ParsedEditorCards,
	renderFocusedCard: boolean,
	truncateTitles: boolean,
): DecorationSet {
	const ranges = [];

	const visibleCards = parsed.cards.filter((card) => renderFocusedCard || !selectionTouchesCard(state, card));
	// Collection is a confirmed source migration, never a virtual footer. Large
	// semantic stacks are partitioned so CodeMirror can mount only nearby chunks.
	for (const chunk of chunkAdjacentCards(parsed.source, visibleCards)) {
		const decoration = Decoration.replace({
			widget: new AnkiCardsWidget(app, chunk.cards, false, truncateTitles, chunk.stackPosition),
			block: true,
			inclusive: false,
		});
		ranges.push(decoration.range(chunk.from, chunk.to));
	}

	return Decoration.set(ranges, true);
}

function safeBuildDecorations(
	state: EditorState,
	app: App,
	parsed: ParsedEditorCards | undefined,
	renderFocusedCard: boolean,
	truncateTitles: boolean,
): DecorationSet {
	if (!parsed) return Decoration.none;
	try {
		return buildDecorations(state, app, parsed, renderFocusedCard, truncateTitles);
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
	parseCards: ParseCards = parseAnkiCards,
): Extension {
	const focusEffect = StateEffect.define<boolean>();
	const decorationField = StateField.define<AnkiDecorationState>({
		create(state) {
			const placement = getPlacement();
			const truncateTitles = getTruncateTitles();
			const markers = { ...getMarkers() };
			const blocked = isBlocked();
			const livePreview = state.field(editorLivePreviewField, false) !== false;
			const parsed = blocked || !livePreview ? undefined : safeParseEditorCards(state, markers, parseCards);
			return {
				decorations: blocked || !livePreview ? Decoration.none : safeBuildDecorations(state, app, parsed, false, truncateTitles),
				parsed,
				editorFocused: true,
				placement,
				truncateTitles,
				markers, blocked, livePreview,
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
			const livePreview = transaction.state.field(editorLivePreviewField, false) !== false;
			const sourcePath = transaction.state.field(editorInfoField, false)?.file?.path ?? '';
			const markersChanged = !sameMarkers(markers, value.markers);
			const sourcePathChanged = value.parsed !== undefined && value.parsed.sourcePath !== sourcePath;
			const selectionChanged = !transaction.startState.selection.eq(
				transaction.state.selection,
			);
			if (
				!transaction.docChanged &&
				!selectionChanged &&
				editorFocused === value.editorFocused &&
				placement === value.placement && truncateTitles === value.truncateTitles &&
				blocked === value.blocked && livePreview === value.livePreview && !markersChanged && !sourcePathChanged
			) {
				return value;
			}
			const canReuseParsed = value.parsed !== undefined &&
				value.parsed.doc === transaction.state.doc &&
				value.parsed.sourcePath === sourcePath &&
				!markersChanged;
			const parsed = blocked || !livePreview
				? value.parsed
				: canReuseParsed ? value.parsed : safeParseEditorCards(transaction.state, markers, parseCards);
			return {
				decorations: blocked || !livePreview ? Decoration.none : safeBuildDecorations(
					transaction.state,
					app,
					parsed,
					!editorFocused,
					truncateTitles,
				),
				parsed,
				editorFocused,
				placement,
				truncateTitles,
				markers, blocked, livePreview,
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
		protectCardDeletion((state) => state.field(decorationField).decorations, focusEffect, getMarkers)];
}
