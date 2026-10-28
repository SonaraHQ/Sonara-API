import type { PartnerPlaylistResponse, PartnerRecommendationsResponse, PartnerTrackData } from "@/types/spotify.js";
import { transformPlaylistResponse, transformRecommendationsResponse } from "@/utils/transformers.js";
import { describe, expect, it } from "vitest";

const track = (id: string): PartnerTrackData => ({
	__typename: "Track",
	uri: `spotify:track:${id}`,
	name: `Song ${id}`,
	discNumber: 1,
	trackNumber: 2,
	trackDuration: { totalMilliseconds: 180_000 },
	contentRating: { label: "EXPLICIT" },
	playability: { playable: true },
	artists: { items: [{ uri: "spotify:artist:artist1", profile: { name: "Artist" } }] },
	albumOfTrack: { uri: "spotify:album:album1", name: "Album", coverArt: { sources: [{ url: "https://i.scdn.co/cover", width: 640, height: 640 }] } },
});

describe("transformPlaylistResponse", () => {
	const response: PartnerPlaylistResponse = {
		data: {
			playlistV2: {
				__typename: "Playlist",
				uri: "spotify:playlist:playlist1",
				name: "My playlist",
				description: "A description",
				images: [{ url: "https://i.scdn.co/playlist" }],
				owner: { uri: "spotify:user:owner1", profile: { name: "Owner" } },
				followers: { total: 42 },
				content: {
					totalCount: 3,
					items: [
						{ addedAt: "2026-01-01T00:00:00Z", itemV2: { data: track("track1") } },
						{ itemV2: { data: { __typename: "Episode", uri: "spotify:episode:episode1" } } },
						{ itemV2: { data: track("track2") } },
					],
				},
			},
		},
	};

	const playlist = transformPlaylistResponse(response);

	it("maps the playlist metadata to the Web API shape", () => {
		expect(playlist).toMatchObject({
			id: "playlist1",
			name: "My playlist",
			description: "A description",
			type: "playlist",
			uri: "spotify:playlist:playlist1",
			external_urls: { spotify: "https://open.spotify.com/playlist/playlist1" },
			followers: { total: 42 },
			owner: { id: "owner1", display_name: "Owner" },
			images: [{ url: "https://i.scdn.co/playlist", width: null, height: null }],
		});
	});

	it("keeps only tracks, in order, without pagination", () => {
		expect(playlist.tracks.items.map((item) => item.track?.id)).toEqual(["track1", "track2"]);
		expect(playlist.tracks).toMatchObject({ total: 2, offset: 0, next: null, previous: null });
	});

	it("maps the track fields", () => {
		const [first] = playlist.tracks.items;
		expect(first?.added_at).toBe("2026-01-01T00:00:00Z");
		expect(first?.track).toMatchObject({
			name: "Song track1",
			duration_ms: 180_000,
			explicit: true,
			disc_number: 1,
			track_number: 2,
			popularity: null,
			artists: [{ id: "artist1", name: "Artist", type: "artist" }],
			album: { id: "album1", name: "Album", images: [{ url: "https://i.scdn.co/cover", width: 640, height: 640 }] },
		});
	});

	it("returns an empty playlist for an empty response", () => {
		expect(transformPlaylistResponse({}).tracks.items).toEqual([]);
	});
});

describe("transformRecommendationsResponse", () => {
	it("reads `internalLinkRecommenderTrack` items wrapped in `content`", () => {
		const response: PartnerRecommendationsResponse = {
			data: { internalLinkRecommenderTrack: { items: [{ content: { data: track("track1") } }, { content: { data: track("track2") } }] } },
		};
		const result = transformRecommendationsResponse(response, "seed1");

		expect(result.tracks.map((t) => t.id)).toEqual(["track1", "track2"]);
		expect(result.tracks[0]?.is_playable).toBe(true);
		expect(result.seeds).toEqual([
			{ id: "seed1", type: "track", href: "https://api.spotify.com/v1/tracks/seed1", initialPoolSize: 2, afterFilteringSize: 2, afterRelinkingSize: 2 },
		]);
	});

	it("falls back to `seoRecommendedTrack` items", () => {
		const response: PartnerRecommendationsResponse = { data: { seoRecommendedTrack: { items: [{ data: track("track3") }] } } };
		expect(transformRecommendationsResponse(response, "seed1").tracks.map((t) => t.id)).toEqual(["track3"]);
	});

	it("returns no seeds and no tracks without recommendations", () => {
		expect(transformRecommendationsResponse({}, "seed1")).toEqual({ seeds: [], tracks: [] });
	});
});
