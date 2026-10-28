import { Cache } from "@/services/cache.service.js";
import { describe, expect, it, vi } from "vitest";
import { config } from "@/config/env.js";
import fs from "node:fs/promises";
import path from "node:path";

// Unique names: the memory LRU is shared by every Cache instance
let counter = 0;
function newCache<T>(options?: { disk?: boolean }) {
	const name = `test-${process.pid}-${++counter}`;
	const dir = path.join(config.cacheDir, name);
	return { cache: new Cache<T>(name, options), dir, files: () => fs.readdir(dir).catch(() => []) };
}

describe("Cache", () => {
	it("runs a single load for concurrent requests on the same key", async () => {
		const { cache } = newCache<{ n: number }>();
		const load = vi.fn(async () => ({ value: { n: 1 } }));

		const [a, b] = await Promise.all([cache.getOrLoad("key", load), cache.getOrLoad("key", load)]);
		const c = await cache.getOrLoad("key", load);

		expect(load).toHaveBeenCalledTimes(1);
		expect(a).toBe(b);
		expect(c.body).toBe('{"n":1}');
		expect(cache.value(c)).toEqual({ n: 1 });
	});

	it("never caches a failed load", async () => {
		const { cache } = newCache<string>();
		const load = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ value: "ok" });

		await expect(cache.getOrLoad("key", load)).rejects.toThrow("boom");
		expect(cache.value(await cache.getOrLoad("key", load))).toBe("ok");
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("gives the same ETag to the same content only", () => {
		const { cache } = newCache<{ n: number }>({ disk: false });

		expect(cache.set("a", { n: 1 }).etag).toBe(cache.set("b", { n: 1 }).etag);
		expect(cache.set("c", { n: 2 }).etag).not.toBe(cache.set("a", { n: 1 }).etag);
		expect(cache.set("a", { n: 1 }).etag).toMatch(/^W\/".+"$/);
	});

	it("writes persisted entries to disk, without leftover temporary files", async () => {
		const { cache, dir, files } = newCache<{ n: number }>();
		cache.set("key", { n: 1 });

		await vi.waitFor(async () => expect(await files()).toEqual(["key.json"]));
		expect(await fs.readFile(path.join(dir, "key.json"), "utf-8")).toBe('{"n":1}');
	});

	it("keeps `persist: false` entries in memory only", async () => {
		const { cache, files } = newCache<{ n: number }>();
		const entry = cache.set("key", { n: 1 }, { persist: false });

		expect(await cache.get("key")).toBe(entry);
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(await files()).toEqual([]);
	});
});
