import { config } from "@/config/env.js";
import { logs } from "@/utils/logger.js";
import { LRUCache } from "lru-cache";
import fs from "node:fs/promises";
import path from "node:path";

interface CacheOptions {
	// Sub-folder of the cache dir, omit to keep entries in memory only
	disk?: string;
	max?: number;
};

interface SetOptions {
	ttl?: number;
	persist?: boolean;
};

// Two-level cache (memory LRU + JSON files) with in-flight request de-duplication
export class Cache<T extends {}> {
	private memory: LRUCache<string, T>;
	private inflight = new Map<string, Promise<T>>();
	private dir: string | undefined;

	constructor(options: CacheOptions = {}) {
		this.memory = new LRUCache<string, T>({
			max: options.max ?? 1000,
			ttl: config.memoryTtlMs,
			ttlAutopurge: true,
			updateAgeOnGet: true,
		});
		this.dir = options.disk ? path.join(config.cacheDir, options.disk) : undefined;
	};

	private file(key: string): string | undefined {
		return this.dir ? path.join(this.dir, `${encodeURIComponent(key)}.json`) : undefined;
	};

	private async readDisk(key: string): Promise<T | undefined> {
		const file = this.file(key);
		if (!file) return undefined;

		try {
			if (config.diskTtlMs > 0) {
				const { mtimeMs } = await fs.stat(file);
				if (Date.now() - mtimeMs > config.diskTtlMs) return undefined;
			};
			return JSON.parse(await fs.readFile(file, "utf-8")) as T;
		} catch {
			return undefined;
		};
	};

	private async writeDisk(key: string, value: T): Promise<void> {
		const file = this.file(key);
		if (!file) return;

		try {
			await fs.mkdir(path.dirname(file), { recursive: true });
			await fs.writeFile(file, JSON.stringify(value), "utf-8");
		} catch (err) {
			logs("warn", `Failed to write cache file -> ${file}`, err);
		};
	};

	public async get(key: string): Promise<T | undefined> {
		const cached = this.memory.get(key);
		if (cached) return cached;

		const fromDisk = await this.readDisk(key);
		if (fromDisk) this.memory.set(key, fromDisk);
		return fromDisk;
	};

	public set(key: string, value: T, options: SetOptions = {}): void {
		this.memory.set(key, value, options.ttl ? { ttl: options.ttl } : undefined);
		if (options.persist !== false) void this.writeDisk(key, value);
	};

	// Returns the cached value or runs `load` once, even under concurrent calls for the same key
	public async getOrLoad(key: string, load: () => Promise<{ value: T } & SetOptions>): Promise<T> {
		const cached = await this.get(key);
		if (cached) return cached;

		const pending = this.inflight.get(key);
		if (pending) return pending;

		const promise = load()
			.then(({ value, ...options }) => {
				this.set(key, value, options);
				return value;
			})
			.finally(() => this.inflight.delete(key));

		this.inflight.set(key, promise);
		return promise;
	};
};

// Removes expired cache files so the folder does not grow forever
export async function pruneDiskCache(): Promise<void> {
	if (config.diskTtlMs <= 0) return;

	let removed = 0;
	const now = Date.now();
	const entries = await fs.readdir(config.cacheDir, { recursive: true, withFileTypes: true }).catch(() => []);

	await Promise.all(
		entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
			.map(async (entry) => {
				const file = path.join(entry.parentPath, entry.name);
				try {
					const { mtimeMs } = await fs.stat(file);
					if (now - mtimeMs > config.diskTtlMs) {
						await fs.unlink(file);
						removed++;
					};
				} catch {};
			}),
	);

	if (removed) logs("info", `Pruned ${removed} expired cache file(s)`);
};
