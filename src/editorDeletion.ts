import { EditorState, Prec } from '@codemirror/state';
import type { Extension, StateEffectType, Transaction } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { parseAnkiCards } from './parser';
import type { AnkiCard } from './types';
import { DEFAULT_MARKERS } from './markers';
import type { CardMarkers } from './markers';

export function protectCardDeletion(
	getDecorations: (state: EditorState) => DecorationSet,
	focusEffect: StateEffectType<boolean>,
	getMarkers: () => CardMarkers = () => DEFAULT_MARKERS,
): Extension {
	function target(state: EditorState, backward: boolean, transaction?: Transaction, vertical = false): AnkiCard | undefined {
		if (state.selection.ranges.length !== 1 || !state.selection.main.empty) return;
		const position = state.selection.main.head;
		const cards = parseAnkiCards(state.doc.toString(), '', undefined, getMarkers());
		let result: AnkiCard | undefined;
		getDecorations(state).between(0, state.doc.length, (from, to) => {
			if (from === to) return;
			const adjacent = backward
				? position >= to && position <= to + 1 && /^\s*$/.test(state.doc.sliceString(to, position))
				: position <= from && position >= from - 1 && /^\s*$/.test(state.doc.sliceString(position, from));
			const line = state.doc.lineAt(position);
			const above = vertical && position >= to && to >= line.from - 1 && to <= line.to;
			let intersectsDeletion = false;
			transaction?.changes.iterChangedRanges((changeFrom, changeTo) => {
				if (changeFrom < to && changeTo > from) intersectsDeletion = true;
			});
			if (!adjacent && !above && !intersectsDeletion) return;
			const hidden = cards.filter((card) => card.renderFrom >= from && card.renderTo <= to);
			const candidate = backward ? hidden[hidden.length - 1] : hidden[0];
			if (candidate && (!result || (backward ? candidate.from > result.from : candidate.from < result.from))) result = candidate;
		});
		return result;
	}
	function reveal(view: EditorView, backward: boolean, vertical = false): boolean {
		const card = target(view.state, backward, undefined, vertical);
		if (!card) return false;
		if (vertical) {
			const cursor = view.coordsAtPos(view.state.selection.main.head);
			const firstRow = view.coordsAtPos(view.state.doc.lineAt(view.state.selection.main.head).from);
			if (cursor && firstRow && cursor.top > firstRow.top + 1) return false;
		}
		view.dispatch({
			selection: { anchor: backward ? view.state.doc.line(card.endLine + 1).to : card.from },
			effects: focusEffect.of(true),
			scrollIntoView: true,
		});
		view.focus();
		return true;
	}
	return [
		Prec.highest(keymap.of([
			{ key: 'ArrowUp', run: (view) => reveal(view, true, true) },
			{ key: 'Backspace', run: (view) => reveal(view, true) },
			{ key: 'Delete', run: (view) => reveal(view, false) },
		])),
		Prec.highest(EditorView.domEventHandlers({ beforeinput(event, view) {
			if (event.inputType !== 'deleteContentBackward' && event.inputType !== 'deleteContentForward') return false;
			if (!reveal(view, event.inputType === 'deleteContentBackward')) return false;
			event.preventDefault();
			return true;
		} })),
		// Also guard native/mobile deletion transactions that bypass keydown handlers.
		EditorState.transactionFilter.of((transaction) => {
			const backward = transaction.isUserEvent('delete.backward');
			if (!transaction.docChanged || (!backward && !transaction.isUserEvent('delete.forward'))) return transaction;
			const card = target(transaction.startState, backward, transaction);
			if (!card) return transaction;
			return {
				selection: { anchor: backward ? transaction.startState.doc.line(card.endLine + 1).to : card.from },
				effects: focusEffect.of(true),
				scrollIntoView: true,
			};
		}),
	];
}
