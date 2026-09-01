import { groupAdjacentCards } from './cardGrouping';
import type { AnkiCard } from './types';

export const CARD_RENDER_CHUNK_SIZE = 24;
export const ESTIMATED_COLLAPSED_CARD_HEIGHT = 72;

export type CardStackPosition = 'single' | 'start' | 'middle' | 'end';

export interface CardRenderChunk {
	cards: AnkiCard[];
	from: number;
	to: number;
	stackPosition: CardStackPosition;
	logicalGroupSize: number;
}

/**
 * Split a semantic card stack into bounded rendering units. The source ranges
 * still partition the complete stack, including whitespace between cards, so
 * CodeMirror never renders duplicate Markdown between adjacent chunks.
 */
export function chunkAdjacentCards(
	source: string,
	cards: readonly AnkiCard[],
	maxCards = CARD_RENDER_CHUNK_SIZE,
): CardRenderChunk[] {
	if (!Number.isInteger(maxCards) || maxCards < 1) {
		throw new RangeError('maxCards must be a positive integer');
	}
	const chunks: CardRenderChunk[] = [];
	for (const group of groupAdjacentCards(source, cards)) {
		for (let offset = 0; offset < group.length; offset += maxCards) {
			const chunkCards = group.slice(offset, offset + maxCards);
			const first = chunkCards[0];
			const last = chunkCards[chunkCards.length - 1];
			if (!first || !last) continue;
			const next = group[offset + maxCards];
			const isFirst = offset === 0;
			const isLast = next === undefined;
			chunks.push({
				cards: chunkCards,
				from: first.renderFrom,
				to: next?.renderFrom ?? last.renderTo,
				stackPosition: isFirst && isLast
					? 'single'
					: isFirst ? 'start' : isLast ? 'end' : 'middle',
				logicalGroupSize: group.length,
			});
		}
	}
	return chunks;
}

export function estimateCardChunkHeight(cards: number, collection = false): number {
	return Math.max(1, cards) * ESTIMATED_COLLAPSED_CARD_HEIGHT + (collection ? 44 : 0);
}
