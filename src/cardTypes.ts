import { unwrapCloze } from './cloze';

// One registry drives card menus, default choices, separator and icon selection.
// Unknown existing types retain Basic rendering without appearing in the creation menu.
export const CARD_TYPES = [
	{ name: 'Obsidian-Basic', separator: 'Back:', icon: 'anki' },
	{ name: 'Cloze', separator: 'Text:', icon: 'cloze' },
] as const;
export type SupportedCardType = typeof CARD_TYPES[number]['name'];
export type CardIcon = typeof CARD_TYPES[number]['icon'];
export function cardTypeDefinition(name: string) {
	return CARD_TYPES.find((type) => type.name === name.trim()) ?? CARD_TYPES[0];
}
export function convertCardField(value: string, from: string, to: string): string {
	return from === 'Cloze' && to === 'Obsidian-Basic' ? unwrapCloze(value) : value;
}
