/** Local monochrome Anki-style card/star glyph, colored by registration state. */
export function renderAnkiIcon(container: HTMLElement, registered: boolean): void {
	const svg = container.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('aria-label', registered ? 'Anki: registered' : 'Anki: unregistered');
	svg.setAttribute('role', 'img');
	const card = container.ownerDocument.createElementNS(svg.namespaceURI, 'path');
	card.setAttribute('d', 'M5 4H3a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2M6 2h15v16H6z');
	card.setAttribute('fill', 'none');
	card.setAttribute('stroke', 'currentColor');
	card.setAttribute('stroke-width', '1.5');
	card.setAttribute('stroke-linejoin', 'round');
	const star = container.ownerDocument.createElementNS(svg.namespaceURI, 'path');
	star.setAttribute('d', 'm13.5 4 1.65 3.55 3.85.5-2.8 2.7.7 3.8-3.4-1.85-3.4 1.85.7-3.8L8 8.05l3.85-.5Z');
	star.setAttribute('fill', 'currentColor');
	svg.append(card, star);
	container.append(svg);
}
