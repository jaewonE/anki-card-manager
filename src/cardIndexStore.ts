import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { AnkiCard } from './types';

export interface CardIndexFileRecord {
	path: string;
	mtime: number;
	size: number;
	parserSignature: string;
	markerSignature: string;
	cardCount: number;
	error: string;
	indexedAt: number;
}

export interface CardIndexStoreSnapshot {
	files: CardIndexFileRecord[];
	cards: AnkiCard[];
}

export interface CardIndexStore {
	open(): Promise<void>;
	load(): Promise<CardIndexStoreSnapshot>;
	replaceAll(snapshot: CardIndexStoreSnapshot): Promise<void>;
	replaceFile(file: CardIndexFileRecord, cards: readonly AnkiCard[]): Promise<void>;
	removeFile(path: string): Promise<void>;
	clear(): Promise<void>;
	close(): void;
}

interface CardIndexDatabase extends DBSchema {
	files: {
		key: string;
		value: CardIndexFileRecord;
	};
	cards: {
		key: string;
		value: AnkiCard;
		indexes: { 'by-source': string };
	};
}

const DATABASE_VERSION = 1;

export class IndexedDbCardIndexStore implements CardIndexStore {
	private database?: IDBPDatabase<CardIndexDatabase>;

	constructor(private readonly databaseName: string) {}

	async open(): Promise<void> {
		if (this.database) return;
		this.database = await openDB<CardIndexDatabase>(this.databaseName, DATABASE_VERSION, {
			upgrade(database) {
				if (!database.objectStoreNames.contains('files')) database.createObjectStore('files', { keyPath: 'path' });
				if (!database.objectStoreNames.contains('cards')) {
					const cards = database.createObjectStore('cards', { keyPath: 'key' });
					cards.createIndex('by-source', 'sourcePath');
				}
			},
			terminated: () => { this.database = undefined; },
		});
	}

	async load(): Promise<CardIndexStoreSnapshot> {
		const database = await this.getDatabase();
		const [files, cards] = await Promise.all([
			database.getAll('files'),
			database.getAll('cards'),
		]);
		return { files, cards };
	}

	async replaceAll(snapshot: CardIndexStoreSnapshot): Promise<void> {
		const database = await this.getDatabase();
		const transaction = database.transaction(['files', 'cards'], 'readwrite');
		const fileStore = transaction.objectStore('files');
		const cardStore = transaction.objectStore('cards');
		await Promise.all([
			fileStore.clear(),
			cardStore.clear(),
		]);
		await Promise.all([
			...snapshot.files.map((file) => fileStore.put(file)),
			...snapshot.cards.map((card) => cardStore.put(card)),
		]);
		await transaction.done;
	}

	async replaceFile(file: CardIndexFileRecord, cards: readonly AnkiCard[]): Promise<void> {
		const database = await this.getDatabase();
		const transaction = database.transaction(['files', 'cards'], 'readwrite');
		const cardStore = transaction.objectStore('cards');
		const oldKeys = await cardStore.index('by-source').getAllKeys(file.path);
		await Promise.all([
			...oldKeys.map((key) => cardStore.delete(key)),
			...cards.map((card) => cardStore.put(card)),
			transaction.objectStore('files').put(file),
		]);
		await transaction.done;
	}

	async removeFile(path: string): Promise<void> {
		const database = await this.getDatabase();
		const transaction = database.transaction(['files', 'cards'], 'readwrite');
		const cardStore = transaction.objectStore('cards');
		const oldKeys = await cardStore.index('by-source').getAllKeys(path);
		await Promise.all([
			...oldKeys.map((key) => cardStore.delete(key)),
			transaction.objectStore('files').delete(path),
		]);
		await transaction.done;
	}

	async clear(): Promise<void> {
		const database = await this.getDatabase();
		const transaction = database.transaction(['files', 'cards'], 'readwrite');
		await Promise.all([
			transaction.objectStore('files').clear(),
			transaction.objectStore('cards').clear(),
		]);
		await transaction.done;
	}

	close(): void {
		this.database?.close();
		this.database = undefined;
	}

	private async getDatabase(): Promise<IDBPDatabase<CardIndexDatabase>> {
		await this.open();
		if (!this.database) throw new Error('Card index database is unavailable.');
		return this.database;
	}
}

export class MemoryCardIndexStore implements CardIndexStore {
	private readonly files = new Map<string, CardIndexFileRecord>();
	private readonly cards = new Map<string, AnkiCard>();

	async open(): Promise<void> { await Promise.resolve(); }
	async load(): Promise<CardIndexStoreSnapshot> {
		await Promise.resolve();
		return { files: [...this.files.values()], cards: [...this.cards.values()] };
	}
	async replaceAll(snapshot: CardIndexStoreSnapshot): Promise<void> {
		await Promise.resolve();
		this.files.clear();
		this.cards.clear();
		for (const file of snapshot.files) this.files.set(file.path, file);
		for (const card of snapshot.cards) this.cards.set(card.key, card);
	}
	async replaceFile(file: CardIndexFileRecord, cards: readonly AnkiCard[]): Promise<void> {
		await Promise.resolve();
		for (const [key, card] of this.cards) if (card.sourcePath === file.path) this.cards.delete(key);
		for (const card of cards) this.cards.set(card.key, card);
		this.files.set(file.path, file);
	}
	async removeFile(path: string): Promise<void> {
		await Promise.resolve();
		for (const [key, card] of this.cards) if (card.sourcePath === path) this.cards.delete(key);
		this.files.delete(path);
	}
	async clear(): Promise<void> {
		await Promise.resolve();
		this.files.clear();
		this.cards.clear();
	}
	close(): void {}
}
