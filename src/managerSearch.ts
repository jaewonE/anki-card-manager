import type { AnkiCard } from './types';
import type { CardSearchIndex } from './types';

const PROPERTIES = /^(-?)(anki_deck|anki_tags|deck|tags?|type|front|question|back|answer|path|source|status|id)\s*:\s*/i;
interface SearchTerm { property: string; value: string; exclude?: boolean }
export type SearchMode = 'and' | 'or';
const normalize = (value: string): string => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '');

export function createCardSearchIndex(card: AnkiCard): CardSearchIndex {
	const front = normalize(card.front);
	const back = normalize(card.back);
	const cardType = normalize(card.cardType);
	const deck = normalize(card.deck);
	const tags = card.tags.map(normalize);
	const sourcePath = normalize(card.sourcePath);
	const id = normalize(card.id ?? '');
	return { front, back, cardType, deck, tags, sourcePath, id,
		all: [front, back, cardType, deck, ...tags, sourcePath, id] };
}

export function parseSearch(query: string): SearchTerm[] {
	const terms: SearchTerm[] = [];
	let property = '';
	let exclude = false;
	let value = '';
	let quote = '';
	const flush = (): void => {
		const values = /^(anki_deck|anki_tags|deck|tags?|type)$/.test(property) ? value.split(',') : [value];
		for (const item of values) if (item.trim()) terms.push({ property, value: item.trim(), ...(exclude ? { exclude: true } : {}) });
		value = '';
	};
	for (let index = 0; index < query.length;) {
		const character = query[index]!;
		if (character === '"' || character === "'") {
			if (!quote) quote = character;
			else if (quote === character) quote = '';
			else value += character;
			index += 1;
			continue;
		}
		const match = !quote && (index === 0 || /\s/.test(query[index - 1]!))
			? PROPERTIES.exec(query.slice(index)) : null;
		if (match) {
			flush();
			property = match[2]!.toLowerCase();
			exclude = match[1] === '-';
			index += match[0].length;
			continue;
		}
		if (!quote && !property && /\s/.test(character)) flush();
		else value += character;
		index += 1;
	}
	flush();
	return terms;
}

export function matchesSearch(card: AnkiCard, terms: readonly SearchTerm[], mode: SearchMode = 'and'): boolean {
	if (!terms.length) return true;
	const matches = ({ property, value }: SearchTerm): boolean => {
		const needle = normalize(value);
		const indexed = card.search ?? createCardSearchIndex(card);
		let haystacks: string[];
		switch (property) {
			case 'deck': case 'anki_deck': haystacks = [indexed.deck]; break;
			case 'tag': case 'tags': case 'anki_tags': haystacks = indexed.tags; break;
			case 'type': haystacks = [indexed.cardType]; break;
			case 'front': case 'question': haystacks = [indexed.front]; break;
			case 'back': case 'answer': haystacks = [indexed.back]; break;
			case 'path': case 'source': haystacks = [indexed.sourcePath]; break;
			case 'id': haystacks = [indexed.id]; break;
			case 'status': return needle === (card.registered ? 'registered' : 'unregistered');
			default: haystacks = indexed.all;
		}
		return haystacks.some((haystack) => haystack.includes(needle));
	};
	// Exclusions always narrow results, even when included terms are combined with OR.
	if (terms.some((term) => term.exclude && matches(term))) return false;
	const included = terms.filter((term) => !term.exclude);
	return !included.length || (mode === 'or' ? included.some(matches) : included.every(matches));
}
