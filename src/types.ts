import type { CardMarkers } from './markers';
export type CardPlacement = 'inline' | 'document-end';

export interface AnkiCardManagerSettings {
	indexNamespace?: string;
	cardPlacement: CardPlacement;
	placementMigrationId?: string;
	truncateTitles: boolean;
	autoCompleteCards: boolean;
	defaultCardType: string;
	defaultDeck: string;
	defaultTag: string;
	markers: CardMarkers;
}

export interface AnkiCard {
	markers: CardMarkers;
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
	search?: CardSearchIndex;
}

export interface CardSearchIndex {
	front: string;
	back: string;
	cardType: string;
	deck: string;
	tags: string[];
	sourcePath: string;
	id: string;
	all: string[];
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
