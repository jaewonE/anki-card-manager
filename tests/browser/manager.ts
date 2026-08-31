import type { App, WorkspaceLeaf as ObsidianLeaf } from 'obsidian';
import { AnkiManagerView } from '../../src/ui/managerView';
import { installDomHelpers } from '../support/dom';
import { TFile, WorkspaceLeaf } from '../support/obsidianMock';

installDomHelpers(window);
const block = (question: string, cloze = false, registered = true) =>
	`${registered ? '<START_ANKI>' : '<ANKI_START>'}\n${cloze ? 'Cloze' : 'Obsidian-Basic'}\n${question}\n${cloze ? 'Text:' : 'Back:'}\n${cloze ? '{{c1::표준 모델링 언어}}' : '샘플 답변입니다.'}\n${registered ? '<END_ANKI>' : '<ANKI_END>'}\n`;
const sources = new Map([
	['Study/software.md', '---\nanki_deck: Mother::Child\nanki_tags: [Inbox, Study/UML]\nother: keep\n---\n' + block('소프트웨어 생명 주기는 무엇인가?') + block('UML 구성 요소는 무엇인가?', true)],
	['Study/math.md', '---\nanki_deck: Mother::Math\nanki_tags: [Inbox, Math]\n---\n' + block('미등록 수학 카드', false, false)],
	['Inbox.md', '---\nanki_deck: Inbox\nanki_tags: []\n---\n' + block('태그가 없는 카드')],
]);
const files = [...sources.keys()].map((path) => { const file = new TFile(); file.path = path; return file; });
let writes = 0;
let errors = 0;
const status = document.querySelector<HTMLOutputElement>('#manager-status')!;
const updateStatus = () => { status.textContent = `Sample-only writes: ${writes} | Errors: ${errors} | No real Vault access`; };
window.addEventListener('error', updateError);
window.addEventListener('unhandledrejection', updateError);
function updateError(): void { errors += 1; updateStatus(); }
const app = { vault: {
	getMarkdownFiles: () => files, getAbstractFileByPath: (path: string) => files.find((file) => file.path === path),
	read: (file: TFile) => Promise.resolve(sources.get(file.path)!),
	cachedRead: (file: TFile) => Promise.resolve(sources.get(file.path)!),
	process: (file: TFile, transform: (source: string) => string) => {
		const source = transform(sources.get(file.path)!); sources.set(file.path, source); writes += 1;
		updateStatus(); updateSources(); return Promise.resolve(source);
	}, on: () => ({}),
}, workspace: { getLeavesOfType: () => [] } } as unknown as App;
const view = new AnkiManagerView(new WorkspaceLeaf(app, document.querySelector<HTMLElement>('#manager')!) as unknown as ObsidianLeaf);
void view.onOpen();
document.querySelector<HTMLInputElement>('#dark')!.addEventListener('change', (event) => {
	document.body.classList.toggle('theme-dark', (event.target as HTMLInputElement).checked);
});
document.querySelector<HTMLSelectElement>('#pane-width')!.addEventListener('change', (event) => {
	const manager = document.querySelector<HTMLElement>('#manager')!;
	manager.style.width = (event.target as HTMLSelectElement).value;
});
function updateSources(): void {
	const container = document.querySelector<HTMLElement>('#sample-sources')!;
	container.empty();
	for (const [path, text] of sources) {
		const file = container.createEl('details');
		file.createEl('summary', { text: path });
		file.createEl('pre', { text });
	}
}
updateStatus();
updateSources();
