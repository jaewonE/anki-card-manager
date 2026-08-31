import { MarkdownView, Notice, TFile } from 'obsidian';
import type { App } from 'obsidian';
import type { AnkiCard } from './types';

/** Shared by reading cards, table source links and the edit dialog. */
export async function openCardSource(app: App, card: AnkiCard): Promise<boolean> {
	try {
		const file = app.vault.getAbstractFileByPath(card.sourcePath);
		if (!(file instanceof TFile)) throw new Error('Source file no longer exists.');
		const leaf = app.workspace.getLeaf('tab');
		await leaf.openFile(file, { eState: { line: card.startLine } });
		await leaf.setViewState({ type: 'markdown', state: { file: file.path, mode: 'source' }, active: true });
		if (leaf.view instanceof MarkdownView) {
			leaf.view.editor.setCursor({ line: card.startLine, ch: 0 });
			leaf.view.editor.scrollIntoView({ from: { line: card.startLine, ch: 0 }, to: { line: card.endLine, ch: 0 } }, true);
			leaf.view.editor.focus();
		}
		return true;
	} catch (error) {
		new Notice(error instanceof Error ? error.message : 'Could not open source file.');
		return false;
	}
}
