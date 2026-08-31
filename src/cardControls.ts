import { Menu, Notice } from 'obsidian';
import type { Component } from 'obsidian';
import { CARD_TYPES } from './cardTypes';
import type { SupportedCardType } from './cardTypes';
import type { AnkiCard } from './types';

export interface CardControlActions {
	onTypeChange?: (type: SupportedCardType) => void | Promise<void>;
	onToggleRegistration?: () => void | Promise<void>;
}

export function renderCardControls(header: HTMLElement, card: AnkiCard, component: Component, actions: CardControlActions): void {
	let menu: Menu | undefined;
	let busy = false;
	const type = header.createEl('button', {
		cls: ['anki-card-manager-badge', 'anki-card-manager-type-selector'],
		text: card.cardType || 'Unknown type',
		attr: { type: 'button', 'aria-label': 'Change card type', 'aria-haspopup': 'menu' },
	});
	type.createSpan({ cls: 'anki-card-manager-type-arrow', text: '▾', attr: { 'aria-hidden': 'true' } });
	const status = header.createEl('button', {
		cls: 'anki-card-manager-registration-toggle', text: card.registered ? 'Registered' : 'Unregistered',
		attr: { type: 'button', 'aria-pressed': String(card.registered),
			'aria-label': card.registered ? 'Unregister card' : 'Register card' },
	});
	type.disabled = !actions.onTypeChange;
	status.disabled = !actions.onToggleRegistration;
	const run = async (action: () => void | Promise<void>): Promise<void> => {
		if (busy) return;
		busy = true;
		type.disabled = status.disabled = true;
		try { await action(); }
		catch (error) { new Notice(error instanceof Error ? error.message : 'Could not update the card.'); }
		finally { busy = false; type.disabled = !actions.onTypeChange; status.disabled = !actions.onToggleRegistration; }
	};
	type.addEventListener('click', (event) => {
		event.preventDefault(); event.stopPropagation();
		if (busy || !actions.onTypeChange) return;
		menu?.hide();
		menu = new Menu();
		for (const definition of CARD_TYPES) {
			menu.addItem((item) => item.setTitle(definition.name).setChecked(card.cardType === definition.name)
				.onClick(() => {
					if (card.cardType !== definition.name) void run(() => actions.onTypeChange?.(definition.name));
				}));
		}
		if (event.detail === 0) {
			const rect = type.getBoundingClientRect();
			menu.showAtPosition({ x: rect.left, y: rect.bottom });
		} else menu.showAtMouseEvent(event);
	});
	status.addEventListener('click', (event) => {
		event.preventDefault(); event.stopPropagation();
		void run(() => actions.onToggleRegistration?.());
	});
	component.register(() => menu?.hide());
}
