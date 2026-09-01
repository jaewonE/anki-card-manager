import { MarkdownRenderChild, MarkdownRenderer } from 'obsidian';
import type { App, MarkdownPostProcessor } from 'obsidian';
import { parseAnkiCards } from './parser';
import { chunkAdjacentCards, estimateCardChunkHeight } from './cardChunks';
import type { CardRenderChunk } from './cardChunks';
import { renderAnkiCard } from './cardRenderer';
import { changeCardType, toggleCardRegistration } from './cardActions';
import { openCardSource } from './sourceNavigation';
import type { AnkiCardManagerSettings } from './types';

/** Obsidian splits Reading view into independently recycled Markdown sections.
 * Render each bounded stack chunk only in its starting section; omit its
 * continuation in later sections while preserving prose around source ranges.
 */
export function createReadingPostProcessor(app: App, settings: () => AnkiCardManagerSettings,
	blocked: () => boolean, refresh: () => void): MarkdownPostProcessor {
	// Reading view calls once per section. Cache only the latest document snapshot.
	let cached: { source: string; path: string; markers: string; starts: number[]; chunks: CardRenderChunk[] } | undefined;
	const openCards = new Set<string>();
	type QueuedHydration = { wrapper: HTMLElement; run: () => void; cancelled: boolean };
	const hydrationQueue: QueuedHydration[] = [];
	let hydrationTimer: number | undefined;
	const scheduleHydration = (): void => {
		if (hydrationTimer !== undefined || hydrationQueue.length === 0) return;
		const view = hydrationQueue[0]?.wrapper.ownerDocument.defaultView;
		if (!view) return;
		hydrationTimer = view.setTimeout(() => {
			hydrationTimer = undefined;
			let next: QueuedHydration | undefined;
			do next = hydrationQueue.shift();
			while (next && (next.cancelled || !next.wrapper.isConnected || next.wrapper.dataset.hydrated === 'true'));
			next?.run();
			scheduleHydration();
		}, 25);
	};
	const enqueueHydration = (wrapper: HTMLElement, run: () => void): QueuedHydration => {
		const queued = { wrapper, run, cancelled: false };
		hydrationQueue.push(queued);
		scheduleHydration();
		return queued;
	};
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
				chunks: chunkAdjacentCards(source, parseAnkiCards(source, ctx.sourcePath, undefined, options.markers)) };
		}
		const { starts } = cached;
		const from = starts[info.lineStart];
		const to = starts[info.lineEnd + 1] ?? source.length;
		if (from === undefined) return;
		const chunks = cached.chunks.filter((chunk) => chunk.from < to && chunk.to > from);
		if (!chunks.length) return;
		const host = el.ownerDocument.createElement('div');
		host.className = 'anki-card-manager-reading-content';
		const child = new MarkdownRenderChild(host);
		el.replaceChildren(host);
		ctx.addChild(child);
		const Observer = el.ownerDocument.defaultView?.IntersectionObserver;
		let observer: IntersectionObserver | undefined;
		const hydrate = (wrapper: HTMLElement, chunk: CardRenderChunk): void => {
			if (wrapper.dataset.hydrated === 'true') return;
			wrapper.dataset.hydrated = 'true';
			wrapper.removeAttribute('aria-busy');
			observer?.unobserve(wrapper);
			const container = chunk.logicalGroupSize > 1
				? wrapper.createDiv({ cls: 'anki-card-manager-stack' }) : wrapper;
			for (const card of chunk.cards) renderAnkiCard(app, container, card, child, {
				truncateTitle: options.truncateTitles,
				initiallyOpen: openCards.has(card.key),
				onOpenChange: (open) => {
					if (open) openCards.add(card.key);
					else openCards.delete(card.key);
				},
				onEdit: () => { void openCardSource(app, card); },
				onTypeChange: async (type) => { if (blocked()) throw new Error('A migration is in progress.'); await changeCardType(app, card, type); refresh(); },
				onToggleRegistration: async () => { if (blocked()) throw new Error('A migration is in progress.'); await toggleCardRegistration(app, card); refresh(); },
			});
		};
		if (Observer) {
			observer = new Observer((entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const wrapper = entry.target as HTMLElement;
					const index = Number(wrapper.dataset.chunkIndex);
					const chunk = chunks[index];
					if (chunk) hydrate(wrapper, chunk);
				}
			}, { rootMargin: '800px 0px' });
			child.register(() => observer?.disconnect());
		}
		let cursor = from;
		const prose = async (end: number): Promise<void> => {
			if (end > cursor && source.slice(cursor, end).trim()) {
				await MarkdownRenderer.render(app, source.slice(cursor, end), host.createDiv(), ctx.sourcePath, child);
			}
		};
		for (const [index, chunk] of chunks.entries()) {
			await prose(chunk.from);
			if (chunk.from >= from) {
				const stackClasses = chunk.logicalGroupSize > 1
					? ['is-stack-chunk', `is-stack-${chunk.stackPosition}`] : [];
				const wrapper = host.createDiv({
					cls: ['anki-card-manager-editor-widget', 'has-card-height-estimate', ...stackClasses],
					attr: { 'aria-busy': Observer ? 'true' : 'false' },
				});
				wrapper.dataset.chunkIndex = String(index);
				wrapper.setCssProps({ '--anki-card-manager-estimated-height': `${estimateCardChunkHeight(chunk.cards.length)}px` });
				const queued = enqueueHydration(wrapper, () => hydrate(wrapper, chunk));
				child.register(() => { queued.cancelled = true; });
				if (observer) observer.observe(wrapper);
				else queued.run();
			}
			cursor = Math.min(to, chunk.to);
		}
		await prose(to);
		// Empty continuation sections must not retain preview paragraph spacing.
		el.classList.toggle('anki-card-manager-reading-continuation', !host.hasChildNodes());
	};
}
