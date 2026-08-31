import { cardTypeDefinition } from './cardTypes';
import type { CardIcon } from './cardTypes';

const ICON_PATHS: Record<CardIcon, { d: string; fill?: boolean; stroke?: boolean }[]> = {
	anki: [
		{ d: 'M5 4H3a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2M6 2h15v16H6z' },
		{ d: 'm13.5 4 1.65 3.55 3.85.5-2.8 2.7.7 3.8-3.4-1.85-3.4 1.85.7-3.8L8 8.05l3.85-.5Z', fill: true },
	],
	cloze: [
		{ d: 'M3 24q-.402 0-.701-.29Q2 23.422 2 23q0-.402.299-.701T3 22h18q.402 0 .701.29q.299.289.299.71q0 .402-.299.701T21 24zm7.696-15.02l4.016 4.022l-3.885 3.885q-.485.484-1.134.484t-1.133-.484l-.193-.193l-.682.677q-.218.206-.514.331t-.607.125H5.417q-.273 0-.372-.252t.094-.444l1.838-1.833l-.154-.154q-.484-.484-.49-1.14t.479-1.138zm.708-.713l4.558-4.551q.484-.485 1.133-.485t1.134.485l1.754 1.748q.484.484.484 1.133q0 .65-.484 1.134l-4.558 4.558z', fill: true, stroke: false },
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
		path.setAttribute('stroke', definition.stroke === false ? 'none' : 'currentColor');
		path.setAttribute('stroke-width', '1.5');
		path.setAttribute('stroke-linejoin', 'round');
		svg.append(path);
	}
	container.append(svg);
}
