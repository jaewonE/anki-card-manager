import type { AnkiCard } from './types';

const PROPERTIES = /^(anki_deck|anki_tags|deck|tags?|type|front|question|back|answer|path|source|status|id)\s*:\s*/i;
interface SearchTerm { property: string; value: string }
const normalize = (value: string): string => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '');

export function parseSearch(query: string): SearchTerm[] {
	const terms: SearchTerm[] = [];
	let property = '';
	let value = '';
	let quote = '';
	const flush = (): void => {
		if (value.trim()) terms.push({ property, value: value.trim() });
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
			property = match[1]!.toLowerCase();
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

export function matchesSearch(card: AnkiCard, terms: readonly SearchTerm[]): boolean {
	return terms.every(({ property, value }) => {
		const needle = normalize(value);
		let haystacks: string[];
		switch (property) {
			case 'deck': case 'anki_deck': haystacks = [card.deck]; break;
			case 'tag': case 'tags': case 'anki_tags': haystacks = card.tags; break;
			case 'type': haystacks = [card.cardType]; break;
			case 'front': case 'question': haystacks = [card.front]; break;
			case 'back': case 'answer': haystacks = [card.back]; break;
			case 'path': case 'source': haystacks = [card.sourcePath]; break;
			case 'id': haystacks = [card.id ?? '']; break;
			case 'status': return needle === (card.registered ? 'registered' : 'unregistered');
			default: haystacks = [card.front, card.back, card.cardType, card.deck, ...card.tags, card.sourcePath, card.id ?? ''];
		}
		return haystacks.some((haystack) => normalize(haystack).includes(needle));
	});
}
