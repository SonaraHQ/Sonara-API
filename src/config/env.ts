import "dotenv/config";
import path from "node:path";

const HOUR = 3_600_000;

function numberEnv(name: string, fallback: number): number {
	const value = Number(process.env[name]);
	return Number.isFinite(value) && value >= 0 ? value : fallback;
};

export const config = {
	port: numberEnv("PORT", 1500),
	browserPath: process.env.BROWSER_PATH?.trim() || undefined,
	cacheDir: path.resolve(process.env.CACHE_DIR?.trim() || "cache"),
	// In-memory cache lifetime
	memoryTtlMs: numberEnv("CACHE_MEMORY_TTL_HOURS", 12) * HOUR,
	// On-disk cache lifetime, 0 = never expires
	diskTtlMs: numberEnv("CACHE_DISK_TTL_HOURS", 24) * HOUR,
};
