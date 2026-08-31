import { ItemView, TFile, WorkspaceLeaf, debounce } from 'obsidian';
import type { BulkAction } from '../bulkActions';
import { cardMetadataFromSource } from '../metadata';
import { collectGroupCards, groupCards, selectionState } from '../managerModel';
import type { CardGroup, RegistrationFilter } from '../managerModel';
import { matchesSearch, parseSearch } from '../managerSearch';
import type { SearchMode } from '../managerSearch';
import { openCardSource } from '../sourceNavigation';
import { parseAnkiCards } from '../parser';
import type { AnkiCard } from '../types';
import { DEFAULT_MARKERS } from '../markers';
import type { CardMarkers } from '../markers';
import { BulkActionModal } from './bulkModal';
import { EditCardModal } from './cardModals';
import { renderTable } from './managerTable';
import { managerIconButton } from './managerIcons';
import { ManagerSampling } from './managerSampling';
import { fitSelectedText } from './compactSelect';

export const ANKI_MANAGER_VIEW_TYPE = 'anki-card-manager-view';

export class AnkiManagerView extends ItemView {
	private cards: AnkiCard[] = [];
	private query = '';
	private searchMode: SearchMode = 'and';
	private searchModeButton!: HTMLButtonElement;
	private registrationFilter: RegistrationFilter = 'all';
	private cardTypeFilter = '';
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
	private selectionCount!: HTMLElement;
	private search!: HTMLInputElement;
	private status!: HTMLSelectElement;
	private cardType!: HTMLSelectElement;
	private sampling!: ManagerSampling;
	private bulk!: HTMLElement;
	private collapseButton?: HTMLButtonElement;
	private deckButton!: HTMLButtonElement;
	private tagButton!: HTMLButtonElement;
	private syncButton!: HTMLButtonElement;
	private readonly scheduleRefresh = debounce(() => { if (this.opened) void this.refresh(); }, 350, true);

