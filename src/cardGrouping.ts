import type { AnkiCard } from './types';

/** Only whitespace may separate cards in a visual stack. Never swallow prose. */
export function groupAdjacentCards(source: string, cards: AnkiCard[]): AnkiCard[][] {
	const groups: AnkiCard[][] = [];
	for (const card of cards) {
		const group = groups[groups.length - 1];
		const previous = group?.[group.length - 1];
		if (group && previous && /^\s*$/.test(source.slice(previous.renderTo, card.renderFrom))) {
			group.push(card);
		} else {
			groups.push([card]);
		}
	}
	return groups;
}
