import { frontmatterRange } from './metadata';
import { parseAnkiCards } from './parser';
import { groupAdjacentCards } from './cardGrouping';
import { DEFAULT_MARKERS } from './markers';
import type { CardMarkers } from './markers';

/** Footnote definitions in code fences are content, not the document footer. */
function footnoteOffset(source: string, start: number): number {
	let offset = start;
	let fence = '';
	for (const line of source.slice(start).match(/[^\n]*\n|[^\n]+$/g) ?? []) {
		const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
		if (marker) {
			if (!fence) fence = marker;
			else if (marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = '';
		} else if (!fence && /^ {0,3}\[\^[^\]\r\n]+\]:/.test(line)) return offset;
		offset += line.length;
	}
	return source.length;
}

/** Move intact card blocks only; normalize gaps at removal sites, not unrelated prose. */
export function collectCardsAtEnd(source: string, markers: CardMarkers = DEFAULT_MARKERS): string {
	// A file BOM belongs at byte zero, even when the first content is a card.
	if (source.startsWith('\uFEFF')) return '\uFEFF' + collectCardsAtEnd(source.slice(1), markers);
	const contentStart = frontmatterRange(source).contentStart;
	const cards = parseAnkiCards(source, '', undefined, markers).filter((card) => card.from >= contentStart);
	if (!cards.length) return source;
	const eol = source.includes('\r\n') ? '\r\n' : '\n';
	const ranges = groupAdjacentCards(source, cards).map((group) => {
		let from = group[0]!.renderFrom;
		let to = group[group.length - 1]!.renderTo;
		// A shared fence enclosing only adjacent cards belongs to the moved block.
		const opening = /(^|\n)([ \t]*(`{3,}|~{3,})[^\r\n]*\r?\n)$/.exec(source.slice(contentStart, from));
		if (opening) {
			const fence = opening[3]!;
			const closing = /^[ \t]*(`{3,}|~{3,})[ \t]*(?:\r?\n|$)/.exec(source.slice(to));
			if (closing && closing[1]![0] === fence[0] && closing[1]!.length >= fence.length) {
				from -= opening[2]!.length; to += closing[0].length;
			}
		}
		return { from, to, raw: source.slice(from, to).replace(/(?:\r?\n)+$/, '') };
	});
	let body = source;
	for (const range of [...ranges].reverse()) {
		const prefix = body.slice(0, contentStart);
		const before = body.slice(contentStart, range.from).replace(/(?:\r?\n[\t ]*)+$/, '');
		const after = body.slice(range.to).replace(/^(?:[\t ]*\r?\n)+/, '');
		body = prefix + before + (before && after ? eol : '') + after;
	}
	const boundary = footnoteOffset(body, contentStart);
	const prefix = body.slice(0, contentStart);
	const before = body.slice(contentStart, boundary).replace(/(?:\r?\n[\t ]*)+$/, '');
	const footer = body.slice(boundary);
	return prefix + before + (before ? eol + eol : '') + ranges.map((range) => range.raw).join(eol + eol) +
		(footer ? eol + eol + footer : (source.endsWith('\n') ? eol : ''));
}
