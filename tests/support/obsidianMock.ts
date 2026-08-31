import { StateField } from '@codemirror/state';
import MarkdownIt from 'markdown-it';

const markdownRenderer = new MarkdownIt({ html: false });

export const editorInfoField = StateField.define({
	create: () => ({ file: { path: 'test.md' } }),
	update: (value) => value,
});

export class Component {
	static active = 0;
	load(): void { Component.active += 1; }
	unload(): void { Component.active -= 1; }
}

// Only Obsidian's host APIs are mocked. The extension, widgets, renderer,
// CodeMirror state and CodeMirror DOM implementation are the real modules.
export const MarkdownRenderer = {
	async render(_app: unknown, markdown: string, target: HTMLElement): Promise<void> {
		await Promise.resolve();
		const range = target.ownerDocument.createRange();
		// Test-only renderer: markdown-it escapes raw HTML (html: false).
		// eslint-disable-next-line no-unsanitized/method -- Test renderer escapes raw HTML with html: false.
		target.replaceChildren(range.createContextualFragment(markdownRenderer.render(markdown)));
	},
};

export function setIcon(element: HTMLElement, icon: string): void {
	element.dataset.icon = icon;
	const svg = element.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('stroke-width', '1.7');
	const path = element.ownerDocument.createElementNS(svg.namespaceURI, 'path');
	path.setAttribute('d', icon === 'pencil' ? 'm4 16 12-12 4 4L8 20H4zm9-9 4 4' : 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12m7 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0');
	svg.append(path);
	element.replaceChildren(svg);
}

export class TFile { path = 'test.md'; }
export class MarkdownView { async save(): Promise<void> { await Promise.resolve(); } }
export class Notice { constructor(public message: string) {} }
