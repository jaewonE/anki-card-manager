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

test('property exclusion parses aliases, comma lists and positive/negative boundaries', () => {
	assert.deepEqual(parseSearch('uml -TaGs : t1, t2 type:Cloze -anki_deck: Mother :: Child, Other -front:"literal -tag:t3"'), [
		{ property: '', value: 'uml' },
		{ property: 'tags', value: 't1', exclude: true }, { property: 'tags', value: 't2', exclude: true },
		{ property: 'type', value: 'Cloze' },
		{ property: 'anki_deck', value: 'Mother :: Child', exclude: true }, { property: 'anki_deck', value: 'Other', exclude: true },
		{ property: 'front', value: 'literal -tag:t3', exclude: true },
	]);
	assert.deepEqual(parseSearch('-tags:t1 type:Cloze -tags:t2'), [
		{ property: 'tags', value: 't1', exclude: true }, { property: 'type', value: 'Cloze' }, { property: 'tags', value: 't2', exclude: true },
	]);
});

test('comma exclusions reject either tag in AND and OR, including exclusion-only searches', () => {
	const cards = [card('none.md', 'Inbox', []), card('one.md', 'Inbox', ['t1']),
		card('two.md', 'Inbox', ['t2']), card('both.md', 'Inbox', ['t1', 't2'])];
	for (const mode of ['and', 'or'] as const) {
		for (const query of ['-tag:t1,t2', '-tags:t1 -anki_tags:t2']) {
			assert.deepEqual(cards.filter((item) => matchesSearch(item, parseSearch(query), mode)).map((item) => item.sourcePath), ['none.md']);
		}
		assert.equal(matchesSearch(cards[1]!, parseSearch('-tag: T 1 , missing'), mode), false);
		assert.equal(matchesSearch(cards[0]!, parseSearch('-tag:missing'), mode), true);
	}
});

test('exclusions override positive OR matches without changing positive AND/OR behavior', () => {
	const query = parseSearch('deck:missing type:Cloze -tag:Study/UML');
	assert.equal(matchesSearch(a, query, 'or'), false, 'a positive match cannot override an exclusion');
	assert.equal(matchesSearch(b, query, 'or'), true);
	assert.equal(matchesSearch(b, query, 'and'), false);
	assert.equal(matchesSearch(c, parseSearch('missing -tag:Inbox'), 'or'), false, 'passing exclusion alone is not a positive OR match');
	assert.equal(matchesSearch(a, parseSearch('-tag:Inbox tag:Inbox'), 'or'), false);
	assert.equal(matchesSearch(b, parseSearch('uml -tag:Study/UML'), 'and'), true);
	assert.equal(matchesSearch(a, parseSearch('uml -tag:Study/UML'), 'and'), false);
});

test('exclusions support every existing property alias and preserve status exact matching', () => {
	const target = { ...a, id: 'AbC123' };
	for (const query of ['deck:mother :: child', 'anki_deck:ＭＯＴＨＥＲ', 'tags:in box', 'tag:INBOX', 'anki_tags:Study/UML',
		'type:Cloze', 'front:UML 구성', 'question:UML 구성', 'back:모델링 언어', 'answer:모델링 언어',
		'path:A.MD', 'source:a.md', 'id:abc123', 'status:registered']) {
		assert.equal(matchesSearch(target, parseSearch(query)), true, query);
		for (const mode of ['and', 'or'] as const) assert.equal(matchesSearch(target, parseSearch(`-${query}`), mode), false, query);
	}
	assert.equal(matchesSearch(target, parseSearch('-status:unregistered')), true);
	assert.equal(matchesSearch({ ...target, registered: false }, parseSearch('-status:registered')), true);
	assert.equal(matchesSearch({ ...target, registered: false }, parseSearch('-status:unregistered')), false);
	assert.equal(matchesSearch({ ...target, id: undefined }, parseSearch('-id:123')), true);
	assert.equal(matchesSearch({ ...target, deck: '', tags: [] }, parseSearch('-deck:Inbox -tags:Inbox')), true);
	assert.equal(matchesSearch(target, parseSearch('-type:Basic,Cloze')), false);
	assert.equal(matchesSearch(target, parseSearch('-deck:Other,Mother::Child')), false);
});

test('quoted property text, unknown properties and literal hyphens do not become exclusions', () => {
	assert.deepEqual(parseSearch('"-tag:t1" front:"literal -type:Cloze"'), [
		{ property: '', value: '-tag:t1' }, { property: 'front', value: 'literal -type:Cloze' },
	]);
	for (const text of ['-word', '--tag:t1', '-unknown:t1', 'prefix-tag:t1']) {
		assert.deepEqual(parseSearch(text), [{ property: '', value: text }]);
	}
	assert.deepEqual(parseSearch('tag:-t1'), [{ property: 'tag', value: '-t1' }]);
	assert.deepEqual(parseSearch('-front:Hello, world'), [{ property: 'front', value: 'Hello, world', exclude: true }]);
	assert.equal(matchesSearch({ ...a, front: 'literal -type:Cloze' }, parseSearch('-front:"literal -type:Cloze"')), false);
});

test('empty exclusion values are ignored while entering or clearing a query', () => {
	for (const query of ['-tag:', '-tag: , , -type: ', '-status:', '-deck:""']) {
		assert.deepEqual(parseSearch(query), []);
		for (const mode of ['and', 'or'] as const) assert.equal(matchesSearch(a, parseSearch(query), mode), true);
	}
	assert.deepEqual(parseSearch('-tag: , t1,, -type: -source: a.md'), [
		{ property: 'tag', value: 't1', exclude: true }, { property: 'source', value: 'a.md', exclude: true },
	]);
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
