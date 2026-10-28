import { Cache } from "@/services/cache.service.js";
import { tokenHandler } from "@/token/index.js";

const LYRICS_BASE = "https://spclient.wg.spotify.com/color-lyrics/v2/track/";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
// "No lyrics" answers are kept in memory only, so new lyrics show up later
const NOT_FOUND_TTL_MS = 6 * 3_600_000;

export interface LyricsResult {
	found: boolean;
	// Spotify's `lyrics` object: syncType, lines[{ startTimeMs, words, endTimeMs }], provider, providerDisplayName, language
	lyrics?: unknown;
}

const lyricsCache = new Cache<LyricsResult>({ disk: "lyrics" });

export function lyricsEnabled(): boolean {
	return tokenHandler.hasAccount();
}

// color-lyrics needs a logged-in token plus a client token, like the web player sends
async function requestLyrics(trackId: string, retry = true): Promise<LyricsResult> {
	const [account, client] = await Promise.all([tokenHandler.getAccountToken(), tokenHandler.getClientToken()]);

	const response = await fetch(`${LYRICS_BASE}${encodeURIComponent(trackId)}?format=json&vocalRemoval=false&market=from_token`, {
		headers: {
			Authorization: `Bearer ${account.accessToken}`,
			"client-token": client.accessToken,
			"app-platform": "WebPlayer",
			Accept: "application/json",
			"User-Agent": USER_AGENT,
		},
	});

	if (response.status === 404) return { found: false };
	if (response.status === 401 && retry) {
		tokenHandler.invalidateAccount();
		return requestLyrics(trackId, false);
	}
	if (!response.ok) throw new Error(`Spotify lyrics error -> ${response.status} ${response.statusText}`);

	const data = (await response.json()) as { lyrics?: unknown };
	return data?.lyrics ? { found: true, lyrics: data.lyrics } : { found: false };
}

export async function fetchLyrics(trackId: string): Promise<LyricsResult> {
	return lyricsCache.getOrLoad(trackId, async () => {
		const result = await requestLyrics(trackId);
		return result.found ? { value: result } : { value: result, ttl: NOT_FOUND_TTL_MS, persist: false };
	});
}
