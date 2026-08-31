import { parseYaml } from 'obsidian';
import type { App, TFile } from 'obsidian';
import type { CardMetadata } from './types';

function hasOwn(value: object, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(value, key);
}

export function cardMetadataForFile(app: App, file: TFile): CardMetadata {
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	return cardMetadata(frontmatter);
}

export function sourceFrontmatter(source: string): Record<string, unknown> {
	const info = frontmatterRange(source);
	if (!info.exists) return {};
	const value: unknown = parseYaml(info.frontmatter);
	if (value == null) return {};
	if (typeof value !== 'object' || Array.isArray(value)) throw new Error('YAML properties must be a mapping.');
	return value as Record<string, unknown>;
}

// Keep support for Obsidian 1.5.0, before getFrontMatterInfo became public.
export function frontmatterRange(source: string): {
	exists: boolean; frontmatter: string; from: number; to: number; contentStart: number;
} {
	const opening = /^\uFEFF?---[\t ]*\r?\n/.exec(source);
	if (!opening) return { exists: false, frontmatter: '', from: 0, to: 0, contentStart: 0 };
	const closing = /^(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/m.exec(source.slice(opening[0].length));
	if (!closing) throw new Error('YAML frontmatter has no closing delimiter.');
	const from = opening[0].length;
	const to = from + closing.index;
	return { exists: true, frontmatter: source.slice(from, to), from, to, contentStart: to + closing[0].length };
}

export function cardMetadataFromSource(source: string): CardMetadata {
	return cardMetadata(sourceFrontmatter(source));
}

function cardMetadata(frontmatter?: Record<string, unknown>): CardMetadata {
	const deck = typeof frontmatter?.anki_deck === 'string' ? frontmatter.anki_deck : '';
	const tagsValue: unknown = frontmatter?.anki_tags;
	const tags = Array.isArray(tagsValue)
		? tagsValue.filter((tag): tag is string => typeof tag === 'string')
		: [];
	return {
		deck,
		tags,
		metadataReady:
			typeof frontmatter?.anki_deck === 'string' &&
			Array.isArray(tagsValue) &&
			tags.length === tagsValue.length,
	};
}

export async function ensureAnkiFrontmatter(
	app: App,
	file: TFile,
	defaultDeck: string,
	defaultTag: string,
): Promise<void> {
	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		const properties = frontmatter as Record<string, unknown>;
		if (!hasOwn(properties, 'anki_deck')) {
			properties.anki_deck = defaultDeck;
		}
		if (!hasOwn(properties, 'anki_tags')) {
			properties.anki_tags = [defaultTag];
		}
	});
}
