import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sampleCards } from '../src/sampling';
import { parseAnkiCards } from '../src/parser';
import type { GroupAllocation } from '../src/sampling';
import type { AnkiCard } from '../src/types';

const cards = Array.from({ length: 100 }, (_, index) => parseAnkiCards(`<START_ANKI>\nObsidian-Basic\nQ${index}\nBack:\nA\n<END_ANKI>`, `${String(index).padStart(3, '0')}.md`)[0]!);
const allocation = (key: string, value: number, pool: AnkiCard[]): GroupAllocation => ({ key, label: key, value, cards: pool });
const keys = (values: AnkiCard[]) => values.map((card) => card.key);
const countIn = (values: AnkiCard[], pool: AnkiCard[]) => values.filter((card) => pool.includes(card)).length;

test('sampling is deterministic with seed 42, independent of input order and duplicate rows', () => {
	const result = sampleCards(cards, 'count', 10);
	assert.equal(result.length, 10); assert.equal(new Set(keys(result)).size, 10);
	assert.deepEqual(keys(sampleCards([...cards].reverse(), 'count', 10)), keys(result));
	assert.deepEqual(keys(sampleCards([...cards, ...cards], 'count', 10)), keys(result));
	assert.ok(result.every((card) => cards.includes(card)));
	assert.deepEqual(cards.map((card) => card.front), Array.from({ length: 100 }, (_, index) => `Q${index}`));
});

test('Count validates whole positive sizes; Rate validates (0,100] and rounds total upward', () => {
	for (const value of [0, -1, 101, 1.5, NaN, Infinity]) assert.throws(() => sampleCards(cards, 'count', value));
	for (const value of [0, -1, 100.1, NaN, Infinity]) assert.throws(() => sampleCards(cards, 'rate', value));
	assert.throws(() => sampleCards([], 'count', 1));
	assert.equal(sampleCards(cards.slice(0, 7), 'rate', 30).length, 3);
	assert.equal(sampleCards(cards.slice(0, 1), 'rate', 0.1).length, 1);
	assert.equal(sampleCards(cards, 'rate', 100).length, 100);
});

test('Count allocation 6 plus remainder 4 produces exactly ten selected cards', () => {
	const group = cards.slice(0, 30);
	const result = sampleCards(cards, 'count', 10, [allocation('group', 6, group)]);
	assert.equal(countIn(result, group), 6); assert.equal(result.length, 10);
});

test('global Count with group Rate 30/40/30 produces 3/4/3; global Rate also accepts group Count', () => {
	const groups = [cards.slice(0, 30), cards.slice(30, 60), cards.slice(60)];
	const result = sampleCards(cards, 'count', 10, groups.map((group, index) => allocation(String(index), [30, 40, 30][index]!, group)), 'rate');
	assert.deepEqual(groups.map((group) => countIn(result, group)), [3, 4, 3]);
	const inverse = sampleCards(cards, 'rate', 10, [allocation('a', 6, groups[0]!)], 'count');
	assert.equal(countIn(inverse, groups[0]!), 6); assert.equal(inverse.length, 10);
	assert.throws(() => sampleCards(cards, 'count', 10, [allocation('a', 101, cards)], 'rate'));
	assert.throws(() => sampleCards(cards, 'rate', 10, [allocation('a', 11, cards)], 'count'), /at most 10/);
});

test('Rate 30% with a 50% group share draws 15 group cards and 15 outside it', () => {
	const group = cards.slice(0, 30);
	const result = sampleCards(cards, 'rate', 30, [allocation('group', 50, group)]);
	assert.equal(countIn(result, group), 15); assert.equal(result.length, 30);
});

test('undersized allocated groups spill unfilled slots into the unallocated pool', () => {
	for (const [mode, value, share, expected] of [['count', 10, 6, 10], ['rate', 30, 50, 30]] as const) {
		const group = cards.slice(0, 2);
		const result = sampleCards(cards, mode, value, [allocation('group', share, group)]);
		assert.equal(countIn(result, group), 2); assert.equal(result.length, expected);
	}
});

test('rate rounding preserves exact totals with all groups allocated and fractional shares', () => {
	const a = cards.slice(0, 50); const b = cards.slice(50);
	const result = sampleCards(cards, 'rate', 3, [allocation('a', 50, a), allocation('b', 50, b)]);
	assert.equal(result.length, 3); assert.equal(countIn(result, a), 2); assert.equal(countIn(result, b), 1);
	const three = [allocation('a', 33.3, cards.slice(0, 30)), allocation('b', 33.3, cards.slice(30, 60)), allocation('c', 33.4, cards.slice(60))];
	assert.equal(sampleCards(cards, 'rate', 7, three).length, 7);
});

test('group allocations validate budgets, signs, integers and finite values', () => {
	assert.throws(() => sampleCards(cards, 'count', 10, [allocation('a', 6, cards), allocation('b', 5, cards)]), /at most 10/);
	assert.throws(() => sampleCards(cards, 'rate', 30, [allocation('a', 60, cards), allocation('b', 41, cards)]), /at most 100/);
	for (const value of [-1, 1.1, Infinity, NaN]) assert.throws(() => sampleCards(cards, 'count', 10, [allocation('a', value, cards)]));
	for (const value of [-1, 101, Infinity, NaN]) assert.throws(() => sampleCards(cards, 'rate', 30, [allocation('a', value, cards)]));
});

test('overlapping tag and parent/child groups never count a card twice and ignore unselected members', () => {
	const selected = cards.slice(0, 20);
	const groups = [allocation('parent', 4, cards.slice(0, 10)), allocation('child', 2, cards.slice(0, 3))];
	const result = sampleCards(selected, 'count', 10, groups);
	assert.equal(result.length, 10); assert.equal(new Set(keys(result)).size, 10);
	assert.equal(countIn(result, cards.slice(0, 3)), 2);
	assert.equal(countIn(result, cards.slice(0, 10)), 6);
	assert.ok(result.every((card) => selected.includes(card)));
	assert.deepEqual(keys(sampleCards([...selected].reverse(), 'count', 10, [...groups].reverse())), keys(result));
});

test('insufficient remainder fails after sampling without mutating the original selection', () => {
	const selected = cards.slice(0, 10); const before = [...selected];
	assert.throws(() => sampleCards(selected, 'count', 10, [allocation('all', 6, selected)]), /Not enough unique cards/);
	assert.deepEqual(selected, before);
	assert.equal(sampleCards(selected, 'count', 10, [allocation('a', 5, cards.slice(0, 7)), allocation('b', 5, cards.slice(0, 7))]).length, 10);
	assert.throws(() => sampleCards(selected, 'count', 10, [allocation('a', 4, cards.slice(0, 7)), allocation('b', 4, cards.slice(3, 10))]), /Not enough unique cards/);
});

test('explicit zero excludes a group while absent groups share the remainder pool', () => {
	const excluded = cards.slice(0, 80);
	const result = sampleCards(cards, 'count', 10, [allocation('excluded', 0, excluded)]);
	assert.equal(countIn(result, excluded), 0); assert.equal(result.length, 10);
});
