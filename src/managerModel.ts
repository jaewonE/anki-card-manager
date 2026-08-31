import type { AnkiCard } from './types';

export type RegistrationFilter = 'all' | 'registered' | 'unregistered';
export interface CardGroup {
	key: string;
	name: string;
	kind: 'deck' | 'tag';
	cards: AnkiCard[];
	children: CardGroup[];
}

export function uniqueCards(cards: readonly AnkiCard[]): AnkiCard[] {
	return [...new Map(cards.map((card) => [card.key, card])).values()];
}

export function groupCards(cards: AnkiCard[], byDeck: boolean, byTag: boolean): CardGroup[] {
	if (!byDeck) return byTag ? tagGroups(cards, 'tags') : [];
	const roots: CardGroup[] = [];
	for (const card of cards) {
		const parts = card.deck ? card.deck.split('::').map((part) => part.trim()) : ['No deck'];
		let level = roots;
		const path: string[] = [];
		for (let index = 0; index < parts.length; index += 1) {
			path.push(parts[index] ?? '');
			const key = JSON.stringify(['deck', card.deck ? 'named' : 'missing', ...path]);
			let node = level.find((candidate) => candidate.key === key);
			if (!node) {
				node = { key, kind: 'deck', name: parts[index] || '(empty level)', cards: [], children: [] };
				level.push(node);
			}
			if (index === parts.length - 1) node.cards.push(card);
			level = node.children;
		}
	}
	const finish = (nodes: CardGroup[]): void => {
		nodes.sort((a, b) => a.name.localeCompare(b.name));
		for (const node of nodes) {
			finish(node.children);
			if (byTag && node.cards.length) {
				node.children.push(...tagGroups(node.cards, node.key));
				node.cards = [];
			}
		}
	};
	finish(roots);
	return roots;
}

function tagGroups(cards: AnkiCard[], parent: string): CardGroup[] {
	const groups = new Map<string, CardGroup>();
	for (const card of cards) {
		// Tags are independent labels, never deck paths. A card can appear in several groups.
		for (const tag of new Set(card.tags.length ? card.tags : [null])) {
			const key = JSON.stringify([parent, 'tag', tag]);
			let node = groups.get(key);
			if (!node) {
				node = { key, kind: 'tag', name: tag ?? 'Untagged', cards: [], children: [] };
				groups.set(key, node);
			}
			node.cards.push(card);
		}
	}
	return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function collectGroupCards(group: CardGroup): AnkiCard[] {
	return uniqueCards([...group.cards, ...group.children.flatMap(collectGroupCards)]);
}

export function selectionState(cards: readonly AnkiCard[], selected: ReadonlySet<string>): {
	checked: boolean; indeterminate: boolean;
} {
	const unique = uniqueCards(cards);
	const count = unique.filter((card) => selected.has(card.key)).length;
	return { checked: unique.length > 0 && count === unique.length, indeterminate: count > 0 && count < unique.length };
}
