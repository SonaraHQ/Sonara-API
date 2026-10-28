import path from "node:path";

// Native .env loading (no dotenv); the file is optional, real env vars take precedence
try {
	process.loadEnvFile();
} catch (err) {
	if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}

export const HOUR = 3_600_000;
const MB = 1024 * 1024;

function stringEnv(name: string): string | undefined {
	return process.env[name]?.trim() || undefined;
}

function numberEnv(name: string, fallback: number): number {
	const raw = stringEnv(name);
	const value = raw ? Number(raw) : Number.NaN;
	return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function booleanEnv(name: string): boolean {
	return ["1", "true", "yes"].includes(stringEnv(name)?.toLowerCase() ?? "");
}

export const config = {
	port: numberEnv("PORT", 1500),
	browserPath: stringEnv("BROWSER_PATH"),
	// Clients must send it (Authorization: Bearer, X-API-Key or ?key=) when set
	apiKey: stringEnv("API_KEY"),
	// Requests per minute and per IP, 0 = no limit
	rateLimitPerMinute: numberEnv("RATE_LIMIT_PER_MINUTE", 0),
	// Read the client IP from X-Forwarded-For / X-Real-IP, only safe behind a reverse proxy
	trustProxy: booleanEnv("TRUST_PROXY"),
	cacheDir: path.resolve(stringEnv("CACHE_DIR") ?? "cache"),
	// Total size of the JSON kept in memory, shared by every cache
	memoryMaxBytes: Math.max(numberEnv("CACHE_MEMORY_MAX_MB", 200), 1) * MB,
	memoryTtlMs: numberEnv("CACHE_MEMORY_TTL_HOURS", 12) * HOUR,
	// 0 = never expires
	diskTtlMs: numberEnv("CACHE_DISK_TTL_HOURS", 24) * HOUR,
	// sp_dc cookie of a Spotify account, needed for /lyrics (Spotify only serves lyrics to logged-in users)
	spotifySpDc: stringEnv("SPOTIFY_SP_DC"),
	// Country code sent as `market` to the Web API: full tracks get `is_playable` instead of the heavy `available_markets` list
	spotifyMarket: stringEnv("SPOTIFY_MARKET")?.toUpperCase(),
	// Persisted query hashes of the web player, overridable when Spotify rotates them
	playlistHash: stringEnv("SPOTIFY_PLAYLIST_HASH") ?? "a65e12194ed5fc443a1cdebed5fabe33ca5b07b987185d63c72483867ad13cb4",
	recommendationsHash: stringEnv("SPOTIFY_RECOMMENDATIONS_HASH") ?? "c77098ee9d6ee8ad3eb844938722db60570d040b49f41f5ec6e7be9160a7c86b",
};
