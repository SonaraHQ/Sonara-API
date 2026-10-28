import path from "node:path";

// Native .env loading (no dotenv); the file is optional, real env vars take precedence
try {
	process.loadEnvFile();
} catch (err) {
	if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}

const HOUR = 3_600_000;

function numberEnv(name: string, fallback: number): number {
	const raw = process.env[name]?.trim();
	const value = raw ? Number(raw) : Number.NaN;
	return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export const config = {
	port: numberEnv("PORT", 1500),
	browserPath: process.env.BROWSER_PATH?.trim() || undefined,
	cacheDir: path.resolve(process.env.CACHE_DIR?.trim() || "cache"),
	// In-memory cache lifetime
	memoryTtlMs: numberEnv("CACHE_MEMORY_TTL_HOURS", 12) * HOUR,
	// On-disk cache lifetime, 0 = never expires
	diskTtlMs: numberEnv("CACHE_DISK_TTL_HOURS", 24) * HOUR,
	// sp_dc cookie of a Spotify account, needed for /lyrics (Spotify only serves lyrics to logged-in users)
	spotifySpDc: process.env.SPOTIFY_SP_DC?.trim() || undefined,
};
