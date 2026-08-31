import { MarkdownView, Notice, TFile } from 'obsidian';
import type { App, Editor, MarkdownFileInfo } from 'obsidian';
import { cardSeparator } from './parser';
import { hasOwnClosingMarker } from './completion';
import { ensureAnkiFrontmatter } from './metadata';
import type { AnkiCardManagerSettings } from './types';

interface InsertOptions {
	advanceCursor: boolean;
}

export class AnkiCardAutoCompleter {
	private inserting = false;

	constructor(
		private readonly app: App,
		private readonly getSettings: () => AnkiCardManagerSettings,
		private readonly isBlocked: () => boolean = () => false,
	) {}

	async onEditorChange(editor: Editor, info: MarkdownFileInfo): Promise<void> {
		if (this.inserting || this.isBlocked() || !this.getSettings().autoCompleteCards) return;
		const markers = this.getSettings().markers;
		const cursor = editor.getCursor();
		// Also handle Enter after a start marker (the cursor is now on the next line).
		const line = editor.getLine(cursor.line).trim() === markers.registeredStart ? cursor.line :
			cursor.ch === 0 && cursor.line > 0 && editor.getLine(cursor.line - 1).trim() === markers.registeredStart
				? cursor.line - 1 : -1;
		if (line < 0) return;
		const tail = editor.getRange({ line, ch: editor.getLine(line).length },
			{ line: editor.lastLine(), ch: editor.getLine(editor.lastLine()).length });
		if (hasOwnClosingMarker(tail, markers)) return;
		this.inserting = true;
		try {
			await this.completeAtLine(editor, info, line, { advanceCursor: true });
		} finally {
			this.inserting = false;
		}
	}

	async insertAtCursor(editor: Editor, info: MarkdownFileInfo): Promise<void> {
		if (this.inserting || this.isBlocked()) return;
		this.inserting = true;
		try {
			const cursor = editor.getCursor();
			const currentLine = editor.getLine(cursor.line);
			const prefix = currentLine.slice(0, cursor.ch);
			const suffix = currentLine.slice(cursor.ch);
			const leadingNewline = prefix.length > 0 ? '\n' : '';
			const trailingNewline = suffix.length > 0 ? '\n' : '';
			editor.replaceRange(
				`${leadingNewline}${this.getSettings().markers.registeredStart}${trailingNewline}`,
				cursor,
				cursor,
			);
			const markerLine = cursor.line + (leadingNewline ? 1 : 0);
			await this.completeAtLine(editor, info, markerLine, { advanceCursor: true });
		} finally {
			this.inserting = false;
		}
	}

	private async completeAtLine(
		editor: Editor,
		info: MarkdownFileInfo,
		line: number,
		options: InsertOptions,
	): Promise<void> {
		const settings = this.getSettings();
		const newline = '\n';
		editor.replaceRange(
			`${newline}${settings.defaultCardType}${newline}${newline}${cardSeparator(settings.defaultCardType)}${newline}${newline}${settings.markers.registeredEnd}`,
			{ line, ch: editor.getLine(line).length },
		);
		if (options.advanceCursor) {
			editor.setCursor({ line: line + 2, ch: 0 });
		}

		const file = info.file;
		if (file instanceof TFile) {
			try {
				if (info instanceof MarkdownView) await info.save();
				await ensureAnkiFrontmatter(
					this.app,
					file,
					settings.defaultDeck,
					settings.defaultTag,
				);
			} catch (error) {
				console.error('Anki Card Manager: failed to update frontmatter', error);
				new Notice('Card inserted, but Anki YAML properties could not be added.');
			}
		}
	}
}
