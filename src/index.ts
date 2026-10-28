import { config, HOUR } from "@/config/env.js";
import { rateLimit } from "@/middlewares/rate-limit.js";
import spotifyRoutes from "@/routes/spotify.routes.js";
import { pruneDiskCache } from "@/services/cache.service.js";
import { tokenHandler } from "@/token/index.js";
import { onError } from "@/middlewares/error.js";
import { apiKey } from "@/middlewares/auth.js";
import { logs } from "@/utils/logger.js";
import { serve } from "@hono/node-server";
import { compress } from "hono/compress";
import { setTimeout as sleep } from "node:timers/promises";
import { readFileSync } from "node:fs";
import { Hono } from "hono";

const PRUNE_INTERVAL_MS = 6 * HOUR;
// Fits Docker's default 10s stop timeout, PM2's kill_timeout is raised to match in ecosystem.config.cjs
const SHUTDOWN_TIMEOUT_MS = 8_000;
// Resolves to the project root from both src/ and dist/
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as { version: string };

const app = new Hono();

// Playlist payloads are large JSON: gzip cuts them by ~90% when the client accepts it
app.use(compress());

// Registered before the rate limit and the API key so monitoring keeps working.
// No outbound call: safe to poll as often as needed. 503 until the anonymous tokens are available
app.get("/health", (c) => {
	const tokens = tokenHandler.status();
	const ok = tokens.access && tokens.client;
	return c.json({ status: ok ? "ok" : "degraded", uptimeSeconds: Math.round(process.uptime()), tokens }, ok ? 200 : 503);
});

if (config.rateLimitPerMinute > 0) app.use(rateLimit(config.rateLimitPerMinute));
if (config.apiKey) app.use(apiKey(config.apiKey));

app.get("/", (c) => {
	return c.json({
		name: "Sonara-API",
		version,
		endpoints: {
			playlist: {
				byId: "/playlist/:id",
				byUrl: "/playlist?url=<spotify-playlist-url>",
			},
			playlistFull: {
				byId: "/playlist/full/:id",
				byUrl: "/playlist/full?url=<spotify-playlist-url>",
				notes: "Required: every request must include client_id and client_secret as query params or x-spotify-client-id/x-spotify-client-secret (or x-client-id/x-client-secret) headers",
			},
			recommendations: {
				byId: "/recommendations/:id?limit=5",
				byUrl: "/recommendations?url=<spotify-track-url>&limit=5",
			},
			recommendationsFull: {
				byId: "/recommendations/full/:id?limit=5",
				byUrl: "/recommendations/full?url=<spotify-track-url>&limit=5",
			},
			lyrics: {
				byId: "/lyrics/:id",
				byUrl: "/lyrics?url=<spotify-track-url>",
				notes: "Requires SPOTIFY_SP_DC",
			},
			token: {
				access: "/spotifytoken",
				client: "/clienttoken",
			},
			health: "/health",
		},
	});
});

app.get("/spotifytoken", tokenHandler.honoHandler);
app.get("/clienttoken", tokenHandler.clientTokenHonoHandler);
app.route("/", spotifyRoutes);

app.notFound((c) => {
	return c.json({ error: "Not Found" }, 404);
});

app.onError(onError);

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
	logs("info", `Listening on http://localhost:${info.port}`);
});

void pruneDiskCache();
setInterval(() => void pruneDiskCache(), PRUNE_INTERVAL_MS).unref();

let shuttingDown = false;

// Stops accepting connections and lets in-flight requests finish, within SHUTDOWN_TIMEOUT_MS
async function shutdown(signal: string) {
	if (shuttingDown) return;
	shuttingDown = true;
	logs("info", `${signal} received, shutting down...`);

	const closed = new Promise<void>((resolve) => server.close(() => resolve()));
	// close() only drops the connections idle at call time: keep-alive sockets freed by finishing requests would hold it open
	const sweep = setInterval(() => "closeIdleConnections" in server && server.closeIdleConnections(), 100);
	await Promise.race([closed, sleep(SHUTDOWN_TIMEOUT_MS)]);
	clearInterval(sweep);
	await tokenHandler.cleanup();
	process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

export default app;
