import type { SpotifyToken, SpotifyClientToken } from "@/types/token.js";
import { getConnInfo } from "@hono/node-server/conninfo";
import { SpotifyBrowser } from "@/token/browser.js";
import { TokenSlot } from "@/token/request.js";
import { config } from "@/config/env.js";
import { logs } from "@/utils/logger.js";
import type { Context } from "hono";

// Refresh this long before expiry so callers never get a stale token
const REFRESH_MARGIN_MS = 60_000;
const INIT_ATTEMPTS = 3;

export class SpotifyTokenHandler {
	private browser = new SpotifyBrowser();

	public readonly access = new TokenSlot<SpotifyToken>("access", () => this.browser.fetchToken(), (token) => token.accessTokenExpirationTimestampMs - REFRESH_MARGIN_MS);

	public readonly client = new TokenSlot<SpotifyClientToken>(
		"client",
		() => this.browser.fetchClientToken(),
		(token) => token.refreshAfterTimestampMs ?? token.accessTokenExpirationTimestampMs - REFRESH_MARGIN_MS,
	);

	// Logged-in token for lyrics, only when SPOTIFY_SP_DC is set
	public readonly account: TokenSlot<SpotifyToken> | undefined = config.spotifySpDc
		? new TokenSlot<SpotifyToken>(
				"account",
				() => this.browser.fetchAccountToken(config.spotifySpDc!),
				(token) => token.accessTokenExpirationTimestampMs - REFRESH_MARGIN_MS,
			)
		: undefined;

	constructor() {
		void this.warmUp(this.access);
		void this.warmUp(this.client);
		if (this.account) void this.warmUp(this.account);
	};

	private async warmUp<T extends SpotifyToken>(slot: TokenSlot<T>): Promise<void> {
		const start = Date.now();
		for (let attempt = 1; attempt <= INIT_ATTEMPTS; attempt++) {
			try {
				await slot.get();
				logs("info", `Initial Spotify ${slot.name} token fetched in ${Date.now() - start}ms`);
				return;
			} catch (err) {
				logs("warn", `Failed to fetch initial Spotify ${slot.name} token (attempt ${attempt})`, err);
				if (attempt < INIT_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
			};
		};
	};

	public async cleanup(): Promise<void> {
		this.access.stop();
		this.client.stop();
		this.account?.stop();
		await this.browser.close();
	};

	// In-process access for the resolver (replaces the HTTP call to /spotifytoken)
	public async getToken(): Promise<SpotifyToken> {
		return this.access.get();
	};

	public invalidate(): void {
		this.access.invalidate();
	};

	public hasAccount(): boolean {
		return this.account !== undefined;
	};

	// Token availability for /health, read from memory only
	public status(): { access: boolean; client: boolean; account?: boolean } {
		return { access: this.access.isReady(), client: this.client.isReady(), ...(this.account && { account: this.account.isReady() }) };
	};

	public async getAccountToken(): Promise<SpotifyToken> {
		if (!this.account) throw new Error("SPOTIFY_SP_DC is not set");
		return this.account.get();
	};

	public invalidateAccount(): void {
		this.account?.invalidate();
	};

	public async getClientToken(): Promise<SpotifyClientToken> {
		return this.client.get();
	};

	public honoHandler = (c: Context) => this.serve(c, this.access, (token) => token);

	public clientTokenHonoHandler = (c: Context) => this.serve(c, this.client, (token) => token.raw);

	private async serve<T extends SpotifyToken>(c: Context, slot: TokenSlot<T>, serialize: (token: T) => unknown): Promise<Response> {
		const start = Date.now();

		let response: Response;
		try {
			response = c.json(serialize(await slot.get()), 200);
		} catch (err) {
			logs("error", err);
			response = c.json({}, 500);
		};

		logs(
			"info",
			`Handled Spotify ${slot.name} token request from IP: ${getRealIp(c)}, UA: ${c.req.header("user-agent") ?? "no ua"} in ${Date.now() - start}ms`,
		);
		return response;
	};
};

const getRealIp = (c: Context): string => {
	const xff = c.req.header("x-forwarded-for");
	let ip = xff?.split(",")[0]?.trim() || c.req.header("x-real-ip") || getConnInfo(c)?.remote?.address || "unknown";

	if (ip === "::1") ip = "127.0.0.1";
	if (ip.startsWith("::ffff:")) ip = ip.slice(7);

	return ip;
};
