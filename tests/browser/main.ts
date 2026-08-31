import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { App } from 'obsidian';
import { createAnkiCardEditorExtension } from '../../src/editorExtension';
import type { CardPlacement } from '../../src/types';
import { editorInfoField } from '../support/obsidianMock';
import { parseAnkiCards } from '../../src/parser';

function create(tag: string, options: DomElementInfo = {}): HTMLElement {
	const element = document.createElement(tag);
	if (options.cls) element.className = Array.isArray(options.cls) ? options.cls.join(' ') : options.cls;
	if (typeof options.text === 'string') element.textContent = options.text;
	for (const [name, value] of Object.entries(options.attr ?? {})) {
		if (value !== null) element.setAttribute(name, String(value));
	}
	return element;
}

HTMLElement.prototype.createEl = function (this: HTMLElement, tag: string, options?: DomElementInfo) {
	return this.appendChild(create(tag, options));
} as HTMLElement['createEl'];
HTMLElement.prototype.createDiv = function (options?: DomElementInfo) { return this.createEl('div', options); };
HTMLElement.prototype.createSpan = function (options?: DomElementInfo) { return this.createEl('span', options); };
HTMLElement.prototype.addClass = function (...classes: string[]) { this.classList.add(...classes); };
Object.assign(window, { createDiv: (options: DomElementInfo) => create('div', options) });

const card = '<START_ANKI>\nObsidian-Basic\n소프트웨어 생명 주기란 무엇인가? 개발 모형을 비교하고 각 단계의 특징을 설명하여라.\n여러 줄 제목은 기본적으로 전부 표시됩니다.\nBack:\n' +
	'소프트웨어 기획부터 폐기까지 전 과정입니다. 폭포수 모형, 프로토타입 모형, 나선형 모형, 애자일 모형으로 구분합니다.\n'.repeat(10) +
	'<!--ID: 1775887365861-->\n<END_ANKI>';
const cloze = '<START_ANKI>\nCloze\n**UML**(Unified Modeling Language)란 무엇인가.\nText:\n' +
	'**UML**이란 {{c1: 표준화된 객체 지향 모델링 언어}}.\n\n' +
	'- {{c1::길러멧(Guilemet)}} (기호: {{c1::겹화살표(`<<>>`)}})이라는 {{c1::스테레오 타입(Stereotype)}}으로 추가적인 기능을 표시.\n' +
	'- **UML 구성요소**: {{c1::사물}}, {{c1::관계}}, {{c1::다이어그램}}\n<END_ANKI>';
const unregistered = '<ANKI_START>\nObsidian-Basic\n등록 해제 카드\nBack:\nAnki 아이콘은 붉은색입니다.\n<ANKI_END>';
const source = `앞 문단\n\n\`\`\`php-template\n${card}\n\`\`\`\n\n중간 문단\n\n${cloze}\n\n${unregistered}\n뒷 문단`;
let placement: CardPlacement = 'inline';
let truncateTitles = false;
let errors = 0;
const status = document.querySelector<HTMLOutputElement>('#status')!;
const outside = document.querySelector<HTMLButtonElement>('#outside')!;
window.addEventListener('error', () => { errors += 1; updateStatus(); });
window.addEventListener('unhandledrejection', () => { errors += 1; updateStatus(); });

function extensions() {
	return [editorInfoField, createAnkiCardEditorExtension({} as App, () => placement, () => truncateTitles),
		EditorView.lineWrapping,
		EditorView.updateListener.of(() => queueMicrotask(updateStatus)),
		EditorView.exceptionSink.of((error) => { errors += 1; console.error(error); updateStatus(); }),
	];
}

const view = new EditorView({
	parent: document.querySelector<HTMLElement>('#editor')!,
	state: EditorState.create({ doc: source, selection: { anchor: 251 }, extensions: extensions() }),
});

function updateStatus(): void {
	status.textContent = `Errors: ${errors} | Source unchanged: ${view.state.doc.toString() === source} | Cursor: ${view.state.selection.main.head}`;
}
updateStatus();

document.querySelector<HTMLSelectElement>('#placement')!.addEventListener('change', (event) => {
	placement = (event.target as HTMLSelectElement).value as CardPlacement;
	view.dispatch({});
});
document.querySelector('#disable')!.addEventListener('click', () => {
	view.dispatch({ effects: StateEffect.reconfigure.of([]) });
});
document.querySelector('#enable')!.addEventListener('click', () => {
	view.dispatch({ effects: StateEffect.reconfigure.of(extensions()) });
});
document.querySelector('#stress')!.addEventListener('click', () => { void stress(); });
document.querySelector('#truncate')!.addEventListener('change', (event) => {
	truncateTitles = (event.target as HTMLInputElement).checked;
	view.dispatch({});
});
document.querySelector('#dark')!.addEventListener('change', (event) => {
	document.body.classList.toggle('theme-dark', (event.target as HTMLInputElement).checked);
});
document.querySelector('#below')!.addEventListener('click', () => {
	const cards = parseAnkiCards(view.state.doc.toString());
	view.dispatch({ selection: { anchor: cards[cards.length - 1]!.renderTo }, scrollIntoView: true });
	view.focus();
});

async function stress(): Promise<void> {
	const result = document.querySelector<HTMLOutputElement>('#stress-result')!;
	result.textContent = 'Running';
	for (let index = 0; index < 50; index += 1) {
		view.focus();
		await new Promise(requestAnimationFrame);
		view.dispatch({ selection: { anchor: 251 } });
		view.dispatch({ changes: { from: 251, insert: 'x' } });
		view.dispatch({ changes: { from: 251, to: 252 } });
		outside.focus();
		await new Promise(requestAnimationFrame);
		view.domAtPos(251);
	}
	result.textContent = 'Completed 50 edit cycles';
	updateStatus();
}
