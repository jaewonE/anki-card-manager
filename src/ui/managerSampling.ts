import { Notice } from 'obsidian';
import { collectGroupCards } from '../managerModel';
import type { CardGroup } from '../managerModel';
import { sampleCards } from '../sampling';
import type { SamplingMode } from '../sampling';
import type { AnkiCard } from '../types';

export class ManagerSampling {
	private enabled: HTMLInputElement;
	private mode: HTMLSelectElement;
	private value: HTMLInputElement;
	private unit: HTMLElement;
	private execute: HTMLButtonElement;
	private error: HTMLElement;
	private groups: CardGroup[] = [];
	private allocations = new Map<string, string>();
	private groupInputs: HTMLInputElement[] = [];
	private groupSelects: HTMLSelectElement[] = [];
	private groupMode: SamplingMode = 'rate';

	constructor(container: HTMLElement, private readonly selected: () => AnkiCard[], private readonly apply: (cards: AnkiCard[]) => void,
		private readonly blocked: () => boolean) {
		const section = container.createDiv({ cls: 'anki-card-manager-sampling' });
		const row = section.createDiv({ cls: 'anki-card-manager-sampling-controls' });
		const label = row.createEl('label', { cls: 'anki-card-manager-control-label', text: 'Sampling' });
		this.enabled = label.createEl('input', { type: 'checkbox', attr: { 'aria-label': 'Enable sampling' } });
		label.prepend(this.enabled);
		this.mode = row.createEl('select', { attr: { 'aria-label': 'Sampling mode' } });
		this.mode.createEl('option', { value: 'count', text: 'Count' });
		this.mode.createEl('option', { value: 'rate', text: 'Rate' });
		this.mode.value = 'rate';
		this.value = row.createEl('input', { type: 'number', value: '30', attr: { 'aria-label': 'Sampling amount', min: '0', step: 'any' } });
		this.unit = row.createSpan({ text: '%' });
		this.execute = row.createEl('button', { text: 'Execute', attr: { type: 'button' } });
		section.createEl('p', { cls: 'anki-card-manager-sampling-help', text: 'Samples selected cards only. All groups share their own count/rate mode, independent of the total. Group rate means a share of the total sample. The remainder comes from cards outside allocated groups; overlaps count once. Changing group mode or grouping clears allocations.' });
		this.error = section.createDiv({ cls: 'anki-card-manager-sampling-error', attr: { role: 'alert' } });
		this.enabled.addEventListener('change', () => this.update());
		this.value.addEventListener('input', () => this.error.empty());
		this.mode.addEventListener('change', () => {
			this.value.value = this.mode.value === 'count' ? '1' : '30';
			this.error.empty(); this.update();
		});
		this.execute.addEventListener('click', () => this.run());
		this.update();
	}

	reset(): void {
		this.enabled.checked = false; this.mode.value = 'rate'; this.value.value = '30';
		this.groupMode = 'rate';
		this.clearAllocations(); this.update();
	}
	clearAllocations(): void {
		this.allocations.clear();
		for (const input of this.groupInputs) input.value = '';
		this.error.empty();
	}
	setGroups(groups: CardGroup[]): void {
		const flatten = (nodes: CardGroup[]): CardGroup[] => nodes.flatMap((group) => [group, ...flatten(group.children)]);
		this.groups = flatten(groups); this.groupInputs = []; this.groupSelects = [];
		const keys = new Set(this.groups.map((group) => group.key));
		for (const key of this.allocations.keys()) if (!keys.has(key)) this.allocations.delete(key);
	}
	addGroupInput(summary: HTMLElement, group: CardGroup): void {
		const label = summary.createEl('label', { cls: 'anki-card-manager-group-sampling', text: 'Sampling: ' });
		const mode = label.createEl('select', { attr: { 'aria-label': `Sampling mode for ${group.kind} group: ${group.name}` } });
		mode.createEl('option', { value: 'count', text: 'Count' });
		mode.createEl('option', { value: 'rate', text: 'Rate' });
		mode.value = this.groupMode;
		mode.addEventListener('change', () => {
			this.groupMode = mode.value as SamplingMode;
			this.clearAllocations(); this.update();
		});
		this.groupSelects.push(mode);
		const input = label.createEl('input', { type: 'number', value: this.allocations.get(group.key) ?? '',
			attr: { min: '0', 'aria-label': `Sampling for ${group.kind} group: ${group.name}` } });
		label.addEventListener('click', (event) => event.stopPropagation());
		label.addEventListener('keydown', (event) => event.stopPropagation());
		input.addEventListener('input', () => { this.allocations.set(group.key, input.value); this.error.empty(); });
		this.groupInputs.push(input); this.update();
	}
	update(): void {
		const disabled = !this.enabled.checked || this.blocked();
		this.enabled.disabled = this.blocked();
		this.mode.disabled = this.value.disabled = disabled;
		this.execute.disabled = disabled || this.selected().length === 0;
		this.unit.setText(this.mode.value === 'rate' ? '%' : 'cards');
		this.value.step = this.mode.value === 'count' ? '1' : 'any';
		for (const input of this.groupInputs) this.updateGroupInput(input);
		for (const select of this.groupSelects) { select.value = this.groupMode; select.disabled = disabled; }
	}
	private updateGroupInput(input: HTMLInputElement): void {
		input.disabled = !this.enabled.checked || this.blocked();
		input.step = this.groupMode === 'count' ? '1' : 'any';
		input.placeholder = this.groupMode === 'count' ? 'Count' : 'Share %';
		input.title = this.groupMode === 'count' ? 'Cards allocated from this group' : 'Percentage of the total sample allocated to this group';
	}
	private run(): void {
		if (this.execute.disabled) return;
		try {
			const allocations = this.groups.flatMap((group) => {
				const value = this.allocations.get(group.key)?.trim();
				return value ? [{ key: group.key, label: `${group.kind}: ${group.name}`, cards: collectGroupCards(group), value: Number(value) }] : [];
			});
			const result = sampleCards(this.selected(), this.mode.value as SamplingMode, Number(this.value.value), allocations, this.groupMode);
			this.error.empty(); this.apply(result); this.update();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Sampling failed.';
			this.error.setText(message); new Notice(message);
		}
	}
}
