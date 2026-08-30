import type { App, TFile } from 'obsidian';
import type { CardMetadata } from './types';

function hasOwn(value: object, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(value, key);
}

export function cardMetadataForFile(app: App, file: TFile): CardMetadata {
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
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
