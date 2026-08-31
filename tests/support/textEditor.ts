import type { Editor, EditorPosition } from 'obsidian';

export function textEditor(initial: string, initialCursor: EditorPosition) {
	let value = initial;
	let cursor = initialCursor;
	const offset = (position: EditorPosition): number => {
		const lines = value.split('\n');
		return lines.slice(0, position.line).reduce((total, line) => total + line.length + 1, 0) + position.ch;
	};
	const editor = {
		getCursor: () => cursor,
		setCursor: (position: EditorPosition) => { cursor = position; },
		getLine: (line: number) => value.split('\n')[line] ?? '',
		lastLine: () => value.split('\n').length - 1,
		lineCount: () => value.split('\n').length,
		getRange: (from: EditorPosition, to: EditorPosition) => value.slice(offset(from), offset(to)),
		replaceRange: (replacement: string, from: EditorPosition, to = from) => {
			value = value.slice(0, offset(from)) + replacement + value.slice(offset(to));
		},
	} as Editor;
	return { editor, text: () => value };
}
