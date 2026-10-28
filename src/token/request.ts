import type { SpotifyToken } from "@/types/token.js";
import { logs } from "@/utils/logger.js";

// Treat a token as expired slightly early to absorb clock skew and request latency
const VALIDITY_MARGIN_MS = 10_000;
const RETRY_DELAY_MS = 30_000;
// Floor between background refreshes: a token returned already close to expiry
// (or server clock skew) would otherwise schedule a 0ms refresh and loop
const MIN_REFRESH_DELAY_MS = 30_000;

// One cached token with single-flight refresh and a background refresh timer
export class TokenSlot<T extends SpotifyToken> {
	private token: T | undefined;
	private pending: Promise<T> | undefined;
	private timer: NodeJS.Timeout | undefined;

	public readonly name: string;
	private readonly fetcher: () => Promise<T>;
	private readonly refreshAt: (token: T) => number;

	constructor(name: string, fetcher: () => Promise<T>, refreshAt: (token: T) => number) {
		this.name = name;
		this.fetcher = fetcher;
		this.refreshAt = refreshAt;
	};

	private valid(): boolean {
		return (this.token?.accessTokenExpirationTimestampMs ?? 0) - VALIDITY_MARGIN_MS > Date.now();
	};

	private schedule(delay: number): void {
		clearTimeout(this.timer);
		this.timer = setTimeout(async () => {
			try {
				const token = await this.refresh();
				logs("info", `Spotify ${this.name} token auto-refreshed (expires in ${Math.round((token.accessTokenExpirationTimestampMs - Date.now()) / 1000)}s)`);
			} catch (err) {
				logs("warn", `Failed to auto-refresh Spotify ${this.name} token`, err);
				this.schedule(RETRY_DELAY_MS);
			};
		}, Math.max(delay, MIN_REFRESH_DELAY_MS));
	};

	// Concurrent callers share the same in-flight fetch
	private refresh(): Promise<T> {
		this.pending ??= this.fetcher()
			.then((token) => {
				this.token = token;
				this.schedule(this.refreshAt(token) - Date.now());
				return token;
			})
			.finally(() => {
				this.pending = undefined;
			});
		return this.pending;
	};

	public async get(): Promise<T> {
		if (this.token && this.valid()) return this.token;
		return this.refresh();
	};

	public invalidate(): void {
		this.token = undefined;
	};

	public stop(): void {
		clearTimeout(this.timer);
		this.timer = undefined;
	};
};
