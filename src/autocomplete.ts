import { MarkdownView, Notice, TFile } from 'obsidian';
import type { App, Editor, MarkdownFileInfo } from 'obsidian';
import { REGISTERED_END, REGISTERED_START } from './parser';
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
	) {}

	async onEditorChange(editor: Editor, info: MarkdownFileInfo): Promise<void> {
		if (this.inserting || !this.getSettings().autoCompleteCards) return;
		const cursor = editor.getCursor();
		if (editor.getLine(cursor.line).trim() !== REGISTERED_START) return;
		if (
			cursor.line + 1 < editor.lineCount() &&
			editor.getLine(cursor.line + 1).trim() ===
				this.getSettings().defaultCardType
		) {
			return;
		}
		this.inserting = true;
		try {
			await this.completeAtLine(editor, info, cursor.line, { advanceCursor: true });
		} finally {
			this.inserting = false;
		}
	}

	async insertAtCursor(editor: Editor, info: MarkdownFileInfo): Promise<void> {
		if (this.inserting) return;
		this.inserting = true;
		try {
			const cursor = editor.getCursor();
			const currentLine = editor.getLine(cursor.line);
			const prefix = currentLine.slice(0, cursor.ch);
			const suffix = currentLine.slice(cursor.ch);
			const leadingNewline = prefix.length > 0 ? '\n' : '';
			const trailingNewline = suffix.length > 0 ? '\n' : '';
			editor.replaceRange(
				`${leadingNewline}${REGISTERED_START}${trailingNewline}`,
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
			`${newline}${settings.defaultCardType}${newline}${newline}Back:${newline}${newline}${REGISTERED_END}`,
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
