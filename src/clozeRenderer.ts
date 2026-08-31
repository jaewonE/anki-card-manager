import { MarkdownRenderer, setIcon } from 'obsidian';
import type { App, Component } from 'obsidian';
import { prepareClozeMarkdown } from './cloze';

export async function renderClozeAnswer(
	app: App,
	markdown: string,
	content: HTMLElement,
	header: HTMLElement,
	details: HTMLDetailsElement,
	sourcePath: string,
	component: Component,
	onSizeChange?: () => void,
): Promise<void> {
	const prepared = prepareClozeMarkdown(markdown);
	const masks: HTMLElement[] = [];
	const toggle = header.createEl('button', {
		cls: 'anki-card-manager-cloze-toggle',
		attr: { type: 'button' },
	});
	const icon = toggle.createSpan();
	const label = toggle.createSpan();
	function updateToggle(): void {
		const allVisible = masks.length > 0 && masks.every((mask) => !mask.classList.contains('is-hidden'));
		label.textContent = allVisible ? 'Hide all answers' : 'Reveal all answers';
		toggle.setAttribute('aria-label', label.textContent);
		toggle.setAttribute('aria-pressed', String(allVisible));
		setIcon(icon, allVisible ? 'eye-off' : 'eye');
	}
	function setRevealed(mask: HTMLElement, revealed: boolean): void {
		mask.classList.toggle('is-hidden', !revealed);
		mask.setAttribute('aria-expanded', String(revealed));
		mask.querySelector('.anki-card-manager-cloze-text')?.setAttribute('aria-hidden', String(!revealed));
	}
	function hideAll(): void {
		for (const mask of masks) setRevealed(mask, false);
		updateToggle();
	}
	toggle.disabled = true;
	updateToggle();
	toggle.addEventListener('click', () => {
		const reveal = masks.some((mask) => mask.classList.contains('is-hidden'));
		for (const mask of masks) setRevealed(mask, reveal);
		updateToggle();
		onSizeChange?.();
	});
	details.addEventListener('toggle', () => {
		if (!details.open) hideAll();
	});
	// Hide intermediate placeholders and answers until every opaque mask is ready.
	content.classList.add('is-rendering-cloze');
	await MarkdownRenderer.render(app, prepared.markdown, content, sourcePath, component);
	const walker = content.ownerDocument.createTreeWalker(content, 4 /* SHOW_TEXT */);
	const textNodes: Text[] = [];
	while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
	const renders: Promise<void>[] = [];
	for (const node of textNodes) {
		const text = node.data;
		const matches = [...text.matchAll(prepared.pattern)];
		if (matches.length === 0) continue;
		const fragment = content.ownerDocument.createDocumentFragment();
		let offset = 0;
		for (const match of matches) {
			const blank = prepared.blanks[Number(match[1])];
			if (!blank) continue;
			fragment.append(text.slice(offset, match.index));
			const mask = content.ownerDocument.createElement('span');
			mask.className = 'anki-card-manager-cloze-mask is-hidden';
			mask.setAttribute('role', 'button');
			mask.setAttribute('tabindex', '0');
			mask.setAttribute('aria-label', `Reveal blank ${masks.length + 1}`);
			const answer = mask.createSpan({ cls: 'anki-card-manager-cloze-text' });
			masks.push(mask);
			setRevealed(mask, false);
			const reveal = (event: Event): void => {
				event.preventDefault();
				event.stopPropagation();
				setRevealed(mask, true);
				updateToggle();
				onSizeChange?.();
			};
			mask.addEventListener('click', reveal);
			mask.addEventListener('keydown', (event) => {
				if (event.key === 'Enter' || event.key === ' ') reveal(event);
			});
			renders.push(MarkdownRenderer.render(app, blank.answer, answer, sourcePath, component));
			fragment.append(mask);
			offset = match.index + match[0].length;
		}
		fragment.append(text.slice(offset));
		node.replaceWith(fragment);
	}
	await Promise.all(renders);
	if (!details.open) hideAll();
	toggle.disabled = masks.length === 0;
	content.classList.remove('is-rendering-cloze');
	onSizeChange?.();
}
