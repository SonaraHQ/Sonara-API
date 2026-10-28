import { config } from "@/config/env.js";
import spotifyRoutes from "@/routes/spotify.routes.js";
import { pruneDiskCache } from "@/services/cache.service.js";
import { tokenHandler } from "@/token/index.js";
import { logs } from "@/utils/logger.js";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { compress } from "hono/compress";

const PRUNE_INTERVAL_MS = 6 * 3_600_000;

const app = new Hono()
	// Playlist payloads are large JSON: gzip cuts them by ~90% when the client accepts it
	.use(compress())
	.get("/", (c) => {
		return c.json({
			name: "Solify - Spotify Resolver API",
			version: "1.1.0",
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
	})
	// No outbound call: safe to poll as often as needed. 503 until the anonymous tokens are available
	.get("/health", (c) => {
		const tokens = tokenHandler.status();
		const ok = tokens.access && tokens.client;
		return c.json({ status: ok ? "ok" : "degraded", uptimeSeconds: Math.round(process.uptime()), tokens }, ok ? 200 : 503);
	})
	.get("/spotifytoken", tokenHandler.honoHandler)
	.get("/clienttoken", tokenHandler.clientTokenHonoHandler)
	.route("/", spotifyRoutes)
	.notFound((c) => {
		return c.json({ error: "Not Found" }, 404);
	})
	.onError((err, c) => {
		logs("error", err.message);
		return c.json({ error: err.message }, 500);
	});

serve({ fetch: app.fetch, port: config.port }, (info) => {
	logs("info", `Listening on http://localhost:${info.port}`);
});

void pruneDiskCache();
setInterval(() => void pruneDiskCache(), PRUNE_INTERVAL_MS).unref();

async function cleanup() {
	logs("info", "Shutting down server...");
	await tokenHandler.cleanup();
	process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

export default app;
