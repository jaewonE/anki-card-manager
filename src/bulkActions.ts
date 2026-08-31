import { MarkdownView, stringifyYaml, TFile } from 'obsidian';
import type { App } from 'obsidian';
import { CardConflictError } from './cardActions';
import { cardMetadataFromSource, frontmatterRange, sourceFrontmatter } from './metadata';
import { uniqueCards } from './managerModel';
import { parseAnkiCards, registerCardRaw, unregisterCardRaw } from './parser';
import type { AnkiCard } from './types';

export type BulkAction =
	| { kind: 'register' | 'unregister' | 'delete' }
	| { kind: 'deck'; deck: string }
	| { kind: 'tags'; tags: string[]; mode: 'replace' | 'add' | 'remove' };

export function isMetadataAction(action: BulkAction): boolean {
	return action.kind === 'deck' || action.kind === 'tags';
}

export function affectedCards(selected: readonly AnkiCard[], all: readonly AnkiCard[], metadata: boolean): AnkiCard[] {
	const paths = new Set(selected.map((card) => card.sourcePath));
	return uniqueCards(metadata ? all.filter((card) => paths.has(card.sourcePath)) : selected);
}

export function validateBulkAction(action: BulkAction): void {
	if (action.kind === 'deck' && (!action.deck.trim() || /[\r\n]/.test(action.deck) ||
		action.deck.split('::').some((part) => !part.trim()))) {
		throw new Error('Enter one deck name, using :: between non-empty hierarchy levels.');
	}
	if (action.kind === 'tags' && action.tags.some((tag) => !tag.trim() || /[\r\n]/.test(tag))) {
		throw new Error('Enter non-empty tags, one per line.');
	}
}

/** Resolve all targets before changing offsets; duplicates in tag groups are written once. */
export function transformBulkSource(source: string, selected: readonly AnkiCard[], action: BulkAction,
	fileSnapshot: readonly AnkiCard[]): string {
	validateBulkAction(action);
	const targets = uniqueCards(selected);
	if (!targets.length) return source;
	const current = parseAnkiCards(source, targets[0]!.sourcePath, cardMetadataFromSource(source), targets[0]!.markers);
	// Reject changed card inventories, including identical cards removed or added after selection.
	if (current.length !== fileSnapshot.length || current.some((card, index) => card.raw !== fileSnapshot[index]?.raw)) {
		throw new CardConflictError();
	}
	const resolved = targets.map((target) => {
		const atPosition = current.find((card) => card.from === target.from && card.raw === target.raw);
		const matches = current.filter((card) => card.raw === target.raw);
		const match = atPosition ?? (matches.length === 1 ? matches[0] : undefined);
		if (!match) throw new CardConflictError();
		return match;
	});
	if (new Set(resolved.map((card) => card.key)).size !== targets.length) throw new CardConflictError();
	if (isMetadataAction(action)) {
		// The confirmation describes all cards in these files, not just selected rows.
		if (current.length !== fileSnapshot.length || current.some((card, index) =>
			card.raw !== fileSnapshot[index]?.raw || card.deck !== fileSnapshot[index]?.deck ||
			JSON.stringify(card.tags) !== JSON.stringify(fileSnapshot[index]?.tags))) throw new CardConflictError();
		const properties = sourceFrontmatter(source);
		if (action.kind === 'deck') properties.anki_deck = action.deck.trim();
		if (action.kind === 'tags') {
			const existing: unknown = properties.anki_tags;
			if (action.mode !== 'replace' && existing !== undefined &&
				(!Array.isArray(existing) || existing.some((tag: unknown) => typeof tag !== 'string'))) {
				throw new Error('Existing anki_tags is invalid. Use Replace tags to repair it.');
			}
			const tags = (existing ?? []) as string[];
			properties.anki_tags = [...new Set(action.mode === 'replace' ? action.tags :
				action.mode === 'add' ? [...tags, ...action.tags] : tags.filter((tag) => !action.tags.includes(tag)))];
		}
		const info = frontmatterRange(source);
		const eol = source.includes('\r\n') ? '\r\n' : '\n';
		const yaml = stringifyYaml(properties).replace(/\r?\n/g, eol);
		return info.exists
			? source.slice(0, info.from) + yaml + source.slice(info.to)
			: `${source.startsWith('\uFEFF') ? '\uFEFF' : ''}---${eol}${yaml}---${eol}${source.replace(/^\uFEFF/, '')}`;
	}
	let result = source;
	for (const card of resolved.sort((a, b) => b.from - a.from)) {
		const from = action.kind === 'delete' ? card.renderFrom : card.from;
		const to = action.kind === 'delete' ? card.renderTo : card.to;
		const replacement = action.kind === 'delete' ? '' : action.kind === 'register'
			? registerCardRaw(card.raw, card.markers) : unregisterCardRaw(card.raw, card.markers);
		result = result.slice(0, from) + replacement + result.slice(to);
	}
	return result;
}

export class BulkActionError extends Error {
	constructor(public readonly completedPaths: string[], path: string, cause: unknown) {
		super(`${completedPaths.length} files updated; stopped at ${path}. ${cause instanceof Error ? cause.message : 'Write failed.'} Remaining files were not changed.${completedPaths.length ? ` Updated: ${completedPaths.join(', ')}` : ''}`);
	}
}

export async function applyBulkAction(app: App, selected: readonly AnkiCard[], action: BulkAction,
	all: readonly AnkiCard[]): Promise<void> {
	validateBulkAction(action);
	const paths = [...new Set(selected.map((card) => card.sourcePath))];
	// Flush editors, then preflight every file. A stale/missing target prevents all writes.
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const view = leaf.view;
		if (view instanceof MarkdownView && view.file && paths.includes(view.file.path)) await view.save();
	}
	const plans = [];
	for (const path of paths) {
		const file = app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`Source file no longer exists: ${path}`);
		const before = await app.vault.read(file);
		const after = transformBulkSource(before, selected.filter((card) => card.sourcePath === path), action,
			all.filter((card) => card.sourcePath === path));
		plans.push({ file, before, after });
	}
	const completed: string[] = [];
	for (const { file, before, after } of plans) {
		try {
			await app.vault.process(file, (source) => {
				if (source !== before) throw new CardConflictError();
				return after;
			});
			completed.push(file.path);
		} catch (error) {
			// Vault has no cross-file transaction. Never overwrite later user edits to roll back.
			throw new BulkActionError(completed, file.path, error);
		}
	}
}
