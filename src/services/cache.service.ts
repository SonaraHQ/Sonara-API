import { createHash, randomUUID } from "node:crypto";
import { config } from "@/config/env.js";
import { logs } from "@/utils/logger.js";
import { LRUCache } from "lru-cache";
import fs from "node:fs/promises";
import path from "node:path";

export interface CacheEntry {
	body: string;
	etag: string;
}

interface SetOptions {
	ttl?: number;
	persist?: boolean;
}

// Shared by every cache, so CACHE_MEMORY_MAX_MB bounds the whole process. Entries stay serialized:
// a JSON string takes a fraction of the memory of the parsed object and is sent as is
const memory = new LRUCache<string, CacheEntry>({
	maxSize: config.memoryMaxBytes,
	sizeCalculation: (entry) => Buffer.byteLength(entry.body) || 1,
	ttl: config.memoryTtlMs,
	ttlAutopurge: true,
	updateAgeOnGet: true,
});

function toEntry(body: string): CacheEntry {
	return { body, etag: `W/"${createHash("sha1").update(body).digest("base64url")}"` };
}

// Two-level cache (memory LRU + JSON files) with in-flight request de-duplication
export class Cache<T> {
	private inflight = new Map<string, Promise<CacheEntry>>();
	private readonly name: string;
	private readonly dir: string | undefined;

	// `name` is also the sub-folder of the cache dir, `disk: false` keeps entries in memory only
	constructor(name: string, options: { disk?: boolean } = {}) {
		this.name = name;
		this.dir = options.disk === false ? undefined : path.join(config.cacheDir, name);
	}

	private memoryKey(key: string): string {
		return `${this.name}:${key}`;
	}

	private file(key: string): string | undefined {
		return this.dir ? path.join(this.dir, `${encodeURIComponent(key)}.json`) : undefined;
	}

	private async readDisk(key: string): Promise<CacheEntry | undefined> {
		const file = this.file(key);
		if (!file) return undefined;

		try {
			if (config.diskTtlMs > 0) {
				const { mtimeMs } = await fs.stat(file);
				if (Date.now() - mtimeMs > config.diskTtlMs) return undefined;
			}
			const body = await fs.readFile(file, "utf-8");
			JSON.parse(body);
			return toEntry(body);
		} catch {
			return undefined;
		}
	}

	// Written to a temporary file then renamed, so a crash never leaves a truncated JSON behind
	private async writeDisk(key: string, body: string): Promise<void> {
		const file = this.file(key);
		if (!file) return;

		const tmp = `${file}.${randomUUID()}.tmp`;
		try {
			await fs.mkdir(path.dirname(file), { recursive: true });
			await fs.writeFile(tmp, body, "utf-8");
			await fs.rename(tmp, file);
		} catch (err) {
			logs("warn", `Failed to write cache file -> ${file}`, err);
			await fs.unlink(tmp).catch(() => {});
		}
	}

	public async get(key: string): Promise<CacheEntry | undefined> {
		const cached = memory.get(this.memoryKey(key));
		if (cached) return cached;

		const fromDisk = await this.readDisk(key);
		if (fromDisk) memory.set(this.memoryKey(key), fromDisk);
		return fromDisk;
	}

	public set(key: string, value: T, options: SetOptions = {}): CacheEntry {
		const entry = toEntry(JSON.stringify(value));
		memory.set(this.memoryKey(key), entry, options.ttl ? { ttl: options.ttl } : undefined);
		if (options.persist !== false) void this.writeDisk(key, entry.body);
		return entry;
	}

	// Returns the cached entry or runs `load` once, even under concurrent calls for the same key
	public async getOrLoad(key: string, load: () => Promise<{ value: T } & SetOptions>): Promise<CacheEntry> {
		const cached = memory.get(this.memoryKey(key));
		if (cached) return cached;

		const pending = this.inflight.get(key);
		if (pending) return pending;

		// Registered before the disk read: a caller arriving during that read must join, not load a second time
		const promise = (async () => {
			const fromDisk = await this.get(key);
			if (fromDisk) return fromDisk;

			const { value, ...options } = await load();
			return this.set(key, value, options);
		})().finally(() => this.inflight.delete(key));

		this.inflight.set(key, promise);
		return promise;
	}

	public value(entry: CacheEntry): T {
		return JSON.parse(entry.body) as T;
	}
}

export async function pruneDiskCache(): Promise<void> {
	if (config.diskTtlMs <= 0) return;

	let removed = 0;
	const now = Date.now();
	const entries = await fs.readdir(config.cacheDir, { recursive: true, withFileTypes: true }).catch(() => []);

	await Promise.all(
		entries
			// .tmp files are leftovers of writes interrupted by a crash
			.filter((entry) => entry.isFile() && (entry.name.endsWith(".json") || entry.name.endsWith(".tmp")))
			.map(async (entry) => {
				const file = path.join(entry.parentPath, entry.name);
				try {
					const { mtimeMs } = await fs.stat(file);
					if (now - mtimeMs > config.diskTtlMs) {
						await fs.unlink(file);
						removed++;
					}
				} catch {}
			}),
	);

	if (removed) logs("info", `Pruned ${removed} expired cache file(s)`);
}
