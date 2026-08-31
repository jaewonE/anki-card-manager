import { ItemView, MarkdownView, Notice, TFile, WorkspaceLeaf, debounce } from 'obsidian';
import { toggleCardRegistration } from '../cardActions';
import type { BulkAction } from '../bulkActions';
import { cardMetadataFromSource } from '../metadata';
import { collectGroupCards, groupCards, selectionState } from '../managerModel';
import type { CardGroup, RegistrationFilter } from '../managerModel';
import { matchesSearch, parseSearch } from '../managerSearch';
import { parseAnkiCards } from '../parser';
import type { AnkiCard } from '../types';
import { BulkActionModal } from './bulkModal';
import { DeleteCardModal, EditCardModal } from './cardModals';
import { iconButton, renderTable } from './managerTable';

export const ANKI_MANAGER_VIEW_TYPE = 'anki-card-manager-view';

export class AnkiManagerView extends ItemView {
	private cards: AnkiCard[] = [];
	private query = '';
	private registrationFilter: RegistrationFilter = 'all';
	private byDeck = false;
	private byTag = false;
	private selected = new Set<string>();
	private groupOpen = new Map<string, boolean>();
	private checkboxes: { element: HTMLInputElement; cards: AnkiCard[] }[] = [];
	private bulkButtons: HTMLButtonElement[] = [];
	private opened = false;
	private refreshSequence = 0;
	private scanFailures = 0;
	private results!: HTMLElement;
	private subtitle!: HTMLElement;
	private count!: HTMLElement;
	private selectionCount!: HTMLElement;
	private search!: HTMLInputElement;
	private status!: HTMLSelectElement;
	private deckButton!: HTMLButtonElement;
	private tagButton!: HTMLButtonElement;
	private syncButton!: HTMLButtonElement;
	private readonly scheduleRefresh = debounce(() => { if (this.opened) void this.refresh(); }, 350, true);

	constructor(leaf: WorkspaceLeaf) { super(leaf); }
	getViewType(): string { return ANKI_MANAGER_VIEW_TYPE; }
	getDisplayText(): string { return 'Anki card manager'; }
	getIcon(): string { return 'library-big'; }

