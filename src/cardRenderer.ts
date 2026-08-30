import { Component, MarkdownRenderer, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type { AnkiCard } from './types';

export interface CardRenderOptions {
	compact?: boolean;
	showSource?: boolean;
}

export function renderAnkiCard(
	app: App,
	container: HTMLElement,
	card: AnkiCard,
	component: Component,
	options: CardRenderOptions = {},
): HTMLDetailsElement {
	const details = container.createEl('details', {
		cls: options.compact
			? ['anki-card-manager-card', 'is-compact']
			: 'anki-card-manager-card',
	});
	const summary = details.createEl('summary', {
		cls: 'anki-card-manager-summary',
	});
	const icon = summary.createSpan({ cls: 'anki-card-manager-summary-icon' });
	setIcon(icon, 'message-circle-question');

	const question = summary.createDiv({ cls: 'anki-card-manager-question' });
	void MarkdownRenderer.render(
		app,
		card.front || '*Empty question*',
		question,
		card.sourcePath,
		component,
	);

	const badges = summary.createDiv({ cls: 'anki-card-manager-badges' });
	badges.createSpan({
		cls: 'anki-card-manager-badge',
		text: card.cardType || 'Unknown type',
	});
	if (!card.registered) {
		badges.createSpan({
			cls: ['anki-card-manager-badge', 'is-muted'],
			text: 'Unregistered',
		});
	}

	const answer = details.createDiv({ cls: 'anki-card-manager-answer' });
	answer.createDiv({ cls: 'anki-card-manager-answer-label', text: 'Answer' });
	const answerContent = answer.createDiv({
		cls: 'anki-card-manager-answer-content',
	});
	void MarkdownRenderer.render(
		app,
		card.back || '*Empty answer*',
		answerContent,
		card.sourcePath,
		component,
	);

	if (options.showSource) {
		const metadata = details.createDiv({ cls: 'anki-card-manager-card-metadata' });
		metadata.createSpan({ text: card.deck || 'No deck' });
		metadata.createSpan({ text: card.tags.join(' · ') || 'No tags' });
		metadata.createSpan({ text: `${card.sourcePath}:${card.startLine + 1}` });
	}

	return details;
}
