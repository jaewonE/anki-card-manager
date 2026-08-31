import { cardTypeDefinition } from './cardTypes';
import type { CardIcon } from './cardTypes';

const ICON_PATHS: Record<CardIcon, { d: string; fill?: boolean }[]> = {
	anki: [
		{ d: 'M5 4H3a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2M6 2h15v16H6z' },
		{ d: 'm13.5 4 1.65 3.55 3.85.5-2.8 2.7.7 3.8-3.4-1.85-3.4 1.85.7-3.8L8 8.05l3.85-.5Z', fill: true },
	],
	cloze: [
		{ d: 'M5 4H2v16h3M19 4h3v16h-3M7 17h10M8 10h1m3 0h1m3 0h1' },
	],
};

/** Local monochrome type glyphs; color is supplied by registration-state CSS. */
export function renderAnkiIcon(container: HTMLElement, registered: boolean, cardType = 'Obsidian-Basic'): void {
	const kind = cardTypeDefinition(cardType).icon;
	const svg = container.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('aria-label', `${kind === 'cloze' ? 'Cloze' : 'Anki'}: ${registered ? 'registered' : 'unregistered'}`);
	svg.setAttribute('data-card-icon', kind);
	svg.setAttribute('role', 'img');
	for (const definition of ICON_PATHS[kind]) {
		const path = container.ownerDocument.createElementNS(svg.namespaceURI, 'path');
		path.setAttribute('d', definition.d);
		path.setAttribute('fill', definition.fill ? 'currentColor' : 'none');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-width', '1.5');
		path.setAttribute('stroke-linejoin', 'round');
		svg.append(path);
	}
	container.append(svg);
}
