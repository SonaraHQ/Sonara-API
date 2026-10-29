import type { SpotifyToken, SpotifyClientToken } from "@/types/token.js";
import { setTimeout as sleep } from "node:timers/promises";
import { SpotifyBrowser } from "@/token/browser.js";
import { TokenSlot } from "@/token/request.js";
import { config } from "@/config/env.js";
import { clientIp } from "@/utils/ip.js";
import { logs } from "@/utils/logger.js";
import type { Context } from "hono";

// Refresh this long before expiry so callers never get a stale token
const REFRESH_MARGIN_MS = 60_000;
// Spotify hands back the same sp_dc token until it expires, so an early refresh only re-fetches it
const ACCOUNT_REFRESH_DELAY_MS = 2_000;
const INIT_ATTEMPTS = 3;
const SP_DC = config.spotifySpDc;

type AnonymousTokens = { access: SpotifyToken; client: SpotifyClientToken };

export class SpotifyTokenHandler {
	private browser = new SpotifyBrowser();
	private anonymous: Promise<AnonymousTokens> | undefined;

	// Both anonymous tokens come from the same page load: whichever slot refreshes also feeds the other
	public readonly access: TokenSlot<SpotifyToken> = new TokenSlot<SpotifyToken>(
		"access",
		async () => {
			const { access, client } = await this.fetchAnonymous();
			this.client.offer(client);
			return access;
		},
		(token) => token.accessTokenExpirationTimestampMs - REFRESH_MARGIN_MS,
	);

	public readonly client: TokenSlot<SpotifyClientToken> = new TokenSlot<SpotifyClientToken>(
		"client",
		async () => {
			const { access, client } = await this.fetchAnonymous();
			this.access.offer(access);
			return client;
		},
		(token) => token.refreshAfterTimestampMs ?? token.accessTokenExpirationTimestampMs - REFRESH_MARGIN_MS,
	);

	// Logged-in token for lyrics, only when SPOTIFY_SP_DC is set
	public readonly account: TokenSlot<SpotifyToken> | undefined = SP_DC
		? new TokenSlot<SpotifyToken>(
				"account",
				() => this.browser.fetchAccountToken(SP_DC),
				(token) => token.accessTokenExpirationTimestampMs + ACCOUNT_REFRESH_DELAY_MS,
			)
		: undefined;

	constructor() {
		void this.warmUp(this.access);
		void this.warmUp(this.client);
		if (this.account) void this.warmUp(this.account);
	}

	// Both slots refreshing at once share a single browser launch
	private fetchAnonymous(): Promise<AnonymousTokens> {
		this.anonymous ??= this.browser.fetchAnonymousTokens().finally(() => {
			this.anonymous = undefined;
		});
		return this.anonymous;
	}

	private async warmUp<T extends SpotifyToken>(slot: TokenSlot<T>): Promise<void> {
		const start = Date.now();
		for (let attempt = 1; attempt <= INIT_ATTEMPTS; attempt++) {
			try {
				await slot.get();
				logs("info", `Initial Spotify ${slot.name} token fetched in ${Date.now() - start}ms`);
				return;
			} catch (err) {
				logs("warn", `Failed to fetch initial Spotify ${slot.name} token (attempt ${attempt})`, err);
				if (attempt < INIT_ATTEMPTS) await sleep(2000 * attempt);
			}
		}
	}

	public async cleanup(): Promise<void> {
		this.access.stop();
		this.client.stop();
		this.account?.stop();
		await this.browser.close();
	}

	public async getToken(): Promise<SpotifyToken> {
		return this.access.get();
	}

	public invalidate(accessToken: string): void {
		this.access.invalidate(accessToken);
	}

	public hasAccount(): boolean {
		return this.account !== undefined;
	}

	// Read from memory only, never triggers a fetch
	public status(): { access: boolean; client: boolean; account?: boolean } {
		return { access: this.access.isReady(), client: this.client.isReady(), ...(this.account && { account: this.account.isReady() }) };
	}

	public async getAccountToken(): Promise<SpotifyToken> {
		if (!this.account) throw new Error("SPOTIFY_SP_DC is not set");
		return this.account.get();
	}

	public invalidateAccount(accessToken: string): void {
		this.account?.invalidate(accessToken);
	}

	public async getClientToken(): Promise<SpotifyClientToken> {
		return this.client.get();
	}

	public honoHandler = (c: Context) => this.serve(c, this.access, (token) => token);

	public clientTokenHonoHandler = (c: Context) => this.serve(c, this.client, (token) => token.raw);

	// A failure is thrown to the app's error handler, which answers 503 with the reason
	private async serve<T extends SpotifyToken>(c: Context, slot: TokenSlot<T>, serialize: (token: T) => unknown): Promise<Response> {
		const start = Date.now();
		try {
			return c.json(serialize(await slot.get()), 200);
		} finally {
			logs("info", `Handled Spotify ${slot.name} token request from IP: ${clientIp(c)}, UA: ${c.req.header("user-agent") ?? "no ua"} in ${Date.now() - start}ms`);
		}
	}
}
