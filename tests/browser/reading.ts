import type { App, MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import { installDomHelpers } from '../support/dom';
import { TFile } from '../support/obsidianMock';
import { createReadingPostProcessor } from '../../src/readingView';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { collectCardsAtEnd } from '../../src/cardPlacement';
import { ConfirmCardCollectionModal } from '../../src/ui/placementSettings';

installDomHelpers(window);
let source = '앞 문단\n\n<START_ANKI>\nCloze\n**UML** 읽기 화면 카드\nText:\n{{c1::사물}}과 {{c2:관계}}\n<END_ANKI>\n\n<ANKI_START>\nObsidian-Basic\n연속 카드\nBack:\n일반 답변\n<ANKI_END>\n\n뒷 문단\n\n[^1]: 각주는 마지막에 유지됩니다.\n';
const file = new TFile(); file.path = 'reading-sample.md';
let writes = 0; let errors = 0;
const app = { vault: {
	getAbstractFileByPath: () => file,
	process: (_file: TFile, transform: (value: string) => string) => { source = transform(source); writes++; return Promise.resolve(source); },
}, workspace: { getLeavesOfType: () => [] } } as unknown as App;
const panel = document.querySelector<HTMLElement>('#reading')!;
const status = document.querySelector<HTMLElement>('#reading-status')!;
let children: MarkdownRenderChild[] = [];
function update(): void { status.setText(`Sample-only writes: ${writes} | Errors: ${errors} | No real Vault access`); }
window.addEventListener('error', () => { errors++; update(); });
window.addEventListener('unhandledrejection', () => { errors++; update(); });
const processor = createReadingPostProcessor(app, () => DEFAULT_SETTINGS, () => false, () => { void render(); });
async function render(): Promise<void> {
	for (const child of children) child.unload(); children = []; panel.empty();
	const snapshot = source;
	const lines = snapshot.split('\n');
	for (let line = 0; line < lines.length; line++) {
		const el = panel.createDiv({ text: lines[line] });
		await processor(el, { sourcePath: file.path, getSectionInfo: () => ({ text: snapshot, lineStart: line, lineEnd: line }),
			addChild: (child: MarkdownRenderChild) => { child.load(); children.push(child); } } as unknown as MarkdownPostProcessorContext);
	}
	document.querySelector<HTMLElement>('#reading-source')!.setText(source); update();
}
document.querySelector('#collect')!.addEventListener('click', () => {
	new ConfirmCardCollectionModal(app, async () => { source = collectCardsAtEnd(source); writes++; await render(); }, () => {}).open();
});
document.querySelector('#dark')!.addEventListener('change', (event) => document.body.classList.toggle('theme-dark', (event.target as HTMLInputElement).checked));
void render();
