import { Hono } from "hono";
import {
	fetchPlaylist,
	fetchPlaylistFull,
	fetchRecommendations,
	fetchRecommendationsFull,
} from "../services/spotify.service.js";
import { extractPlaylistId, extractTrackId } from "../utils/extractors.js";

const router = new Hono();

router.get("/playlist/full/:id", async (c) => {
	try {
		const playlistId = extractPlaylistId(c.req.param("id"));

		if (!/^[A-Za-z0-9_-]{8,}$/.test(playlistId)) {
			return c.json(
				{
					error: "Invalid playlist id",
					id: playlistId,
					raw: c.req.param("id"),
				},
				400,
			);
		}

		const clientId =
			c.req.query("client_id") ||
			c.req.header("x-client-id") ||
			c.req.header("x-spotify-client-id");
		const clientSecret =
			c.req.query("client_secret") ||
			c.req.header("x-client-secret") ||
			c.req.header("x-spotify-client-secret");

		if (!clientId || !clientSecret) {
			return c.json(
				{ error: "client_id and client_secret are required in the request" },
				400,
			);
		}

		const data = await fetchPlaylistFull(playlistId, clientId, clientSecret);
		return c.json(data);
	} catch (error) {
		return c.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			500,
		);
	}
});

router.get("/playlist/full", async (c) => {
	try {
		const url = c.req.query("url");
		if (!url) {
			return c.json({ error: "Missing url parameter" }, 400);
		}
		const playlistId = extractPlaylistId(url);
		if (!/^[A-Za-z0-9_-]{8,}$/.test(playlistId)) {
			return c.json(
				{
					error: "Unable to parse playlist id from url",
					id: playlistId,
					raw: url,
				},
				400,
			);
		}

		const clientId = c.req.query("client_id") || c.req.header("x-client-id");
		const clientSecret =
			c.req.query("client_secret") || c.req.header("x-client-secret");

		if (!clientId || !clientSecret) {
			return c.json(
				{ error: "client_id and client_secret are required in the request" },
				400,
			);
		}

		const data = await fetchPlaylistFull(playlistId, clientId, clientSecret);
		return c.json(data);
	} catch (error) {
		return c.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			500,
		);
	}
});

router.get("/playlist", async (c) => {
	try {
		const url = c.req.query("url");
		if (!url) {
			return c.json({ error: "Missing url parameter" }, 400);
		}
		const playlistId = extractPlaylistId(url);
		if (!/^[A-Za-z0-9_-]{8,}$/.test(playlistId)) {
			console.debug("/playlist/full (query) - unable to parse playlist id", {
				url,
				parsed: playlistId,
			});
			return c.json(
				{
					error: "Unable to parse playlist id from url",
					id: playlistId,
					raw: url,
				},
				400,
			);
		}
		const data = await fetchPlaylist(playlistId);
		return c.json(data);
	} catch (error) {
		return c.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			500,
		);
	}
});

router.get("/recommendations/:id", async (c) => {
	try {
		const url = c.req.param("id");
		const trackId = extractTrackId(url);

		if (!/^[A-Za-z0-9_-]{8,}$/.test(trackId)) {
			return c.json(
				{
					error:
						"Invalid track id — ensure you pass the id (or use ?limit=..) as a query param",
					id: trackId,
					url,
				},
				400,
			);
		}
		const limit = parseInt(c.req.query("limit") || "5", 10);
		const data = await fetchRecommendations(trackId, limit);
		return c.json(data);
	} catch (error) {
		return c.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			500,
		);
	}
});

router.get("/recommendations", async (c) => {
	try {
		const url = c.req.query("url");
		if (!url) {
			return c.json({ error: "Missing url parameter" }, 400);
		}
		const trackId = extractTrackId(url);
		const limit = parseInt(c.req.query("limit") || "5", 10);
		const data = await fetchRecommendations(trackId, limit);
		return c.json(data);
	} catch (error) {
		return c.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			500,
		);
	}
});

router.get("/recommendations/full/:id", async (c) => {
	try {
		const raw = c.req.param("id");
		const trackId = extractTrackId(raw);

		if (!/^[A-Za-z0-9_-]{8,}$/.test(trackId)) {
			return c.json(
				{
					error: "Invalid track id",
					id: trackId,
					raw,
				},
				400,
			);
		}

		const clientId = c.req.query("client_id") || c.req.header("x-client-id");
		const clientSecret =
			c.req.query("client_secret") || c.req.header("x-client-secret");

		if (!clientId || !clientSecret) {
			return c.json(
				{ error: "client_id and client_secret are required in the request" },
				400,
			);
		}

		const limit = parseInt(c.req.query("limit") || "5", 10);
		const data = await fetchRecommendationsFull(
			trackId,
			limit,
			clientId,
			clientSecret,
		);
		return c.json(data);
	} catch (error) {
		return c.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			500,
		);
	}
});

router.get("/recommendations/full", async (c) => {
	try {
		const url = c.req.query("url");
		if (!url) {
			return c.json({ error: "Missing url parameter" }, 400);
		}
		const trackId = extractTrackId(url);
		if (!/^[A-Za-z0-9_-]{8,}$/.test(trackId)) {
			return c.json(
				{
					error: "Unable to parse track id from url",
					id: trackId,
					raw: url,
				},
				400,
			);
		}

		const clientId = c.req.query("client_id") || c.req.header("x-client-id");
		const clientSecret =
			c.req.query("client_secret") || c.req.header("x-client-secret");

		if (!clientId || !clientSecret) {
			return c.json(
				{ error: "client_id and client_secret are required in the request" },
				400,
			);
		}

		const limit = parseInt(c.req.query("limit") || "5", 10);
		const data = await fetchRecommendationsFull(
			trackId,
			limit,
			clientId,
			clientSecret,
		);
		return c.json(data);
	} catch (error) {
		return c.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			500,
		);
	}
});

export default router;
