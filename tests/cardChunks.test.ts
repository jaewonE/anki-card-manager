import assert from 'node:assert/strict';
import test from 'node:test';
import {
	CARD_RENDER_CHUNK_SIZE,
	chunkAdjacentCards,
	estimateCardChunkHeight,
} from '../src/cardChunks';
import { parseAnkiCards } from '../src/parser';

function card(index: number): string {
	return `<ANKI_START>\nObsidian-Basic\nQuestion ${index}\nBack:\nAnswer ${index}\n<ANKI_END>`;
}

test('large adjacent stacks are partitioned into bounded contiguous rendering chunks', () => {
	const source = Array.from({ length: 53 }, (_, index) => card(index)).join('\n\n');
	const cards = parseAnkiCards(source, 'large.md');
	const chunks = chunkAdjacentCards(source, cards);
	assert.equal(CARD_RENDER_CHUNK_SIZE, 24);
	assert.deepEqual(chunks.map((chunk) => chunk.cards.length), [24, 24, 5]);
	assert.deepEqual(chunks.map((chunk) => chunk.stackPosition), ['start', 'middle', 'end']);
	assert.ok(chunks.every((chunk) => chunk.logicalGroupSize === 53));
	assert.equal(chunks[0]!.from, cards[0]!.renderFrom);
	assert.equal(chunks.at(-1)!.to, cards.at(-1)!.renderTo);
	assert.equal(chunks[0]!.to, chunks[1]!.from);
	assert.equal(chunks[1]!.to, chunks[2]!.from);
});

test('prose remains a hard stack boundary and collapsed height estimates scale by card count', () => {
	const source = `${card(1)}\n\n${card(2)}\nprose\n${card(3)}`;
	const chunks = chunkAdjacentCards(source, parseAnkiCards(source));
	assert.deepEqual(chunks.map((chunk) => chunk.cards.length), [2, 1]);
	assert.deepEqual(chunks.map((chunk) => chunk.stackPosition), ['single', 'single']);
	assert.equal(estimateCardChunkHeight(24), 24 * estimateCardChunkHeight(1));
	assert.equal(estimateCardChunkHeight(24, true), estimateCardChunkHeight(24) + 44);
});
