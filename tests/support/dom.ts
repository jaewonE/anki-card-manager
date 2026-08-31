export function installDomHelpers(win: Window & typeof globalThis): void {
	win.HTMLElement.prototype.createEl = function (this: HTMLElement, tag: string, options: DomElementInfo = {}) {
		const element = win.document.createElement(tag);
		if (options.cls) element.className = Array.isArray(options.cls) ? options.cls.join(' ') : options.cls;
		if (typeof options.text === 'string') element.textContent = options.text;
		for (const [name, value] of Object.entries(options)) {
			if (['type', 'value', 'placeholder'].includes(name)) element.setAttribute(name, String(value));
		}
		for (const [name, value] of Object.entries(options.attr ?? {})) if (value != null) element.setAttribute(name, String(value));
		return this.appendChild(element);
	} as HTMLElement['createEl'];
	win.HTMLElement.prototype.createDiv = function (options?: DomElementInfo) { return this.createEl('div', options); };
	win.HTMLElement.prototype.createSpan = function (options?: DomElementInfo) { return this.createEl('span', options); };
	win.HTMLElement.prototype.addClass = function (...classes: string[]) { this.classList.add(...classes); };
	win.HTMLElement.prototype.empty = function () { this.replaceChildren(); };
	win.HTMLElement.prototype.setText = function (text: string) { this.textContent = text; };
	win.HTMLElement.prototype.setAttr = function (key: string, value: string) { this.setAttribute(key, value); };
}
