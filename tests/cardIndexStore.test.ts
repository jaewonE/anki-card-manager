import assert from 'node:assert/strict';
import test from 'node:test';
import 'fake-indexeddb/auto';
import { IndexedDbCardIndexStore } from '../src/cardIndexStore';
import type { CardIndexFileRecord } from '../src/cardIndexStore';
import { parseAnkiCards } from '../src/parser';

const databaseName = `anki-card-manager-test-${Date.now()}-${Math.random()}`;

function record(path: string, count: number): CardIndexFileRecord {
	return { path, mtime: 1, size: 100, parserSignature: 'parser', markerSignature: 'markers',
		cardCount: count, error: '', indexedAt: 1 };
}

function card(path: string, name: string) {
	return parseAnkiCards(`<START_ANKI>\nObsidian-Basic\n${name}\nBack:\nAnswer\n<END_ANKI>`, path)[0]!;
}

test('IndexedDB index atomically replaces file rows and persists every manager column', async () => {
	const store = new IndexedDbCardIndexStore(databaseName);
	await store.open();
	const first = { ...card('a.md', 'One'), deck: 'Mother::Child', tags: ['Inbox'], metadataReady: true };
	const second = { ...card('a.md', 'Two'), key: 'a.md:second' };
	const other = card('b.md', 'Other');
	await store.replaceFile(record('a.md', 2), [first, second]);
	await store.replaceFile(record('b.md', 1), [other]);
	store.close();

	const reopened = new IndexedDbCardIndexStore(databaseName);
	const loaded = await reopened.load();
	assert.equal(loaded.files.length, 2);
	assert.equal(loaded.cards.length, 3);
	assert.deepEqual(loaded.cards.find((value) => value.front === 'One'), first);

	const changed = { ...first, front: 'Updated question', registered: false };
	await reopened.replaceFile({ ...record('a.md', 1), mtime: 2 }, [changed]);
	const replaced = await reopened.load();
	assert.deepEqual(replaced.cards.map((value) => value.front).sort(), ['Other', 'Updated question']);
	assert.equal(replaced.cards.find((value) => value.sourcePath === 'a.md')?.registered, false);

	const extra = { ...second, key: 'a.md:extra' };
	await Promise.all([
		reopened.replaceFile({ ...record('a.md', 2), mtime: 3 }, [changed, extra]),
		reopened.replaceFile({ ...record('a.md', 1), mtime: 4 }, [changed]),
	]);
	assert.deepEqual((await reopened.load()).cards.filter((value) => value.sourcePath === 'a.md'), [changed],
		'concurrent replacements leave only the final transaction projection');
	await reopened.removeFile('a.md');
	assert.deepEqual((await reopened.load()).cards.map((value) => value.sourcePath), ['b.md']);
	reopened.close();
});
