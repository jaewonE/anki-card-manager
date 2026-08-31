import { MarkdownView, TFile } from 'obsidian';
import type { App } from 'obsidian';
import {
	parseAnkiCards,
	registerCardRaw,
	serializeCard,
	unregisterCardRaw,
} from './parser';
import type { AnkiCard, CardEdit } from './types';
import type { SupportedCardType } from './cardTypes';

export class CardConflictError extends Error {
	constructor() {
		super('The card changed after the manager loaded it. Refresh and try again.');
		this.name = 'CardConflictError';
	}
}

function resolveCurrentCard(source: string, card: AnkiCard): AnkiCard {
	if (
		source.slice(card.from, card.to) === card.raw &&
		source.slice(card.renderFrom, card.renderTo) === card.renderRaw
	) {
		return card;
	}
	const cards = parseAnkiCards(source, card.sourcePath, undefined, card.markers);
	if (card.id) {
		const idMatches = cards.filter((candidate) => candidate.id === card.id);
		if (idMatches.length === 1 && idMatches[0]) return idMatches[0];
	}
	const rawMatches = cards.filter((candidate) => candidate.raw === card.raw);
	if (rawMatches.length === 1 && rawMatches[0]) return rawMatches[0];
	throw new CardConflictError();
}

async function mutateCard(
	app: App,
	card: AnkiCard,
	transform: (current: AnkiCard) => string,
	includeFence = false,
): Promise<void> {
	const abstractFile = app.vault.getAbstractFileByPath(card.sourcePath);
	if (!(abstractFile instanceof TFile)) {
		throw new Error(`Source file no longer exists: ${card.sourcePath}`);
	}
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const view = leaf.view;
		if (view instanceof MarkdownView && view.file?.path === card.sourcePath) {
			await view.save();
		}
	}
	await app.vault.process(abstractFile, (source) => {
		const current = resolveCurrentCard(source, card);
		const from = includeFence ? current.renderFrom : current.from;
		const to = includeFence ? current.renderTo : current.to;
		return `${source.slice(0, from)}${transform(current)}${source.slice(to)}`;
	});
}

export async function deleteCard(app: App, card: AnkiCard): Promise<void> {
	await mutateCard(app, card, () => '', true);
}

export async function toggleCardRegistration(
	app: App,
	card: AnkiCard,
): Promise<void> {
	await mutateCard(app, card, (current) =>
		current.registered
			? unregisterCardRaw(current.raw, current.markers)
			: registerCardRaw(current.raw, current.markers),
	);
}

export async function updateCard(
	app: App,
	card: AnkiCard,
	edit: CardEdit,
): Promise<void> {
	await mutateCard(app, card, (current) => serializeCard(current, edit));
}

export async function changeCardType(app: App, card: AnkiCard, type: SupportedCardType): Promise<void> {
	await mutateCard(app, card, (current) => serializeCard(current, { ...current, cardType: type }));
}
