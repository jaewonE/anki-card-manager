import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAnkiCards, serializeCard, unregisterCardRaw, registerCardRaw } from '../src/parser';
import { hasOwnClosingMarker } from '../src/completion';
import { groupAdjacentCards } from '../src/cardGrouping';
import { prepareClozeMarkdown } from '../src/cloze';

const cloze = '<START_ANKI>\nCloze\n**UML**이란 무엇인가?\nText:\n{{c1: 표준화된 언어}} {{c1::사물}} {{c2::관계}}\n<!--ID: 123-->\n<END_ANKI>\n';

test('Cloze exclusively uses Text and preserves tokens, IDs and line endings on edit', () => {
	const original = cloze.replace(/\n/g, '\r\n');
	const card = parseAnkiCards(original)[0]!;
	assert.equal(card.cardType, 'Cloze');
	assert.match(card.back, /\{\{c1: 표준화된 언어\}\}/);
	assert.equal(serializeCard(card, card), original);
	assert.equal(parseAnkiCards(cloze.replace('Text:', 'Back:')).length, 0);
	assert.equal(parseAnkiCards(cloze.replace('Cloze', 'Obsidian-Basic')).length, 0);
	const basic = serializeCard(card, { ...card, cardType: 'Obsidian-Basic' });
	assert.equal(parseAnkiCards(basic)[0]?.cardType, 'Obsidian-Basic');
	assert.match(basic, /\r\nBack:\r\n/);
});

test('Cloze registration toggles preserve body and never rewrite cloze notation', () => {
	const unregistered = unregisterCardRaw(cloze);
	assert.equal(parseAnkiCards(unregistered)[0]?.registered, false);
	assert.equal(parseAnkiCards(unregistered)[0]?.back, parseAnkiCards(cloze)[0]?.back);
	assert.equal(registerCardRaw(unregistered), cloze.replace('<!--ID: 123-->\n', ''));
});

test('cloze tokenization supports single/double colons, repeated IDs, hints and Markdown', () => {
	const result = prepareClozeMarkdown('**UML** {{c1: 언어}} {{c1::**사물**}} {{c20::`<<>>`::기호}}');
	assert.deepEqual(result.blanks.map((blank) => blank.answer), [' 언어', '**사물**', '`<<>>`']);
	assert.equal(new Set(result.blanks.map((blank) => blank.token)).size, 3);
	assert.doesNotMatch(result.markdown, /언어|사물|기호/);
	assert.equal(prepareClozeMarkdown('{{c1::unfinished').blanks.length, 0);
});

test('completion stops at its own closer but not a nested start, even inline', () => {
	assert.equal(hasOwnClosingMarker('\nCloze\nQ\nText:\nA\n<END_ANKI>'), true);
	assert.equal(hasOwnClosingMarker('\n\n<START_ANKI>asd<END_ANKI>'), false);
	assert.equal(hasOwnClosingMarker('\n<ANKI_START>other<ANKI_END>\n<END_ANKI>'), false);
	assert.equal(hasOwnClosingMarker('\n<END_ANKI>\n<START_ANKI>'), true);
	assert.equal(hasOwnClosingMarker('\nno closer'), false);
});

test('consecutive cards share a group only across whitespace or exclusive fences', () => {
	const source = `\`\`\`\n${cloze}\`\`\`\n\n${cloze}\nParagraph\n${cloze}`;
	assert.deepEqual(groupAdjacentCards(source, parseAnkiCards(source)).map((group) => group.length), [2, 1]);
	const malformed = `<START_ANKI>\nbroken\n${cloze}`;
	assert.equal(parseAnkiCards(malformed).length, 1);
	assert.equal(parseAnkiCards(malformed)[0]?.cardType, 'Cloze');
});