	async onOpen(): Promise<void> {
		this.opened = true;
		this.createView();
		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (file instanceof TFile && file.extension === 'md') this.scheduleRefresh();
		}));
		this.registerEvent(this.app.vault.on('create', () => this.scheduleRefresh()));
		this.registerEvent(this.app.vault.on('delete', () => this.scheduleRefresh()));
		this.registerEvent(this.app.vault.on('rename', () => this.scheduleRefresh()));
		await this.refresh();
	}

	async onClose(): Promise<void> {
		this.opened = false;
		this.refreshSequence += 1;
		this.checkboxes = [];
		this.cards = [];
		this.selected.clear();
	}

	async refresh(): Promise<void> {
		const sequence = ++this.refreshSequence;
		if (this.syncButton) this.syncButton.disabled = true;
		let failures = 0;
		const perFile = await Promise.all(this.app.vault.getMarkdownFiles().map(async (file) => {
			try {
				const source = await this.app.vault.cachedRead(file);
				// YAML and cards must come from one snapshot, not a lagging metadata cache.
				return parseAnkiCards(source, file.path, cardMetadataFromSource(source));
			} catch { failures += 1; return []; }
		}));
		if (sequence !== this.refreshSequence || !this.opened) return;
		const previous = new Map(this.cards.map((card) => [card.key, card.raw]));
		this.cards = perFile.flat().sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.startLine - b.startLine);
		this.selected = new Set(this.cards.filter((card) => this.selected.has(card.key) && previous.get(card.key) === card.raw).map((card) => card.key));
		this.scanFailures = failures;
		this.syncButton.disabled = false;
		this.renderResults();
	}

	private createView(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass('anki-card-manager-view');
		const header = container.createDiv({ cls: 'anki-card-manager-header' });
		const title = header.createDiv();
		title.createEl('h2', { text: 'Anki card manager' });
		this.subtitle = title.createDiv({ cls: 'anki-card-manager-subtitle' });
		const headerActions = header.createDiv({ cls: 'anki-card-manager-header-actions' });
		iconButton(headerActions, 'rotate-ccw', 'Reset search, filters, grouping and selection', () => this.reset());
		this.syncButton = iconButton(headerActions, 'arrow-right-left', 'Sync manager with vault (does not sync Anki)', () => void this.refresh());
		const controls = container.createDiv({ cls: 'anki-card-manager-controls' });
		this.search = controls.createEl('input', { type: 'search',
			placeholder: 'Search · tags:Inbox · deck:Mother::Child · type:Cloze', attr: { 'aria-label': 'Search cards' } });
		this.search.addEventListener('input', () => { this.query = this.search.value; this.renderResults(); });
		this.status = controls.createEl('select', { attr: { 'aria-label': 'Filter registration status' } });
		for (const [value, text] of [['all', 'All statuses'], ['registered', 'Registered markers'], ['unregistered', 'Unregistered markers']]) {
			this.status.createEl('option', { value, text });
		}
		this.status.addEventListener('change', () => { this.registrationFilter = this.status.value as RegistrationFilter; this.renderResults(); });
		const grouping = controls.createDiv({ cls: 'anki-card-manager-group-controls' });
		this.deckButton = grouping.createEl('button', { text: 'Group by deck hierarchy', attr: { 'aria-pressed': 'false' } });
		this.tagButton = grouping.createEl('button', { text: 'Group by tag', attr: { 'aria-pressed': 'false' } });
		this.deckButton.addEventListener('click', () => { this.byDeck = !this.byDeck; this.updateGroupButtons(); this.renderResults(); });
		this.tagButton.addEventListener('click', () => { this.byTag = !this.byTag; this.updateGroupButtons(); this.renderResults(); });
		this.count = container.createDiv({ cls: 'anki-card-manager-results-count', attr: { role: 'status' } });
		const bulk = container.createDiv({ cls: 'anki-card-manager-bulk-actions' });
		this.selectionCount = bulk.createSpan();
		this.bulkButtons = [];
		for (const [kind, label] of [['register', 'Register'], ['unregister', 'Unregister'], ['tags', 'Change tags'], ['deck', 'Change deck'], ['delete', 'Delete']] as const) {
			const button = bulk.createEl('button', { text: label, attr: { 'aria-label': `${label} selected cards` } });
			button.addEventListener('click', () => this.openBulk(kind));
			this.bulkButtons.push(button);
		}
		const clear = bulk.createEl('button', { text: 'Clear selection' });
		clear.addEventListener('click', () => { this.selected.clear(); this.updateSelection(); });
		this.results = container.createDiv({ cls: 'anki-card-manager-results' });
	}

	private reset(): void {
		this.query = this.search.value = '';
		this.registrationFilter = 'all';
		this.status.value = 'all';
		this.byDeck = this.byTag = false;
		this.selected.clear();
		this.groupOpen.clear();
		this.updateGroupButtons();
		this.renderResults();
	}

	private updateGroupButtons(): void {
		this.deckButton.setAttribute('aria-pressed', String(this.byDeck));
		this.tagButton.setAttribute('aria-pressed', String(this.byTag));
	}

	private renderResults(): void {
		const terms = parseSearch(this.query);
		const filtered = this.cards.filter((card) => matchesSearch(card, terms) && (this.registrationFilter === 'all' ||
			(card.registered ? 'registered' : 'unregistered') === this.registrationFilter));
		// Filtering never leaves invisible rows armed for a destructive bulk operation.
		const visible = new Set(filtered.map((card) => card.key));
		this.selected = new Set([...this.selected].filter((key) => visible.has(key)));
		this.subtitle.setText(`${this.cards.length} cards across the vault${this.scanFailures ? ` · ${this.scanFailures} files could not be read (check YAML)` : ''}`);
		this.count.setText(`${filtered.length} matching cards${this.byTag ? ' · Multi-tag cards appear in each tag group; counts and selection are unique.' : ''}`);
		this.results.empty();
		this.checkboxes = [];
		if (!filtered.length) this.results.createDiv({ cls: 'anki-card-manager-empty', text: 'No cards found. Change the filters or insert <START_ANKI> in a Markdown file.' });
		else {
			const selectAll = this.results.createEl('label', { cls: 'anki-card-manager-select-all', text: 'Select all matching cards ' });
			this.selectionBox(selectAll, filtered, 'Select all matching cards');
			if (this.byDeck || this.byTag) {
				const groups = this.results.createDiv({ cls: 'anki-card-manager-tag-groups' });
				for (const group of groupCards(filtered, this.byDeck, this.byTag)) this.renderGroup(groups, group, 0);
			} else this.table(this.results, filtered);
		}
		this.updateSelection();
	}

	private renderGroup(container: HTMLElement, group: CardGroup, depth: number): void {
		const cards = collectGroupCards(group);
		const details = container.createEl('details', { cls: 'anki-card-manager-tag-group' });
		details.dataset.groupKind = group.kind;
		details.open = this.groupOpen.get(group.key) ?? depth < 2;
		details.addEventListener('toggle', () => { if (details.isConnected) this.groupOpen.set(group.key, details.open); });
		const summary = details.createEl('summary');
		this.selectionBox(summary, cards, `Select ${group.kind} group: ${group.name}`);
		summary.createSpan({ text: `${group.name} (${cards.length})` });
		const body = details.createDiv({ cls: 'anki-card-manager-tag-group-body' });
		if (group.cards.length) this.table(body, group.cards);
		for (const child of group.children) this.renderGroup(body, child, depth + 1);
	}

	private selectionBox(container: HTMLElement, cards: AnkiCard[], label: string): void {
		const element = container.createEl('input', { type: 'checkbox', attr: { 'aria-label': label } });
		element.addEventListener('click', (event) => event.stopPropagation());
		element.addEventListener('keydown', (event) => event.stopPropagation());
		element.addEventListener('change', () => {
			for (const card of cards) { if (element.checked) this.selected.add(card.key); else this.selected.delete(card.key); }
			this.updateSelection();
		});
		this.checkboxes.push({ element, cards });
	}

	private updateSelection(): void {
		for (const { element, cards } of this.checkboxes) {
			const state = selectionState(cards, this.selected);
			element.checked = state.checked;
			element.indeterminate = state.indeterminate;
			element.setAttribute('aria-checked', state.indeterminate ? 'mixed' : String(state.checked));
		}
		this.selectionCount.setText(`${this.selected.size} selected`);
		for (const button of this.bulkButtons) button.disabled = this.selected.size === 0;
	}

	private table(container: HTMLElement, cards: AnkiCard[]): void {
		renderTable(container, cards, {
			select: (parent, group, label) => this.selectionBox(parent, group, label),
			open: (card) => void this.openSource(card),
			edit: (card) => new EditCardModal(this.app, card, () => this.refresh()).open(),
			toggle: (card) => void this.toggleRegistration(card),
			delete: (card) => new DeleteCardModal(this.app, card, () => this.refresh()).open(),
		});
	}

	private openBulk(kind: BulkAction['kind']): void {
		const selected = this.cards.filter((card) => this.selected.has(card.key));
		if (!selected.length) return;
		new BulkActionModal(this.app, selected, this.cards, kind, async () => { this.selected.clear(); await this.refresh(); }).open();
	}

	private async toggleRegistration(card: AnkiCard): Promise<void> {
		try { await toggleCardRegistration(this.app, card); await this.refresh(); }
		catch (error) { new Notice(error instanceof Error ? error.message : 'Could not update the card.'); }
	}

	private async openSource(card: AnkiCard): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(card.sourcePath);
		if (!(file instanceof TFile)) { new Notice('Source file no longer exists.'); return; }
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.openFile(file);
		if (leaf.view instanceof MarkdownView) {
			leaf.view.editor.setCursor({ line: card.startLine, ch: 0 });
			leaf.view.editor.scrollIntoView({ from: { line: card.startLine, ch: 0 }, to: { line: card.endLine, ch: 0 } }, true);
		}
	}
}
