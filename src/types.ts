export type CardPlacement = 'inline' | 'document-end';

export interface AnkiCardManagerSettings {
	cardPlacement: CardPlacement;
	autoCompleteCards: boolean;
	defaultCardType: string;
	defaultDeck: string;
	defaultTag: string;
}

export interface AnkiCard {
	key: string;
	sourcePath: string;
	registered: boolean;
	cardType: string;
	front: string;
	back: string;
	id?: string;
	deck: string;
	tags: string[];
	metadataReady: boolean;
	from: number;
	to: number;
	renderFrom: number;
	renderTo: number;
	startLine: number;
	endLine: number;
	raw: string;
	renderRaw: string;
}

export interface CardMetadata {
	deck: string;
	tags: string[];
	metadataReady: boolean;
}

export interface CardEdit {
	cardType: string;
	front: string;
	back: string;
}
