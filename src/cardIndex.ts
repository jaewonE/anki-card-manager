import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import { cardMetadataFromSource } from './metadata';
import type { CardMarkers } from './markers';
import { parseAnkiCards } from './parser';
import { createCardSearchIndex } from './managerSearch';
import type { AnkiCard } from './types';
import {
	IndexedDbCardIndexStore,
	MemoryCardIndexStore,
} from './cardIndexStore';
import type {
	CardIndexFileRecord,
	CardIndexStore,
	CardIndexStoreSnapshot,
} from './cardIndexStore';

const PARSER_SIGNATURE = 'anki-card-manager-parser-v1';
const CHANGE_DEBOUNCE_MS = 350;
const RECONCILE_CONCURRENCY = 4;

export interface CardIndexSnapshot {
	cards: readonly AnkiCard[];
	failures: number;
	syncing: boolean;
	persistent: boolean;
	progress: CardIndexProgress;
}

export interface CardIndexProgress {
	completed: number;
	total: number;
}

export interface ManagerCardSource {
	snapshot(): CardIndexSnapshot;
	subscribe(listener: () => void): () => void;
	refresh(force?: boolean): Promise<void>;
	refreshPaths(paths: readonly string[]): Promise<void>;
	rebuild(): Promise<void>;
}

function markerSignature(markers: CardMarkers): string {
	return JSON.stringify([
		markers.registeredStart,
		markers.registeredEnd,
		markers.unregisteredStart,
		markers.unregisteredEnd,
	]);
}

function errorMessage(error: unknown): string {
	if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message;
	return 'Could not read or parse this file.';
}

export class CardIndexService implements ManagerCardSource {
	private store: CardIndexStore;
	private readonly files = new Map<string, CardIndexFileRecord>();
	private readonly cardsByFile = new Map<string, AnkiCard[]>();
	private readonly listeners = new Set<() => void>();
	private readonly scheduledPaths = new Set<string>();
	private cards: AnkiCard[] = [];
	private syncing = false;
	private persistent = true;
	private progress: CardIndexProgress = { completed: 0, total: 0 };
	private initialized = false;
	private refreshPromise?: Promise<void>;
	private rebuildPromise?: Promise<void>;
	private fallbackPromise?: Promise<void>;
	private scheduleTimer?: number;
	private operationTail: Promise<void> = Promise.resolve();

