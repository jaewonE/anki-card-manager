import { uniqueCards } from './managerModel';
import type { AnkiCard } from './types';

export type SamplingMode = 'count' | 'rate';
export interface GroupAllocation {
	key: string;
	label: string;
	cards: readonly AnkiCard[];
	value: number;
}

const compareKeys = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/** Stable source order + a fresh seed of 42 makes the same selection reproducible. */
function shuffled(cards: readonly AnkiCard[]): AnkiCard[] {
	const result = uniqueCards(cards).sort((a, b) => compareKeys(a.key, b.key));
	let seed = 42;
	const random = (): number => {
		let value = seed += 0x6d2b79f5;
		value = Math.imul(value ^ value >>> 15, value | 1);
		value ^= value + Math.imul(value ^ value >>> 7, value | 61);
		return ((value ^ value >>> 14) >>> 0) / 4294967296;
	};
	for (let index = result.length - 1; index > 0; index -= 1) {
		const other = Math.floor(random() * (index + 1));
		[result[index], result[other]] = [result[other]!, result[index]!];
	}
	return result;
}

/** Largest-remainder rounding includes the unallocated pool, preserving the exact total. */
function rateQuotas(target: number, shares: number[]): number[] {
	const weights = [...shares, Math.max(0, 100 - shares.reduce((sum, share) => sum + share, 0))];
	const exact = weights.map((weight) => target * weight / 100);
	const quotas = exact.map(Math.floor);
	const order = exact.map((value, index) => ({ index, fraction: value - quotas[index]! }))
		.sort((a, b) => b.fraction - a.fraction || a.index - b.index);
	const remaining = target - quotas.reduce((sum, quota) => sum + quota, 0);
	for (let index = 0; index < remaining; index += 1) quotas[order[index]!.index]! += 1;
	return quotas.slice(0, shares.length);
}

/** Pure selection operation: errors never partially change the manager's selection or files. */
export function sampleCards(selected: readonly AnkiCard[], mode: SamplingMode, value: number,
	allocations: readonly GroupAllocation[] = [], groupMode: SamplingMode = mode): AnkiCard[] {
	const ranked = shuffled(selected);
	if (!ranked.length) throw new Error('Select at least one card before sampling.');
	if (!Number.isFinite(value) || value <= 0) throw new Error('Sampling must be a positive number.');
	if (mode === 'count' && (!Number.isSafeInteger(value) || value > ranked.length)) {
		throw new Error(`Count must be an integer from 1 to ${ranked.length}.`);
	}
	if (mode === 'rate' && value > 100) throw new Error('Rate must be greater than 0 and at most 100%.');
	const target = mode === 'count' ? value : Math.ceil(ranked.length * value / 100);
	const groups = [...allocations].sort((a, b) => compareKeys(a.key, b.key));
	for (const group of groups) {
		if (!Number.isFinite(group.value) || group.value < 0 ||
			(groupMode === 'count' ? !Number.isSafeInteger(group.value) : group.value > 100)) {
			throw new Error(`Invalid sampling allocation for ${group.label}. Use ${groupMode === 'count' ? 'a non-negative integer' : 'a percentage from 0 to 100'}.`);
		}
	}
	const total = groups.reduce((sum, group) => sum + group.value, 0);
	if (total > (groupMode === 'count' ? target : 100) + 1e-9) {
		throw new Error(`Group allocations must total at most ${groupMode === 'count' ? `${target} cards` : '100%'}.`);
	}
	const quotas = groupMode === 'count' ? groups.map((group) => group.value) : rateQuotas(target, groups.map((group) => group.value));
	const selectedKeys = new Set(ranked.map((card) => card.key));
	const reserved = new Set<string>();
	const pools = groups.map((group, index) => {
		const keys = new Set(group.cards.filter((card) => selectedKeys.has(card.key)).map((card) => card.key));
		for (const key of keys) reserved.add(key);
		return { key: group.key, keys, quota: quotas[index]! };
	}).sort((a, b) => a.keys.size - b.keys.size || compareKeys(a.key, b.key));
	const chosen = new Set<string>();
	// Smaller overlapping groups first; a card can fill only one allocation slot.
	for (const pool of pools) {
		for (const card of ranked.filter((card) => pool.keys.has(card.key) && !chosen.has(card.key)).slice(0, pool.quota)) chosen.add(card.key);
	}
	const needed = target - chosen.size;
	const rest = ranked.filter((card) => !reserved.has(card.key));
	for (const card of rest.slice(0, needed)) chosen.add(card.key);
	if (chosen.size !== target) {
		throw new Error(`Not enough unique cards outside allocated groups: need ${needed}, found ${rest.length}. Reduce the sample or clear/change group allocations. Selection was not changed.`);
	}
	return ranked.filter((card) => chosen.has(card.key));
}
