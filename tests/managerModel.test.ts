import assert from 'node:assert/strict';
import test from 'node:test';
import { collectGroupCards, groupCards, selectionState } from '../src/managerModel';
import { matchesSearch, parseSearch } from '../src/managerSearch';
import { parseAnkiCards } from '../src/parser';

function card(path: string, deck: string, tags: string[]) {
	return parseAnkiCards('<START_ANKI>\nCloze\nUML 구성 요소\nText:\n{{c1::모델링 언어}}\n<END_ANKI>', path,
		{ deck, tags, metadataReady: true })[0]!;
}
const a = card('a.md', 'Mother::Child', ['Inbox', 'Study/UML']);
const b = card('b.md', 'Mother::Other', ['Inbox']);
const c = card('c.md', 'Mother', []);

test('comma values and separately listed terms share the global AND/OR mode', () => {
	assert.deepEqual(parseSearch('tag: Inbox, Study/UML type: Cloze, Obsidian-Basic'), [
		{ property: 'tag', value: 'Inbox' }, { property: 'tag', value: 'Study/UML' },
		{ property: 'type', value: 'Cloze' }, { property: 'type', value: 'Obsidian-Basic' },
	]);
	for (const mode of ['and', 'or'] as const) {
		assert.equal(matchesSearch(a, parseSearch('tag: Inbox, missing'), mode), matchesSearch(a, parseSearch('tag:Inbox tag:missing'), mode));
		assert.equal(matchesSearch(a, parseSearch('tag: Inbox, missing'), mode), mode === 'or');
		assert.equal(matchesSearch(a, parseSearch('deck:Sibling type:Cloze'), mode), mode === 'or');
		assert.equal(matchesSearch(a, parseSearch('uml nonexistent'), mode), mode === 'or');
		assert.equal(matchesSearch(a, [], mode), true);
	}
	assert.equal(matchesSearch(a, parseSearch('tag:in box, STUDY / UML')), true);
	assert.equal(matchesSearch(a, parseSearch('type:Basic, Cloze'), 'or'), true);
	assert.deepEqual(parseSearch('front:Hello, world'), [{ property: 'front', value: 'Hello, world' }]);
});

test('deck hierarchy owns each card once; tags are flat independent labels', () => {
	const roots = groupCards([a, b, c], true, false);
	assert.equal(roots.length, 1);
	assert.equal(roots[0]!.name, 'Mother');
	assert.equal(roots[0]!.cards[0], c);
	assert.deepEqual(roots[0]!.children.map((node) => node.name), ['Child', 'Other']);
	assert.equal(collectGroupCards(roots[0]!).length, 3);
	assert.deepEqual(groupCards([a], false, true).map((node) => node.name), ['Inbox', 'Study/UML']);
});

test('combined grouping nests tags inside decks and counts duplicates once', () => {
	const root = groupCards([a, b, c], true, true)[0]!;
	const child = root.children.find((node) => node.name === 'Child')!;
	assert.ok(child.children.every((node) => node.kind === 'tag'));
	assert.equal(child.children.length, 2);
	assert.equal(collectGroupCards(child).length, 1);
	assert.equal(collectGroupCards(root).length, 3);
	assert.deepEqual(selectionState(collectGroupCards(root), new Set([a.key])), { checked: false, indeterminate: true });
	assert.deepEqual(selectionState([a, a], new Set([a.key])), { checked: true, indeterminate: false });
});

test('missing decks/tags do not collide with labels named No deck or Untagged', () => {
	const cards = [card('1.md', '', []), card('2.md', 'No deck', ['Untagged'])];
	assert.equal(groupCards(cards, true, false).length, 2);
	assert.equal(groupCards(cards, false, true).length, 2);
});

test('property search is case/whitespace tolerant and combines fields with AND', () => {
	for (const query of [' tags : iN bOx ', 'DECK: mother :: child', 'anki_tags: study / uml',
		'tags:Inbox type:cloze deck:Mother::Child', 'front: UML구성요소', 'answer:모델링언어',
		'path:A.MD', 'uml 요소', 'tags:"Inbox" type : Cloze', 'anki_deck: Mother::Child']) {
		assert.equal(matchesSearch(a, parseSearch(query)), true, query);
	}
	for (const query of ['deck:Sibling', 'tags:Child', 'tags:Inbox type:Basic', 'status:unregistered']) {
		assert.equal(matchesSearch(a, parseSearch(query)), false, query);
	}
});

test('quotes protect property-like text and multiword property values remain together', () => {
	assert.deepEqual(parseSearch('front:"literal tags:hello" type:Cloze'), [
		{ property: 'front', value: 'literal tags:hello' }, { property: 'type', value: 'Cloze' },
	]);
	assert.equal(matchesSearch(a, parseSearch('back:모델링 언어 type:Cloze')), true);
	assert.equal(matchesSearch({ ...a, registered: false }, parseSearch('status:registered')), false);
});
