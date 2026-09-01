import { Component, MarkdownRenderer, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type { AnkiCard } from './types';
import { renderAnkiIcon } from './ankiIcon';
import { renderClozeAnswer } from './clozeRenderer';
import { renderCardControls } from './cardControls';
import type { CardControlActions } from './cardControls';

export interface CardRenderOptions extends CardControlActions {
	compact?: boolean;
	showSource?: boolean;
	truncateTitle?: boolean;
	onSizeChange?: () => void;
	onEdit?: () => void;
	initiallyOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
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
	details.classList.toggle('is-unregistered', !card.registered);
	details.classList.toggle('is-title-truncated', options.truncateTitle ?? false);
	const summary = details.createEl('summary', {
		cls: 'anki-card-manager-summary',
	});
	const icon = summary.createSpan({ cls: 'anki-card-manager-summary-icon' });
	renderAnkiIcon(icon, card.registered, card.cardType);

	const question = summary.createDiv({ cls: 'anki-card-manager-question' });
	const questionRender = MarkdownRenderer.render(
		app,
		card.front || '*Empty question*',
		question,
		card.sourcePath,
		component,
	);
	const watchRenderedSize = (render: Promise<void>, root: HTMLElement): void => {
		void render
			.then(() => {
				options.onSizeChange?.();
				for (const image of Array.from(root.querySelectorAll<HTMLImageElement>('img'))) {
					if (!image.complete) image.addEventListener('load', () => options.onSizeChange?.(), { once: true });
				}
			})
			.catch((error: unknown) => {
				console.error('Anki Card Manager: failed to render card Markdown', error);
				options.onSizeChange?.();
			});
	};
	watchRenderedSize(questionRender, question);

	if (options.onEdit) {
		const edit = summary.createEl('button', {
			cls: 'anki-card-manager-edit-source',
			attr: { type: 'button', 'aria-label': 'Edit card source', title: 'Edit source' },
		});
		setIcon(edit, 'pencil');
		edit.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			options.onEdit?.();
		});
	}

	let metadata: HTMLDivElement | undefined;
	let answerStarted = false;
	const renderAnswer = (): void => {
		if (answerStarted) return;
		answerStarted = true;
		const answer = details.createDiv({ cls: 'anki-card-manager-answer' });
		if (metadata) details.insertBefore(answer, metadata);
		const answerHeader = answer.createDiv({ cls: 'anki-card-manager-answer-header' });
		renderCardControls(answerHeader, card, component, options);
		const answerContent = answer.createDiv({ cls: 'anki-card-manager-answer-content' });
		const answerRender = card.cardType === 'Cloze'
			? renderClozeAnswer(app, card.back, answerContent, answerHeader, details, card.sourcePath, component, options.onSizeChange)
			: MarkdownRenderer.render(
				app,
				card.back || '*Empty answer*',
				answerContent,
				card.sourcePath,
				component,
			);
		watchRenderedSize(answerRender, answer);
	};
	details.addEventListener('toggle', () => {
		options.onOpenChange?.(details.open);
		if (details.open) renderAnswer();
		options.onSizeChange?.();
	});

	if (options.showSource) {
		metadata = details.createDiv({ cls: 'anki-card-manager-card-metadata' });
		metadata.createSpan({ text: card.deck || 'No deck' });
		metadata.createSpan({ text: card.tags.join(' · ') || 'No tags' });
		metadata.createSpan({ text: `${card.sourcePath}:${card.startLine + 1}` });
	}
	if (options.initiallyOpen) {
		details.open = true;
		options.onOpenChange?.(true);
		renderAnswer();
	}

	return details;
}
