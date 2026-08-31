import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_MARKERS, replaceTriggers, validateMarkers } from '../src/markers';
import { parseAnkiCards, registerCardRaw, unregisterCardRaw, serializeCard } from '../src/parser';
import { hasOwnClosingMarker } from '../src/completion';
import { unwrapCloze } from '../src/cloze';
import { cardTypeDefinition } from '../src/cardTypes';

const markers = { registeredStart: '[RS.$]', registeredEnd: '[RE.$]', unregisteredStart: '[US.$]', unregisteredEnd: '[UE.$]' };
const source = '<START_ANKI>\nCloze\n{{c1:Question}}\nText:\n{{c1::**Something**}} {{c2: other}}\n<!--ID: 123-->\n<END_ANKI>\n';

test('all marker consumers honor custom regex-special triggers and preserve IDs/line endings', () => {
	const custom = replaceTriggers(source.replace(/\n/g, '\r\n'), DEFAULT_MARKERS, markers);
	assert.equal(parseAnkiCards(custom).length, 0);
	const card = parseAnkiCards(custom, '', undefined, markers)[0]!;
	assert.equal(card.id, '123');
	assert.equal(serializeCard(card, card), custom);
	const disabled = unregisterCardRaw(custom, markers);
	assert.ok(disabled.startsWith(markers.unregisteredStart));
	assert.ok(disabled.endsWith(markers.unregisteredEnd + '\r\n'));
	assert.equal(parseAnkiCards(disabled, '', undefined, markers)[0]!.registered, false);
	assert.ok(registerCardRaw(disabled, markers).startsWith(markers.registeredStart));
	assert.equal(hasOwnClosingMarker('body' + markers.registeredEnd, markers), true);
	assert.equal(hasOwnClosingMarker(markers.registeredStart + 'body' + markers.registeredEnd, markers), false);
});

test('trigger replacement is simultaneous, literal, global and non-cascading for swaps', () => {
	const swap = { registeredStart: DEFAULT_MARKERS.unregisteredStart, registeredEnd: DEFAULT_MARKERS.unregisteredEnd,
		unregisteredStart: DEFAULT_MARKERS.registeredStart, unregisteredEnd: DEFAULT_MARKERS.registeredEnd };
	const mixed = source + '<ANKI_START> prose <ANKI_END> ' + source;
	assert.equal(replaceTriggers(replaceTriggers(mixed, DEFAULT_MARKERS, swap), swap, DEFAULT_MARKERS), mixed);
	assert.equal(replaceTriggers('x <START_ANKI> <START_ANKI> y', DEFAULT_MARKERS, markers), 'x [RS.$] [RS.$] y');
});

test('invalid trigger sets fail before replacement', () => {
	for (const registeredStart of ['', ' x', 'x\ny', DEFAULT_MARKERS.registeredEnd, 'ANKI']) {
		assert.throws(() => validateMarkers({ ...DEFAULT_MARKERS, registeredStart }));
	}
});

test('Cloze to Basic unwraps single/double-colon answers, hints, nesting and Markdown', () => {
	assert.equal(unwrapCloze('{{c1::outer {{c2:inner}}}} {{c2::`code`::hint}} {{not-cloze}}'), 'outer inner `code` {{not-cloze}}');
	const card = parseAnkiCards(source)[0]!;
	const basic = parseAnkiCards(serializeCard(card, { ...card, cardType: 'Obsidian-Basic' }))[0]!;
	assert.equal(basic.front, 'Question');
	assert.equal(basic.back, '**Something**  other');
	assert.equal(basic.id, '123');
	const cloze = parseAnkiCards(serializeCard(basic, { ...basic, cardType: 'Cloze' }))[0]!;
	assert.equal(cloze.back, basic.back);
	assert.equal(cardTypeDefinition('future-type').icon, 'anki');
	assert.equal(cardTypeDefinition('Cloze').icon, 'cloze');
});
