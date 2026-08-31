import { MarkdownRenderChild, MarkdownRenderer } from 'obsidian';
import type { App, MarkdownPostProcessor } from 'obsidian';
import { parseAnkiCards } from './parser';
import { groupAdjacentCards } from './cardGrouping';
import { renderAnkiCard } from './cardRenderer';
import { changeCardType, toggleCardRegistration } from './cardActions';
import { openCardSource } from './sourceNavigation';
import type { AnkiCard, AnkiCardManagerSettings } from './types';

/** Obsidian splits Reading view into independently recycled Markdown sections.
 * Render a complete stack only in its starting section; omit its continuation
 * in later sections while preserving prose on either side of the source range.
 */
export function createReadingPostProcessor(app: App, settings: () => AnkiCardManagerSettings,
	blocked: () => boolean, refresh: () => void): MarkdownPostProcessor {
	// Reading view calls once per section. Cache only the latest document snapshot.
	let cached: { source: string; path: string; markers: string; starts: number[]; groups: AnkiCard[][] } | undefined;
	return async (el, ctx) => {
		if (el.closest('.markdown-source-view, .anki-card-manager-reading-content, .anki-card-manager-card')) return;
		el.classList.remove('anki-card-manager-reading-continuation');
		if (blocked()) return;
		const info = ctx.getSectionInfo(el);
		if (!info) return;
		const source = info.text;
		const options = settings();
		const markers = JSON.stringify(options.markers);
		if (!cached || cached.source !== source || cached.path !== ctx.sourcePath || cached.markers !== markers) {
			const starts = [0];
			for (let index = 0; index < source.length; index += 1) if (source[index] === '\n') starts.push(index + 1);
			cached = { source, path: ctx.sourcePath, markers, starts,
				groups: groupAdjacentCards(source, parseAnkiCards(source, ctx.sourcePath, undefined, options.markers)) };
		}
		const { starts } = cached;
		const from = starts[info.lineStart];
		const to = starts[info.lineEnd + 1] ?? source.length;
		if (from === undefined) return;
		const groups = cached.groups
			.filter((group) => group[0]!.renderFrom < to && group[group.length - 1]!.renderTo > from);
		if (!groups.length) return;
		const host = el.ownerDocument.createElement('div');
		host.className = 'anki-card-manager-reading-content';
		const child = new MarkdownRenderChild(host);
		el.replaceChildren(host);
		ctx.addChild(child);
		let cursor = from;
		const prose = async (end: number): Promise<void> => {
			if (end > cursor && source.slice(cursor, end).trim()) {
				await MarkdownRenderer.render(app, source.slice(cursor, end), host.createDiv(), ctx.sourcePath, child);
			}
		};
		for (const group of groups) {
			const first = group[0]!;
			await prose(first.renderFrom);
			if (first.renderFrom >= from) {
				const wrapper = host.createDiv({ cls: 'anki-card-manager-editor-widget' });
				const container = group.length > 1 ? wrapper.createDiv({ cls: 'anki-card-manager-stack' }) : wrapper;
				for (const card of group) renderAnkiCard(app, container, card, child, {
					truncateTitle: options.truncateTitles,
					onEdit: () => { void openCardSource(app, card); },
					onTypeChange: async (type) => { if (blocked()) throw new Error('A migration is in progress.'); await changeCardType(app, card, type); refresh(); },
					onToggleRegistration: async () => { if (blocked()) throw new Error('A migration is in progress.'); await toggleCardRegistration(app, card); refresh(); },
				});
			}
			cursor = Math.min(to, group[group.length - 1]!.renderTo);
		}
		await prose(to);
		// Empty continuation sections must not retain preview paragraph spacing.
		el.classList.toggle('anki-card-manager-reading-continuation', !host.hasChildNodes());
	};
}
