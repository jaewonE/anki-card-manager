import { DEFAULT_MARKERS } from './markers';
import type { CardMarkers } from './markers';

/** A closer after another start belongs to that other card, including inline starts. */
export function hasOwnClosingMarker(afterStart: string, markers: CardMarkers = DEFAULT_MARKERS): boolean {
	const end = afterStart.indexOf(markers.registeredEnd);
	if (end < 0) return false;
	return [markers.registeredStart, markers.unregisteredStart].every((start) => {
		const next = afterStart.indexOf(start);
		return next < 0 || end < next;
	});
}
