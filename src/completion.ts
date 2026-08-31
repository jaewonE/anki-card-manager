import { REGISTERED_END, REGISTERED_START, UNREGISTERED_START } from './parser';

/** A closer after another start belongs to that other card, including inline starts. */
export function hasOwnClosingMarker(afterStart: string): boolean {
	const end = afterStart.indexOf(REGISTERED_END);
	if (end < 0) return false;
	return [REGISTERED_START, UNREGISTERED_START].every((start) => {
		const next = afterStart.indexOf(start);
		return next < 0 || end < next;
	});
}
