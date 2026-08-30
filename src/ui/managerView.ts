import {
	ItemView,
	MarkdownView,
	Notice,
	TFile,
	WorkspaceLeaf,
	debounce,
	setIcon,
} from 'obsidian';
import { toggleCardRegistration } from '../cardActions';
import { cardMetadataForFile } from '../metadata';
import { cardPreview, parseAnkiCards } from '../parser';
import type { AnkiCard } from '../types';
import { DeleteCardModal, EditCardModal } from './cardModals';

export const ANKI_MANAGER_VIEW_TYPE = 'anki-card-manager-view';

type RegistrationFilter = 'all' | 'registered' | 'unregistered';
type GroupMode = 'none' | 'tags';

const REGISTRATION_OPTIONS: { value: RegistrationFilter; label: string }[] = [
	{ value: 'all', label: 'All statuses' },
	{ value: 'registered', label: 'Registered markers' },
	{ value: 'unregistered', label: 'Unregistered markers' },
];

const GROUP_OPTIONS: { value: GroupMode; label: string }[] = [
	{ value: 'none', label: 'Flat table' },
	{ value: 'tags', label: 'Group by tag hierarchy' },
];

interface TagNode {
	name: string;
	children: Map<string, TagNode>;
	cards: AnkiCard[];
}

