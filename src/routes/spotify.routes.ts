import { fetchRecommendationsFull, fetchRecommendations, fetchPlaylistFull, fetchPlaylist, MAX_RECOMMENDATIONS } from "@/services/spotify.service.js";
import { fetchLyrics, lyricsEnabled } from "@/services/lyrics.service.js";
import { extractPlaylistId, extractTrackId } from "@/utils/extractors.js";
import type { CacheEntry } from "@/services/cache.service.js";
import { etagMatches } from "@/utils/http.js";
import { Hono, type Context } from "hono";

const ID_PATTERN = /^[A-Za-z0-9_-]{8,}$/;

type Kind = "playlist" | "track";

// Cached JSON is sent as is, and a client that already has this version gets a 304
function sendEntry(c: Context, entry: CacheEntry): Response {
	c.header("ETag", entry.etag);
	if (etagMatches(c.req.header("if-none-match"), entry.etag)) return c.body(null, 304);

	c.header("Content-Type", "application/json; charset=UTF-8");
	return c.body(entry.body);
}

// Id from the `:id` path param or the `url` query param, or an error response
function resolveId(c: Context, kind: Kind): string | Response {
	const raw = c.req.param("id") ?? c.req.query("url");
	if (!raw) return c.json({ error: "Missing url parameter" }, 400);

	const id = kind === "playlist" ? extractPlaylistId(raw) : extractTrackId(raw);
	if (!ID_PATTERN.test(id)) return c.json({ error: `Unable to parse ${kind} id`, id, raw }, 400);

	return id;
}

function resolveCredentials(c: Context): { clientId: string; clientSecret: string } | Response {
	const clientId = c.req.query("client_id") || c.req.header("x-client-id") || c.req.header("x-spotify-client-id");
	const clientSecret = c.req.query("client_secret") || c.req.header("x-client-secret") || c.req.header("x-spotify-client-secret");

	if (!clientId || !clientSecret) return c.json({ error: "client_id and client_secret are required in the request" }, 400);
	return { clientId, clientSecret };
}

function resolveLimit(c: Context): number {
	const limit = Number.parseInt(c.req.query("limit") ?? "", 10);
	return Number.isFinite(limit) ? Math.min(Math.max(limit, 1), MAX_RECOMMENDATIONS) : 5;
}

const router = new Hono();
router.get("/playlist/full/:id?", async (c) => {
	const id = resolveId(c, "playlist");
	if (id instanceof Response) return id;

	const credentials = resolveCredentials(c);
	if (credentials instanceof Response) return credentials;

	return sendEntry(c, await fetchPlaylistFull(id, credentials.clientId, credentials.clientSecret));
});

router.get("/playlist/:id?", async (c) => {
	const id = resolveId(c, "playlist");
	if (id instanceof Response) return id;

	return sendEntry(c, await fetchPlaylist(id));
});

router.get("/recommendations/full/:id?", async (c) => {
	const id = resolveId(c, "track");
	if (id instanceof Response) return id;

	const credentials = resolveCredentials(c);
	if (credentials instanceof Response) return credentials;

	return sendEntry(c, await fetchRecommendationsFull(id, resolveLimit(c), credentials.clientId, credentials.clientSecret));
});

router.get("/recommendations/:id?", async (c) => {
	const id = resolveId(c, "track");
	if (id instanceof Response) return id;

	return sendEntry(c, await fetchRecommendations(id, resolveLimit(c)));
});

router.get("/lyrics/:id?", async (c) => {
	const id = resolveId(c, "track");
	if (id instanceof Response) return id;

	if (!lyricsEnabled()) return c.json({ error: "Lyrics are disabled: set SPOTIFY_SP_DC" }, 503);

	const result = await fetchLyrics(id);
	return result.found ? c.json({ lyrics: result.lyrics }) : c.json({ error: "No lyrics found", id }, 404);
});

export default router;