	constructor(
		private readonly app: App,
		private readonly getMarkers: () => CardMarkers,
		databaseName: string,
		store?: CardIndexStore,
	) {
		this.store = store ?? new IndexedDbCardIndexStore(databaseName);
		this.persistent = !(store instanceof MemoryCardIndexStore);
	}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		let stored;
		try {
			await this.store.open();
			stored = await this.store.load();
		} catch (error) {
			await this.switchToMemoryStore(error);
			stored = await this.store.load();
		}
		const signature = markerSignature(this.getMarkers());
		if (stored.files.some((file) => file.parserSignature !== PARSER_SIGNATURE || file.markerSignature !== signature)) {
			await this.store.clear();
		} else {
			for (const file of stored.files) this.files.set(file.path, file);
			for (const card of stored.cards) {
				const cards = this.cardsByFile.get(card.sourcePath) ?? [];
				cards.push(card);
				this.cardsByFile.set(card.sourcePath, cards);
			}
			this.rebuildCards();
		}
		this.initialized = true;
		this.notify();
	}

	snapshot(): CardIndexSnapshot {
		return {
			cards: this.cards,
			failures: [...this.files.values()].filter((file) => file.error).length,
			syncing: this.syncing,
			persistent: this.persistent,
			progress: this.progress,
		};
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async refresh(force = false): Promise<void> {
		await this.initialize();
		if (this.refreshPromise) {
			await this.refreshPromise;
			if (force) return this.refresh(true);
			return;
		}
		this.refreshPromise = this.enqueue(() => this.reconcile(force))
			.finally(() => { this.refreshPromise = undefined; });
		return this.refreshPromise;
	}

	async refreshPaths(paths: readonly string[]): Promise<void> {
		await this.initialize();
		const uniquePaths = [...new Set(paths)];
		if (!uniquePaths.length) return;
		return this.enqueue(() => this.updatePaths(uniquePaths));
	}

	schedule(file: TFile): void {
		if (file.extension !== 'md') return;
		this.scheduledPaths.add(file.path);
		if (this.scheduleTimer !== undefined) window.clearTimeout(this.scheduleTimer);
		this.scheduleTimer = window.setTimeout(() => {
			this.scheduleTimer = undefined;
			const paths = [...this.scheduledPaths];
			this.scheduledPaths.clear();
			void this.refreshPaths(paths);
		}, CHANGE_DEBOUNCE_MS);
	}

	async remove(filePath: string): Promise<void> {
		this.unschedule(filePath);
		await this.initialize();
		return this.enqueue(() => this.updatePaths([filePath]));
	}

	async rename(file: TFile, oldPath: string): Promise<void> {
		this.unschedule(oldPath);
		this.unschedule(file.path);
		await this.initialize();
		return this.enqueue(() => this.updatePaths(file.extension === 'md' ? [oldPath, file.path] : [oldPath]));
	}

	async rebuild(): Promise<void> {
		if (this.rebuildPromise) return this.rebuildPromise;
		await this.initialize();
		if (this.rebuildPromise) return this.rebuildPromise;
		this.rebuildPromise = this.enqueue(async () => {
			const previous = await this.store.load();
			try {
				try { await this.store.clear(); }
				catch (error) { await this.switchToMemoryStore(error); await this.store.clear(); }
				this.files.clear();
				this.cardsByFile.clear();
				// Keep showing the last complete projection until the replacement is ready.
				await this.reconcile(true, true);
			} catch (error) {
				await this.restoreSnapshot(previous);
				throw error;
			}
		}).finally(() => { this.rebuildPromise = undefined; });
		return this.rebuildPromise;
	}

	dispose(): void {
		if (this.scheduleTimer !== undefined) window.clearTimeout(this.scheduleTimer);
		this.scheduleTimer = undefined;
		this.scheduledPaths.clear();
		this.listeners.clear();
		this.store.close();
	}

	private enqueue(operation: () => Promise<void>): Promise<void> {
		const run = this.operationTail.then(operation, operation);
		this.operationTail = run.catch(() => {});
		return run;
	}

	private unschedule(path: string): void {
		this.scheduledPaths.delete(path);
		if (!this.scheduledPaths.size && this.scheduleTimer !== undefined) {
			window.clearTimeout(this.scheduleTimer);
			this.scheduleTimer = undefined;
		}
	}

	private async updatePaths(paths: readonly string[]): Promise<void> {
		this.syncing = true;
		this.progress = { completed: 0, total: paths.length };
		this.notify();
		try {
			for (const path of paths) {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile && file.extension === 'md') await this.indexFile(file);
				else await this.removePath(path);
				this.advanceProgress();
			}
			this.rebuildCards();
		} finally {
			this.syncing = false;
			this.notify();
		}
	}

	private async reconcile(force: boolean, failOnFileErrors = false): Promise<void> {
		this.syncing = true;
		try {
			const markdownFiles = this.app.vault.getMarkdownFiles();
			const paths = new Set(markdownFiles.map((file) => file.path));
			for (const path of [...this.files.keys()]) if (!paths.has(path)) await this.removePath(path);
			const signature = markerSignature(this.getMarkers());
			const pending = markdownFiles.filter((file) => {
				const indexed = this.files.get(file.path);
				return force || !indexed || indexed.mtime !== file.stat.mtime || indexed.size !== file.stat.size ||
					indexed.parserSignature !== PARSER_SIGNATURE || indexed.markerSignature !== signature;
			});
			this.progress = { completed: 0, total: pending.length };
			this.notify();
			let next = 0;
			const worker = async (): Promise<void> => {
				while (next < pending.length) {
					const file = pending[next];
					next += 1;
					if (file) {
						await this.indexFile(file);
						this.advanceProgress();
					}
				}
			};
			await Promise.all(Array.from({ length: Math.min(RECONCILE_CONCURRENCY, pending.length) }, worker));
			if (failOnFileErrors) {
				const failures = [...this.files.values()].filter((file) => file.error);
				if (failures.length) {
					const first = failures[0];
					throw new Error(`Could not rebuild ${failures.length} Markdown ${failures.length === 1 ? 'file' : 'files'}` +
						`${first ? ` (${first.path}: ${first.error})` : ''}.`);
				}
			}
			this.rebuildCards();
		} finally {
			this.syncing = false;
			this.notify();
		}
	}

	private async indexFile(file: TFile): Promise<void> {
		let cards: AnkiCard[] = [];
		let error = '';
		try {
			const source = await this.app.vault.cachedRead(file);
			cards = parseAnkiCards(source, file.path, cardMetadataFromSource(source), this.getMarkers())
				.map((card) => ({ ...card, search: createCardSearchIndex(card) }));
		} catch (caught) {
			error = errorMessage(caught);
		}
		const record: CardIndexFileRecord = {
			path: file.path,
			mtime: file.stat.mtime,
			size: file.stat.size,
			parserSignature: PARSER_SIGNATURE,
			markerSignature: markerSignature(this.getMarkers()),
			cardCount: cards.length,
			error,
			indexedAt: Date.now(),
		};
		try { await this.store.replaceFile(record, cards); }
		catch (storeError) {
			await this.switchToMemoryStore(storeError);
			await this.store.replaceFile(record, cards);
		}
		this.files.set(file.path, record);
		this.cardsByFile.set(file.path, cards);
	}

	private async removePath(path: string): Promise<void> {
		if (!this.files.has(path) && !this.cardsByFile.has(path)) return;
		try { await this.store.removeFile(path); }
		catch (error) { await this.switchToMemoryStore(error); await this.store.removeFile(path); }
		this.files.delete(path);
		this.cardsByFile.delete(path);
	}

	private rebuildCards(): void {
		this.cards = [...this.cardsByFile.values()].flat().sort((a, b) =>
			a.sourcePath.localeCompare(b.sourcePath) || a.startLine - b.startLine);
	}

	private advanceProgress(): void {
		const completed = Math.min(this.progress.total, this.progress.completed + 1);
		this.progress = { ...this.progress, completed };
		const interval = Math.max(1, Math.ceil(this.progress.total / 100));
		if (completed === this.progress.total || completed % interval === 0) this.notify();
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}

	private async restoreSnapshot(snapshot: CardIndexStoreSnapshot): Promise<void> {
		try { await this.store.replaceAll(snapshot); }
		catch (error) {
			await this.switchToMemoryStore(error);
			await this.store.replaceAll(snapshot);
		}
		this.files.clear();
		this.cardsByFile.clear();
		for (const file of snapshot.files) this.files.set(file.path, file);
		for (const card of snapshot.cards) {
			const cards = this.cardsByFile.get(card.sourcePath) ?? [];
			cards.push(card);
			this.cardsByFile.set(card.sourcePath, cards);
		}
		this.rebuildCards();
		this.notify();
	}

	private async switchToMemoryStore(error: unknown): Promise<void> {
		if (!this.persistent) return;
		if (!this.fallbackPromise) {
			this.fallbackPromise = (async () => {
				console.error('Anki Card Manager: persistent index unavailable; using memory for this session.', error);
				this.store.close();
				const memory = new MemoryCardIndexStore();
				await memory.open();
				for (const [path, file] of this.files) await memory.replaceFile(file, this.cardsByFile.get(path) ?? []);
				this.store = memory;
				this.persistent = false;
				this.notify();
			})().finally(() => { this.fallbackPromise = undefined; });
		}
		await this.fallbackPromise;
	}
}