export class AnkiManagerView extends ItemView {
	private cards: AnkiCard[] = [];
	private query = '';
	private registrationFilter: RegistrationFilter = 'all';
	private groupMode: GroupMode = 'none';
	private opened = false;
	private refreshSequence = 0;
	private readonly scheduleRefresh = debounce(
		() => void this.refresh(),
		350,
		true,
	);

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return ANKI_MANAGER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Anki card manager';
	}

	getIcon(): string {
		return 'library-big';
	}

	async onOpen(): Promise<void> {
		this.opened = true;
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile && file.extension === 'md') this.scheduleRefresh();
			}),
		);
		this.registerEvent(this.app.vault.on('create', () => this.scheduleRefresh()));
		this.registerEvent(this.app.vault.on('delete', () => this.scheduleRefresh()));
		this.registerEvent(this.app.vault.on('rename', () => this.scheduleRefresh()));
		await this.refresh();
	}

	async onClose(): Promise<void> {
		this.opened = false;
	}

	async refresh(): Promise<void> {
		const sequence = ++this.refreshSequence;
		const files = this.app.vault.getMarkdownFiles();
		const perFile = await Promise.all(
			files.map(async (file) => {
				try {
					const source = await this.app.vault.cachedRead(file);
					return parseAnkiCards(
						source,
						file.path,
						cardMetadataForFile(this.app, file),
					);
				} catch {
					return [];
				}
			}),
		);
		if (sequence !== this.refreshSequence) return;
		this.cards = perFile.flat().sort((left, right) =>
			left.sourcePath === right.sourcePath
				? left.startLine - right.startLine
				: left.sourcePath.localeCompare(right.sourcePath),
		);
		if (this.opened) this.renderView();
	}

	private renderView(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass('anki-card-manager-view');

		const header = container.createDiv({ cls: 'anki-card-manager-header' });
		const titleBlock = header.createDiv();
		titleBlock.createEl('h2', { text: 'Anki card manager' });
		titleBlock.createDiv({
			cls: 'anki-card-manager-subtitle',
			text: `${this.cards.length} cards across the vault`,
		});
		const refreshButton = header.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': 'Rescan vault' },
		});
		setIcon(refreshButton, 'refresh-cw');
		refreshButton.addEventListener('click', () => void this.refresh());

		this.renderControls(container);
		const filtered = this.filteredCards();
		container.createDiv({
			cls: 'anki-card-manager-results-count',
			text: `${filtered.length} matching cards`,
		});

		if (filtered.length === 0) {
			const empty = container.createDiv({ cls: 'anki-card-manager-empty' });
			setIcon(empty.createSpan(), 'files');
			empty.createEl('h3', { text: 'No cards found' });
			empty.createEl('p', {
				text: 'Insert <START_ANKI> in a Markdown file or change the filters above.',
			});
			return;
		}

		if (this.groupMode === 'tags') {
			this.renderTagGroups(container, filtered);
		} else {
			this.renderTable(container, filtered);
		}
	}

	private renderControls(container: HTMLElement): void {
		const controls = container.createDiv({ cls: 'anki-card-manager-controls' });
		const search = controls.createEl('input', {
			type: 'search',
			placeholder: 'Search question, answer, path, deck, or tag',
			value: this.query,
			attr: { 'aria-label': 'Search cards' },
		});
		search.addEventListener('input', () => {
			this.query = search.value;
			this.renderView();
		});

		const status = controls.createEl('select', {
			attr: { 'aria-label': 'Filter registration status' },
		});
		for (const option of REGISTRATION_OPTIONS) {
			this.addOption(status, option.value, option.label);
		}
		status.value = this.registrationFilter;
		status.addEventListener('change', () => {
			this.registrationFilter = status.value as RegistrationFilter;
			this.renderView();
		});

		const grouping = controls.createEl('select', {
			attr: { 'aria-label': 'Group cards' },
		});
		for (const option of GROUP_OPTIONS) {
			this.addOption(grouping, option.value, option.label);
		}
		grouping.value = this.groupMode;
		grouping.addEventListener('change', () => {
			this.groupMode = grouping.value as GroupMode;
			this.renderView();
		});
	}

	private addOption(select: HTMLSelectElement, value: string, label: string): void {
		select.createEl('option', { value, text: label });
	}

	private filteredCards(): AnkiCard[] {
		const query = this.query.trim().toLocaleLowerCase();
		return this.cards.filter((card) => {
			if (
				this.registrationFilter !== 'all' &&
				(card.registered ? 'registered' : 'unregistered') !==
					this.registrationFilter
			) {
				return false;
			}
			if (!query) return true;
			return [
				card.front,
				card.back,
				card.cardType,
				card.deck,
				card.tags.join(' '),
				card.sourcePath,
			].some((value) => value.toLocaleLowerCase().includes(query));
		});
	}

	private renderTagGroups(container: HTMLElement, cards: AnkiCard[]): void {
		const tree = this.buildTagTree(cards);
		const groups = container.createDiv({ cls: 'anki-card-manager-tag-groups' });
		for (const node of [...tree.values()].sort((a, b) => a.name.localeCompare(b.name))) {
			this.renderTagNode(groups, node, 0);
		}
	}

	private buildTagTree(cards: AnkiCard[]): Map<string, TagNode> {
		const roots = new Map<string, TagNode>();
		for (const card of cards) {
			const tags = card.tags.length > 0 ? [...new Set(card.tags)] : ['Untagged'];
			for (const tag of tags) {
				const parts = tag.replace(/^#/, '').split('/').filter(Boolean);
				const safeParts = parts.length > 0 ? parts : ['Untagged'];
				let level = roots;
				let node: TagNode | undefined;
				for (const part of safeParts) {
					node = level.get(part);
					if (!node) {
						node = { name: part, children: new Map(), cards: [] };
						level.set(part, node);
					}
					level = node.children;
				}
				node?.cards.push(card);
			}
		}
		return roots;
	}

	private renderTagNode(container: HTMLElement, node: TagNode, depth: number): void {
		const details = container.createEl('details', {
			cls: 'anki-card-manager-tag-group',
		});
		details.open = depth < 1;
		details.createEl('summary', {
			text: `${node.name} (${this.countNodeCards(node)})`,
		});
		const body = details.createDiv({ cls: 'anki-card-manager-tag-group-body' });
		for (const child of [...node.children.values()].sort((a, b) =>
			a.name.localeCompare(b.name),
		)) {
			this.renderTagNode(body, child, depth + 1);
		}
		if (node.cards.length > 0) this.renderTable(body, node.cards);
	}

	private countNodeCards(node: TagNode): number {
		const keys = new Set(node.cards.map((card) => card.key));
		for (const child of node.children.values()) {
			for (const card of this.collectNodeCards(child)) keys.add(card.key);
		}
		return keys.size;
	}

	private collectNodeCards(node: TagNode): AnkiCard[] {
		return [
			...node.cards,
			...[...node.children.values()].flatMap((child) =>
				this.collectNodeCards(child),
			),
		];
	}

	private renderTable(container: HTMLElement, cards: AnkiCard[]): void {
		const wrapper = container.createDiv({ cls: 'anki-card-manager-table-wrapper' });
		const table = wrapper.createEl('table', { cls: 'anki-card-manager-table' });
		const header = table.createEl('thead').createEl('tr');
		for (const label of ['Question', 'Answer', 'Type / deck', 'Tags', 'Source', 'Status', 'Actions']) {
			header.createEl('th', { text: label });
		}
		const body = table.createEl('tbody');
		for (const card of cards) this.renderRow(body, card);
	}

	private renderRow(body: HTMLTableSectionElement, card: AnkiCard): void {
		const row = body.createEl('tr');
		this.cell(row, 'Question', cardPreview(card.front) || 'Empty question');
		this.cell(row, 'Answer', cardPreview(card.back) || 'Empty answer');
		this.cell(row, 'Type / deck', `${card.cardType}\n${card.deck || 'No deck'}`);
		this.cell(row, 'Tags', card.tags.join(' / ') || 'Untagged');

		const sourceCell = row.createEl('td', { attr: { 'data-label': 'Source' } });
		const sourceButton = sourceCell.createEl('button', {
			cls: 'anki-card-manager-source-link',
			text: `${card.sourcePath}:${card.startLine + 1}`,
		});
		sourceButton.addEventListener('click', () => void this.openSource(card));

		const statusCell = row.createEl('td', { attr: { 'data-label': 'Status' } });
		statusCell.createSpan({
			cls: ['anki-card-manager-status', card.registered ? 'is-on' : 'is-off'],
			text: card.registered ? 'Registered' : 'Unregistered',
		});
		if (!card.metadataReady) {
			statusCell.createDiv({
				cls: 'anki-card-manager-metadata-warning',
				text: 'YAML missing or invalid',
			});
		}

		const actions = row.createEl('td', {
			cls: 'anki-card-manager-row-actions',
			attr: { 'data-label': 'Actions' },
		});
		this.actionButton(actions, 'pencil', 'Edit card', () => {
			new EditCardModal(this.app, card, () => this.refresh()).open();
		});
		this.actionButton(
			actions,
			card.registered ? 'circle-pause' : 'circle-play',
			card.registered ? 'Unregister card' : 'Register card',
			() => void this.toggleRegistration(card),
		);
		this.actionButton(actions, 'trash-2', 'Delete card', () => {
			new DeleteCardModal(this.app, card, () => this.refresh()).open();
		}, true);
	}

	private cell(row: HTMLTableRowElement, label: string, text: string): void {
		row.createEl('td', { text, attr: { 'data-label': label } });
	}

	private actionButton(
		container: HTMLElement,
		icon: string,
		label: string,
		onClick: () => void,
		warning = false,
	): void {
		const button = container.createEl('button', {
			cls: ['clickable-icon', warning ? 'is-warning' : ''],
			attr: { 'aria-label': label },
		});
		setIcon(button, icon);
		button.addEventListener('click', onClick);
	}

	private async toggleRegistration(card: AnkiCard): Promise<void> {
		try {
			await toggleCardRegistration(this.app, card);
			await this.refresh();
			new Notice(card.registered ? 'Card unregistered.' : 'Card registered.');
		} catch (error) {
			console.error('Anki Card Manager: registration toggle failed', error);
			new Notice(error instanceof Error ? error.message : 'Could not update the card.');
		}
	}

	private async openSource(card: AnkiCard): Promise<void> {
		const abstractFile = this.app.vault.getAbstractFileByPath(card.sourcePath);
		if (!(abstractFile instanceof TFile)) {
			new Notice('Source file no longer exists.');
			return;
		}
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.openFile(abstractFile);
		const view = leaf.view;
		if (view instanceof MarkdownView) {
			view.editor.setCursor({ line: card.startLine, ch: 0 });
			view.editor.scrollIntoView(
				{
					from: { line: card.startLine, ch: 0 },
					to: { line: card.endLine, ch: 0 },
				},
				true,
			);
		}
	}
}
