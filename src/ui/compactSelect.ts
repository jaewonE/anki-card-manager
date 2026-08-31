/** Native selects otherwise reserve the width of their longest (unselected) option. */
export function fitSelectedText(select: HTMLSelectElement): void {
	const measure = select.ownerDocument.createElement('span');
	measure.className = 'anki-card-manager-select-measure';
	measure.textContent = select.selectedOptions[0]?.textContent ?? '';
	const style = select.ownerDocument.defaultView!.getComputedStyle(select);
	measure.style.font = style.font;
	// Measure outside a potentially hidden manager tab so background scans cannot collapse its controls.
	select.ownerDocument.body.append(measure);
	const number = (value: string): number => Number.parseFloat(value) || 0;
	const width = measure.getBoundingClientRect().width + number(style.paddingLeft) + number(style.paddingRight) +
		number(style.borderLeftWidth) + number(style.borderRightWidth) + 24;
	select.style.width = `${Math.ceil(width)}px`;
	measure.remove();
}
