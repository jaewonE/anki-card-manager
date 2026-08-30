import assert from 'node:assert/strict';
import test from 'node:test';
import {
	parseAnkiCards,
	registerCardRaw,
	serializeCard,
	unregisterCardRaw,
} from '../src/parser';

const SAMPLE = `<START_ANKI>
Obsidian-Basic
소프트웨어 생명 주기란 무엇인가?
Back:
소프트웨어 기획부터 폐기까지 전 과정을 지칭한다.
<!--ID: 1775887365861-->
<END_ANKI>
`;

test('parses registered card fields and metadata', () => {
	const [card] = parseAnkiCards(SAMPLE, 'study/sdlc.md', {
		deck: '개발::정처기',
		tags: ['정처기', '개발/기초'],
		metadataReady: true,
	});
	assert.ok(card);
	assert.equal(card.registered, true);
	assert.equal(card.cardType, 'Obsidian-Basic');
	assert.equal(card.front, '소프트웨어 생명 주기란 무엇인가?');
	assert.equal(card.back, '소프트웨어 기획부터 폐기까지 전 과정을 지칭한다.');
	assert.equal(card.id, '1775887365861');
	assert.equal(card.sourcePath, 'study/sdlc.md');
	assert.equal(card.metadataReady, true);
	assert.deepEqual(card.tags, ['정처기', '개발/기초']);
	assert.equal(card.raw, SAMPLE);
});

test('parses multiple registered and unregistered cards', () => {
	const unregistered = `<ANKI_START>
Obsidian-Basic
Question 2
Back:
Answer 2
<ANKI_END>`;
	const cards = parseAnkiCards(`${SAMPLE}\nSome text\n${unregistered}`, 'cards.md');
	assert.equal(cards.length, 2);
	assert.equal(cards[0]?.registered, true);
	assert.equal(cards[1]?.registered, false);
	assert.equal(cards[1]?.front, 'Question 2');
	assert.equal(cards[1]?.back, 'Answer 2');
});

test('expands the render range to an exclusive Markdown fence', () => {
	const fenced = `Before

\`\`\`php-template
${SAMPLE}\`\`\`

After
`;
	const [card] = parseAnkiCards(fenced, 'cards.md');
	assert.ok(card);
	assert.equal(card.raw, SAMPLE);
	assert.equal(
		card.renderRaw,
		`\`\`\`php-template\n${SAMPLE}\`\`\`\n`,
	);
	assert.equal(fenced.slice(card.renderFrom, card.renderTo), card.renderRaw);
});

test('unregisters markers and removes only standalone ID lines', () => {
	const withInlineText = SAMPLE.replace(
		'<!--ID: 1775887365861-->',
		'Keep inline `<!--ID: example-->` text.\n\n<!--ID: 1775887365861-->',
	);
	const updated = unregisterCardRaw(withInlineText);
	assert.match(updated, /^<ANKI_START>/);
	assert.match(updated, /<ANKI_END>\n$/);
	assert.doesNotMatch(updated, /^\s*<!--ID:/m);
	assert.match(updated, /`<!--ID: example-->`/);
	assert.match(updated, /text\.\n\n<ANKI_END>/);

	const registeredAgain = registerCardRaw(updated);
	assert.match(registeredAgain, /^<START_ANKI>/);
	assert.match(registeredAgain, /<END_ANKI>\n$/);
	assert.doesNotMatch(registeredAgain, /^\s*<!--ID:/m);
});

test('serializes edits while preserving registration, ID, and CRLF style', () => {
	const crlf = SAMPLE.replace(/\n/g, '\r\n');
	const [card] = parseAnkiCards(crlf, 'cards.md');
	assert.ok(card);
	const updated = serializeCard(card, {
		cardType: 'Obsidian-Basic',
		front: 'Edited question\nSecond line',
		back: 'Edited answer',
	});
	assert.match(updated, /Edited question\r\nSecond line/);
	assert.match(updated, /<!--ID: 1775887365861-->/);
	assert.ok(updated.endsWith('\r\n'));
	const [reparsed] = parseAnkiCards(updated, 'cards.md');
	assert.equal(reparsed?.front, 'Edited question\nSecond line');
	assert.equal(reparsed?.back, 'Edited answer');
});

test('ignores malformed blocks without a Back separator or matching end marker', () => {
	const source = `<START_ANKI>
Obsidian-Basic
No back separator
<END_ANKI>

<START_ANKI>
Obsidian-Basic
Question
Back:
Answer`;
	assert.deepEqual(parseAnkiCards(source), []);
});
