import "dotenv/config";

import { Hono } from "hono";
import spotifyRoutes from "./routes/spotify.routes.js";

const app = new Hono()
	.get("/", (c) => {
		return c.json({
			name: "Solify - Spotify Resolver API",
			version: "1.0.0",
			endpoints: {
				playlist: {
					byId: "/playlist/:id",
					byUrl: "/playlist?url=<spotify-playlist-url>",
				},
				playlistFull: {
					byId: "/playlist/full/:id",
					byUrl: "/playlist/full?url=<spotify-playlist-url>",
					notes:
						"Required: every request must include client_id and client_secret as query params or x-spotify-client-id/x-spotify-client-secret (or x-client-id/x-client-secret) headers",
				},
				recommendations: {
					byId: "/recommendations/:id?limit=5",
					byUrl: "/recommendations?url=<spotify-track-url>&limit=5",
				},
			},
		});
	})

	.route("/", spotifyRoutes)

	.notFound((c) => {
		return c.json({ error: "Not Found" }, 404);
	})

	.onError((err, c) => {
		console.error(`Error: ${err.message}`);
		return c.json({ error: err.message }, 500);
	});

export default app;
