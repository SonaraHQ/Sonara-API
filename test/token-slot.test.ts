import type { SpotifyToken } from "@/types/token.js";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it, vi } from "vitest";
import { TokenSlot } from "@/token/request.js";

const token = (accessToken: string): SpotifyToken => ({ accessToken, accessTokenExpirationTimestampMs: Date.now() + 3_600_000 });

function newSlot(fetcher: () => Promise<SpotifyToken>) {
	return new TokenSlot<SpotifyToken>("test", fetcher, (t) => t.accessTokenExpirationTimestampMs - 60_000);
}

describe("TokenSlot", () => {
	it("shares one fetch between concurrent callers, then serves the cached token", async () => {
		const fetcher = vi.fn(async () => token("a"));
		const slot = newSlot(fetcher);

		const [first, second] = await Promise.all([slot.get(), slot.get()]);
		await slot.get();
		slot.stop();

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(first).toBe(second);
		expect(slot.isReady()).toBe(true);
	});

	it("only invalidates the token that was rejected", async () => {
		const fetcher = vi.fn().mockResolvedValueOnce(token("old")).mockResolvedValueOnce(token("new"));
		const slot = newSlot(fetcher);

		await slot.get();
		slot.invalidate("old");
		expect((await slot.get()).accessToken).toBe("new");

		// A late 401 obtained with the old token must not drop the new one
		slot.invalidate("old");
		expect((await slot.get()).accessToken).toBe("new");
		slot.stop();

		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it("uses a token offered by another slot without fetching", async () => {
		const fetcher = vi.fn(async () => token("fetched"));
		const slot = newSlot(fetcher);

		slot.offer(token("offered"));
		expect((await slot.get()).accessToken).toBe("offered");
		slot.stop();

		expect(fetcher).not.toHaveBeenCalled();
	});

	it("waits for the refresh time instead of re-fetching a token Spotify hands back unchanged", async () => {
		const refreshAt = Date.now() + 200;
		const expiring: SpotifyToken = { accessToken: "old", accessTokenExpirationTimestampMs: Date.now() + 1_000 };
		const fetcher = vi.fn(async () => (Date.now() < refreshAt - 50 ? expiring : token("new")));
		const slot = new TokenSlot<SpotifyToken>("test", fetcher, (t) => (t === expiring ? refreshAt : t.accessTokenExpirationTimestampMs - 60_000));

		slot.offer(expiring);
		expect(slot.isReady()).toBe(true);

		const [first, second] = await Promise.all([slot.get(), slot.get()]);
		const third = await slot.get();
		slot.stop();

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(first.accessToken).toBe("new");
		expect(second).toBe(first);
		expect(third).toBe(first);
	});

	it("surfaces a failed fetch as a 503", async () => {
		const slot = newSlot(async () => {
			throw new Error("browser crashed");
		});

		const error = await slot.get().catch((err: unknown) => err);
		expect(error).toBeInstanceOf(HTTPException);
		expect((error as HTTPException).status).toBe(503);
		expect(slot.isReady()).toBe(false);
	});
});
