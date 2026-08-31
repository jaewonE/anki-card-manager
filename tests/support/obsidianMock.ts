import { StateField } from '@codemirror/state';
import MarkdownIt from 'markdown-it';
import { dump, load } from 'js-yaml';

const markdownRenderer = new MarkdownIt({ html: false });

export const editorInfoField = StateField.define({
	create: () => ({ file: { path: 'test.md' } }),
	update: (value) => value,
});

export class Component {
	static active = 0;
	private cleanup: (() => void)[] = [];
	load(): void { Component.active += 1; }
	register(callback: () => void): void { this.cleanup.push(callback); }
	unload(): void { Component.active -= 1; for (const callback of this.cleanup.splice(0)) callback(); }
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
	const paths: Record<string, string> = {
		pencil: 'm4 16 12-12 4 4L8 20H4zm9-9 4 4',
		'arrow-right-left': 'M4 7h16m-5-5 5 5-5 5M20 17H4m5-5-5 5 5 5',
		'rotate-ccw': 'M3 10a9 9 0 1 1 1 8M3 3v7h7',
		'trash-2': 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
	};
	path.setAttribute('d', paths[icon] ?? 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12m7 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0');
	svg.append(path);
	element.replaceChildren(svg);
}

export class TFile { path = 'test.md'; extension = 'md'; }
export class MarkdownView { async save(): Promise<void> { await Promise.resolve(); } }
export class Notice {
	static messages: string[] = [];
	constructor(public message: string) { Notice.messages.push(message); }
}

export function parseYaml(source: string): unknown { return load(source); }
export function stringifyYaml(value: unknown): string { return dump(value, { lineWidth: -1 }); }

export class WorkspaceLeaf {
	constructor(public app: unknown, public contentEl: HTMLElement) {}
}
export class ItemView {
	app: unknown;
	contentEl: HTMLElement;
	constructor(leaf: WorkspaceLeaf) { this.app = leaf.app; this.contentEl = leaf.contentEl; }
	registerEvent(): void {}
}
export class Modal {
	modalEl = document.createElement('div');
	titleEl = this.modalEl.createEl('h2');
	contentEl = this.modalEl.createDiv();
	constructor(public app: unknown) { this.modalEl.classList.add('modal'); }
	open(): void { document.body.append(this.modalEl); this.onOpen(); }
	close(): void { this.onClose(); this.modalEl.remove(); }
	onOpen(): void {}
	onClose(): void {}
}
class Control {
	constructor(readonly element: HTMLInputElement | HTMLSelectElement | HTMLButtonElement) {}
	setValue(value: string | boolean): this {
		if (typeof value === 'boolean' && this.element instanceof this.element.ownerDocument.defaultView!.HTMLInputElement) this.element.checked = value;
		else this.element.value = String(value);
		return this;
	}
	addOption(value: string, text: string): this { this.element.createEl('option', { value, text }); return this; }
	setDisabled(value: boolean): this { this.element.disabled = value; return this; }
	onChange(callback: (value: string) => void): this {
		this.element.addEventListener(this.element.tagName === 'SELECT' ? 'change' : 'input', () => callback(this.element.value)); return this;
	}
	setButtonText(text: string): this { this.element.textContent = text; return this; }
	setCta(): this { this.element.classList.add('mod-cta'); return this; }
	onClick(callback: () => void): this { this.element.addEventListener('click', callback); return this; }
}
export class ButtonComponent extends Control {
	constructor(container: HTMLElement) { super(container.createEl('button')); }
	setWarning(): this { this.element.classList.add('mod-warning'); return this; }
}
export class Setting {
	private row: HTMLElement;
	private name: HTMLElement;
	constructor(container: HTMLElement) { this.row = container.createDiv({ cls: 'setting-item' }); this.name = this.row.createEl('label'); }
	setName(text: string): this { this.name.textContent = text; return this; }
	setDesc(text: string): this { this.row.createEl('p', { text }); return this; }
	setHeading(): this { return this; }
	private control(tag: 'input' | 'select' | 'button', callback: (control: Control) => void): this {
		const element = this.row.createEl(tag); element.setAttribute('aria-label', this.name.textContent ?? ''); callback(new Control(element)); return this;
	}
	addDropdown(callback: (control: Control) => void): this { return this.control('select', callback); }
	addText(callback: (control: Control) => void): this { return this.control('input', callback); }
	addToggle(callback: (control: Control) => void): this { return this.control('input', callback); }
	addButton(callback: (control: Control) => void): this { return this.control('button', callback); }
}
export class PluginSettingTab {
	containerEl = document.createElement('div');
	constructor(public app: unknown, public plugin: unknown) {}
}
export class Menu {
	static last: Menu | undefined;
	items: { title: string; callback: () => void }[] = [];
	private element?: HTMLElement;
	constructor() { Menu.last = this; }
	addItem(callback: (item: { setTitle(title: string): unknown }) => void): this {
		const record = { title: '', callback: () => {} };
		const item = { setTitle: (title: string) => { record.title = title; return item; }, setChecked: () => item,
			onClick: (fn: () => void) => { record.callback = fn; return item; } };
		callback(item); this.items.push(record); return this;
	}
	showAtMouseEvent(event: MouseEvent): this { return this.showAtPosition({ x: event.clientX, y: event.clientY }); }
	showAtPosition(position: { x: number; y: number }): this {
		this.element = document.body.createDiv({ cls: 'menu', attr: { role: 'menu' } });
		this.element.style.left = `${position.x}px`; this.element.style.top = `${position.y}px`;
		for (const item of this.items) {
			const button = this.element.createEl('button', { text: item.title, attr: { role: 'menuitem' } });
			button.addEventListener('click', () => { this.hide(); item.callback(); });
		}
		return this;
	}
	hide(): this { this.element?.remove(); return this; }
}
export function normalizePath(path: string): string { return path.replace(/\/+/g, '/'); }
export function debounce(callback: () => void, delay: number) {
	let timer: ReturnType<typeof setTimeout>;
	return () => { clearTimeout(timer); timer = setTimeout(callback, delay); };
}