	constructor(leaf: WorkspaceLeaf, private readonly getMarkers: () => CardMarkers = () => DEFAULT_MARKERS,
		private readonly isBlocked: () => boolean = () => false) { super(leaf); }
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
				return parseAnkiCards(source, file.path, cardMetadataFromSource(source), this.getMarkers());
			} catch { failures += 1; return []; }
		}));
		if (sequence !== this.refreshSequence || !this.opened) return;
		const previous = new Map(this.cards.map((card) => [card.key, card.raw]));
		this.cards = perFile.flat().sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.startLine - b.startLine);
		this.updateTypeOptions();
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
		managerIconButton(headerActions, 'reset', 'Reset search, filters, grouping, sampling and selection', () => this.reset());
		this.syncButton = managerIconButton(headerActions, 'sync', 'Sync manager with vault (does not sync Anki)', () => void this.refresh());
		const controls = container.createDiv({ cls: 'anki-card-manager-controls' });
		controls.createSpan({ cls: 'anki-card-manager-control-label', text: 'Search/Filter' });
		this.search = controls.createEl('input', { type: 'search',
			placeholder: 'Search · tag:t1,t2 · -tag:skip · deck:Mother::Child · type:Cloze', attr: { 'aria-label': 'Search cards' } });
		this.search.addEventListener('input', () => { this.query = this.search.value; this.renderResults(); });
		this.searchModeButton = controls.createEl('button', { cls: 'anki-card-manager-search-mode', attr: { type: 'button' } });
		this.updateSearchMode();
		this.searchModeButton.addEventListener('click', () => {
			this.searchMode = this.searchMode === 'and' ? 'or' : 'and'; this.updateSearchMode(); this.renderResults();
		});
		this.status = controls.createEl('select', { attr: { 'aria-label': 'Filter registration status' } });
		for (const [value, text] of [['all', 'All statuses'], ['registered', 'Registered markers'], ['unregistered', 'Unregistered markers']]) {
			this.status.createEl('option', { value, text });
		}
		fitSelectedText(this.status);
		this.status.addEventListener('change', () => { this.registrationFilter = this.status.value as RegistrationFilter; fitSelectedText(this.status); this.renderResults(); });
		this.cardType = controls.createEl('select', { attr: { 'aria-label': 'Filter card type' } });
		this.cardType.createEl('option', { value: '', text: 'All card types' });
		this.cardType.addEventListener('change', () => { this.cardTypeFilter = this.cardType.value; fitSelectedText(this.cardType); this.renderResults(); });
		const grouping = container.createDiv({ cls: 'anki-card-manager-group-controls' });
		grouping.createSpan({ cls: 'anki-card-manager-control-label', text: 'Grouping' });
		this.deckButton = grouping.createEl('button', { text: 'Group by deck hierarchy', attr: { 'aria-pressed': 'false' } });
		this.tagButton = grouping.createEl('button', { text: 'Group by tag', attr: { 'aria-pressed': 'false' } });
		this.deckButton.addEventListener('click', () => { this.byDeck = !this.byDeck; this.sampling.clearAllocations(); this.updateGroupButtons(); this.renderResults(); });
		this.tagButton.addEventListener('click', () => { this.byTag = !this.byTag; this.sampling.clearAllocations(); this.updateGroupButtons(); this.renderResults(); });
		this.bulk = container.createDiv({ cls: 'anki-card-manager-bulk-actions' });
		this.selectionCount = this.bulk.createDiv({ cls: 'anki-card-manager-control-label', attr: { role: 'status' } });
		const bulk = this.bulk.createDiv({ cls: 'anki-card-manager-bulk-buttons' });
		this.bulkButtons = [];
		for (const [kind, label] of [['register', 'Register'], ['unregister', 'Unregister'], ['tags', 'Change tags'], ['deck', 'Change deck'], ['delete', 'Delete']] as const) {
			const button = bulk.createEl('button', { text: label, attr: { 'aria-label': `${label} selected cards` } });
			button.addEventListener('click', () => this.openBulk(kind));
			this.bulkButtons.push(button);
		}
		const clear = bulk.createEl('button', { text: 'Clear selection' });
		clear.addEventListener('click', () => { this.selected.clear(); this.updateSelection(); });
		this.sampling = new ManagerSampling(container, () => this.cards.filter((card) => this.selected.has(card.key)),
			(cards) => { this.selected = new Set(cards.map((card) => card.key)); this.updateSelection(); }, this.isBlocked);
		this.results = container.createDiv({ cls: 'anki-card-manager-results' });
	}

	private reset(): void {
		this.query = this.search.value = '';
		this.searchMode = 'and'; this.updateSearchMode();
		this.registrationFilter = 'all';
		this.status.value = 'all';
		this.cardTypeFilter = this.cardType.value = '';
		fitSelectedText(this.status); fitSelectedText(this.cardType);
		this.byDeck = this.byTag = false;
		this.selected.clear();
		this.groupOpen.clear();
		this.sampling.reset();
		this.updateGroupButtons();
		this.renderResults();
	}

	private updateSearchMode(): void {
		this.searchModeButton.setText(this.searchMode.toUpperCase());
		this.searchModeButton.dataset.mode = this.searchMode;
		this.searchModeButton.setAttribute('aria-label', `Search condition mode: ${this.searchMode.toUpperCase()}`);
		this.searchModeButton.title = 'Combine included search terms, including comma-separated values. Exclusions (-property:value), status and card-type filters always narrow the results.';
	}

	private updateGroupButtons(): void {
		this.deckButton.setAttribute('aria-pressed', String(this.byDeck));
		this.tagButton.setAttribute('aria-pressed', String(this.byTag));
	}

	private updateTypeOptions(): void {
		const types = [...new Set(this.cards.map((card) => card.cardType))].sort();
		if (!types.includes(this.cardTypeFilter)) this.cardTypeFilter = '';
		this.cardType.empty();
		this.cardType.createEl('option', { value: '', text: 'All card types' });
		for (const type of types) this.cardType.createEl('option', { value: type, text: type });
		this.cardType.value = this.cardTypeFilter;
		fitSelectedText(this.cardType);
	}

	private renderResults(): void {
		if (this.isBlocked()) {
			this.selected.clear();
			this.checkboxes = [];
			this.results.empty();
			this.sampling.setGroups([]);
			this.collapseButton = undefined;
			this.results.createEl('p', { text: 'Card migration is pending. Finish or recover it in plugin settings before managing cards.' });
			this.updateSelection();
			return;
		}
		const terms = parseSearch(this.query);
		const filtered = this.cards.filter((card) => matchesSearch(card, terms, this.searchMode) && (this.registrationFilter === 'all' ||
			(card.registered ? 'registered' : 'unregistered') === this.registrationFilter) && (!this.cardTypeFilter || card.cardType === this.cardTypeFilter));
		// Filtering never leaves invisible rows armed for a destructive bulk operation.
		const visible = new Set(filtered.map((card) => card.key));
		this.selected = new Set([...this.selected].filter((key) => visible.has(key)));
		this.subtitle.setText(`${filtered.length} of ${this.cards.length} cards across the vault${this.scanFailures ? ` · ${this.scanFailures} files could not be read (check YAML)` : ''}`);
		this.results.empty();
		this.checkboxes = [];
		this.collapseButton = undefined;
		const groups = groupCards(filtered, this.byDeck, this.byTag);
		this.sampling.setGroups(groups);
		if (!filtered.length) this.results.createDiv({ cls: 'anki-card-manager-empty', text: `No cards found. Change the filters or insert ${this.getMarkers().registeredStart} in a Markdown file.` });
		else {
			const toolbar = this.results.createDiv({ cls: 'anki-card-manager-results-toolbar' });
			const selectAll = toolbar.createEl('label', { cls: 'anki-card-manager-select-all' });
			this.selectionBox(selectAll, filtered, 'Select all matching cards');
			selectAll.createSpan({ text: 'Select all matching cards' });
			if (this.byDeck || this.byTag) {
				this.collapseButton = toolbar.createEl('button', { attr: { type: 'button' } });
				this.collapseButton.addEventListener('click', () => this.toggleAllGroups());
				const groupContainer = this.results.createDiv({ cls: 'anki-card-manager-tag-groups' });
				for (const group of groups) this.renderGroup(groupContainer, group, 0);
				this.updateCollapseButton();
			} else this.table(this.results, filtered);
		}
		this.updateSelection();
	}

	private renderGroup(container: HTMLElement, group: CardGroup, depth: number): void {
		const cards = collectGroupCards(group);
		const details = container.createEl('details', { cls: 'anki-card-manager-tag-group' });
		details.dataset.groupKind = group.kind;
		details.open = this.groupOpen.get(group.key) ?? depth < 2;
		details.dataset.groupKey = group.key;
		details.addEventListener('toggle', () => { if (details.isConnected) { this.groupOpen.set(group.key, details.open); this.updateCollapseButton(); } });
		const summary = details.createEl('summary');
		this.selectionBox(summary, cards, `Select ${group.kind} group: ${group.name}`);
		summary.createSpan({ text: `${group.kind === 'deck' ? 'Deck' : 'Tag'}: ${group.name} (${cards.length})` });
		this.sampling.addGroupInput(summary, group);
		const body = details.createDiv({ cls: 'anki-card-manager-tag-group-body' });
		if (group.cards.length) this.table(body, group.cards);
		for (const child of group.children) this.renderGroup(body, child, depth + 1);
	}

	private updateCollapseButton(): void {
		const anyOpen = this.results.querySelector('details[open]') !== null;
		this.collapseButton?.setText(anyOpen ? '전체 접기' : '전체 펼치기');
	}
	private toggleAllGroups(): void {
		const open = this.results.querySelector('details[open]') === null;
		for (const details of Array.from(this.results.querySelectorAll<HTMLDetailsElement>('details'))) {
			details.open = open; this.groupOpen.set(details.dataset.groupKey!, open);
		}
		this.updateCollapseButton();
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
		this.selectionCount.setText(`Change state | ${this.selected.size} selected`);
		this.bulk.classList.toggle('has-selection', this.selected.size > 0);
		for (const button of this.bulkButtons) button.disabled = this.selected.size === 0;
		this.sampling.update();
	}

	private table(container: HTMLElement, cards: AnkiCard[]): void {
		renderTable(container, cards, {
			select: (parent, group, label) => this.selectionBox(parent, group, label),
			open: (card) => void openCardSource(this.app, card),
			edit: (card) => new EditCardModal(this.app, card, () => this.refresh()).open(),
		});
	}

	private openBulk(kind: BulkAction['kind']): void {
		const selected = this.cards.filter((card) => this.selected.has(card.key));
		if (!selected.length) return;
		new BulkActionModal(this.app, selected, this.cards, kind, async () => { this.selected.clear(); await this.refresh(); }).open();
	}

}
