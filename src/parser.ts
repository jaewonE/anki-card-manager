import type { AnkiCard, CardEdit, CardMetadata } from './types';

export const REGISTERED_START = '<START_ANKI>';
export const REGISTERED_END = '<END_ANKI>';
export const UNREGISTERED_START = '<ANKI_START>';
export const UNREGISTERED_END = '<ANKI_END>';

const BACK_SEPARATOR = 'Back:';
const ID_LINE_PATTERN = /^\s*<!--ID:\s*([^>]*?)\s*-->\s*$/;

interface SourceLine {
	text: string;
	start: number;
	fullEnd: number;
}

const EMPTY_METADATA: CardMetadata = {
	deck: '',
	tags: [],
	metadataReady: false,
};

function sourceLines(source: string): SourceLine[] {
	const lines: SourceLine[] = [];
	let start = 0;

	while (start < source.length) {
		const newline = source.indexOf('\n', start);
		const fullEnd = newline === -1 ? source.length : newline + 1;
		let end = newline === -1 ? source.length : newline;
		if (end > start && source.charAt(end - 1) === '\r') {
			end -= 1;
		}
		lines.push({ text: source.slice(start, end), start, fullEnd });
		start = fullEnd;
	}

	if (source.length === 0) {
		return [];
	}
	return lines;
}

function trimBlankEdges(lines: string[]): string {
	let start = 0;
	let end = lines.length;
	while (start < end && lines[start]?.trim() === '') start += 1;
	while (end > start && lines[end - 1]?.trim() === '') end -= 1;
	return lines.slice(start, end).join('\n');
}

function markerKind(line: string): boolean | undefined {
	const marker = line.trim();
	if (marker === REGISTERED_START) return true;
	if (marker === UNREGISTERED_START) return false;
	return undefined;
}

function fencedCardRange(
	lines: SourceLine[],
	startIndex: number,
	endIndex: number,
): { from: number; to: number } | undefined {
	const before = lines[startIndex - 1];
	const after = lines[endIndex + 1];
	if (!before || !after) return undefined;
	const opening = /^[\t ]*(`{3,}|~{3,})[^\r\n]*$/.exec(before.text);
	if (!opening?.[1]) return undefined;
	const fence = opening[1];
	const closing = after.text.trim();
	if (
		closing.length < fence.length ||
		![...closing].every((character) => character === fence.charAt(0))
	) {
		return undefined;
	}
	return { from: before.start, to: after.fullEnd };
}

export function parseAnkiCards(
	source: string,
	sourcePath = '',
	metadata: CardMetadata = EMPTY_METADATA,
): AnkiCard[] {
	const lines = sourceLines(source);
	const cards: AnkiCard[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const startLine = lines[index];
		if (!startLine) continue;
		const registered = markerKind(startLine.text);
		if (registered === undefined) continue;

		const endMarker = registered ? REGISTERED_END : UNREGISTERED_END;
		let endIndex = index + 1;
		while (
			endIndex < lines.length &&
			lines[endIndex]?.text.trim() !== endMarker
		) {
			endIndex += 1;
		}
		if (endIndex >= lines.length) continue;

		const typeLine = lines[index + 1];
		if (!typeLine || index + 1 >= endIndex) {
			index = endIndex;
			continue;
		}

		let backIndex = index + 2;
		while (
			backIndex < endIndex &&
			lines[backIndex]?.text.trim() !== BACK_SEPARATOR
		) {
			backIndex += 1;
		}
		if (backIndex >= endIndex) {
			index = endIndex;
			continue;
		}

		let id: string | undefined;
		const backLines: string[] = [];
		for (let lineIndex = backIndex + 1; lineIndex < endIndex; lineIndex += 1) {
			const text = lines[lineIndex]?.text ?? '';
			const idMatch = ID_LINE_PATTERN.exec(text);
			if (idMatch) {
				id = idMatch[1]?.trim();
				continue;
			}
			backLines.push(text);
		}

		const endLine = lines[endIndex];
		if (!endLine) continue;
		const from = startLine.start;
		const to = endLine.fullEnd;
		const raw = source.slice(from, to);
		const fencedRange = fencedCardRange(lines, index, endIndex);
		const renderFrom = fencedRange?.from ?? from;
		const renderTo = fencedRange?.to ?? to;
		const frontLines = lines
			.slice(index + 2, backIndex)
			.map((line) => line.text);

		cards.push({
			key: `${sourcePath}:${from}:${to}`,
			sourcePath,
			registered,
			cardType: typeLine.text.trim(),
			front: trimBlankEdges(frontLines),
			back: trimBlankEdges(backLines),
			...(id ? { id } : {}),
			deck: metadata.deck,
			tags: [...metadata.tags],
			metadataReady: metadata.metadataReady,
			from,
			to,
			renderFrom,
			renderTo,
			startLine: index,
			endLine: endIndex,
			raw,
			renderRaw: source.slice(renderFrom, renderTo),
		});
		index = endIndex;
	}

	return cards;
}

function replaceMarkerLine(raw: string, from: string, to: string): string {
	const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return raw.replace(
		new RegExp(`^([\\t ]*)${escaped}([\\t ]*)$`, 'm'),
		(_match, leading: string, trailing: string) => `${leading}${to}${trailing}`,
	);
}

export function unregisterCardRaw(raw: string): string {
	let updated = replaceMarkerLine(raw, REGISTERED_START, UNREGISTERED_START);
	updated = replaceMarkerLine(updated, REGISTERED_END, UNREGISTERED_END);
	return updated.replace(/^[\t ]*<!--ID:[\t ]*[^>]*?[\t ]*-->[\t ]*(?:\r?\n|$)/gm, '');
}

export function registerCardRaw(raw: string): string {
	let updated = replaceMarkerLine(raw, UNREGISTERED_START, REGISTERED_START);
	updated = replaceMarkerLine(updated, UNREGISTERED_END, REGISTERED_END);
	return updated;
}

function normalizeField(value: string): string[] {
	return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

export function serializeCard(card: AnkiCard, edit: CardEdit): string {
	const eol = card.raw.includes('\r\n') ? '\r\n' : '\n';
	const hasTrailingEol = /\r?\n$/.test(card.raw);
	const start = card.registered ? REGISTERED_START : UNREGISTERED_START;
	const end = card.registered ? REGISTERED_END : UNREGISTERED_END;
	const lines = [
		start,
		edit.cardType.trim(),
		...normalizeField(edit.front),
		BACK_SEPARATOR,
		...normalizeField(edit.back),
	];
	if (card.registered && card.id) {
		lines.push(`<!--ID: ${card.id}-->`);
	}
	lines.push(end);
	return `${lines.join(eol)}${hasTrailingEol ? eol : ''}`;
}

export function cardPreview(value: string, maxLength = 120): string {
	const compact = value.replace(/\s+/g, ' ').trim();
	return compact.length > maxLength
		? `${compact.slice(0, Math.max(0, maxLength - 1))}…`
		: compact;
}
