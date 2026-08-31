export interface CardMarkers {
	registeredStart: string;
	registeredEnd: string;
	unregisteredStart: string;
	unregisteredEnd: string;
}

export const DEFAULT_MARKERS: Readonly<CardMarkers> = Object.freeze({
	registeredStart: '<START_ANKI>', registeredEnd: '<END_ANKI>',
	unregisteredStart: '<ANKI_START>', unregisteredEnd: '<ANKI_END>',
});
export const MARKER_KEYS = ['registeredStart', 'registeredEnd', 'unregisteredStart', 'unregisteredEnd'] as const;

export function validateMarkers(markers: CardMarkers): void {
	const values = MARKER_KEYS.map((key) => markers[key]);
	if (values.some((value) => typeof value !== 'string' || !value.trim() || value !== value.trim() || /[\r\n]/.test(value))) {
		throw new Error('Triggers must be non-empty single lines without leading or trailing whitespace.');
	}
	if (values.some((value, index) => values.some((other, otherIndex) => index !== otherIndex && value.includes(other)))) {
		throw new Error('The four triggers must be distinct and must not contain each other.');
	}
}

export function sameMarkers(a: CardMarkers, b: CardMarkers): boolean {
	return MARKER_KEYS.every((key) => a[key] === b[key]);
}

export function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Simultaneous literal replacement: swaps and $-containing replacements never cascade. */
export function replaceTriggers(source: string, previous: CardMarkers, next: CardMarkers): string {
	validateMarkers(previous); validateMarkers(next);
	const replacements = new Map(MARKER_KEYS.map((key) => [previous[key], next[key]]));
	const pattern = new RegExp([...replacements.keys()].sort((a, b) => b.length - a.length).map(escapeRegex).join('|'), 'g');
	return source.replace(pattern, (match) => replacements.get(match)!);
}
