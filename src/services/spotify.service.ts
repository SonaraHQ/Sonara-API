import type {
	RecommendationRequestVariables,
	SpotifyRecommendations,
	PartnerPlaylistResponse,
	PlaylistRequestVariables,
	SpotifyAPIRequest,
	SpotifyPlaylist,
	SpotifyTrack,
} from "@/types/spotify.js";
import { transformRecommendationsResponse, transformPlaylistResponse } from "@/utils/transformers.js";
import { invalidateAccessTokenCache, getAccessToken, getWebApiToken } from "@/services/token.service.js";
import { Cache } from "@/services/cache.service.js";

const SPOTIFY_API_BASE = "https://api-partner.spotify.com/pathfinder/v2/query";
const SPOTIFY_WEB_API_BASE = "https://api.spotify.com/v1";

const PLAYLIST_HASH = "a65e12194ed5fc443a1cdebed5fabe33ca5b07b987185d63c72483867ad13cb4";
const RECOMMENDATIONS_HASH = "c77098ee9d6ee8ad3eb844938722db60570d040b49f41f5ec6e7be9160a7c86b";

const PLAYLIST_PAGE_SIZE = 1_000;
const MAX_PLAYLIST_TRACKS = 10_000;
// Web API `GET /tracks` accepts at most 50 ids per call
const WEB_API_BATCH_SIZE = 50;
// Mixes and radios change often: memory only, short lifetime
const DYNAMIC_TTL_MS = 3_600_000;

const playlistCache = new Cache<SpotifyPlaylist>({ disk: "playlists" });
const playlistFullCache = new Cache<SpotifyPlaylist>({ disk: "playlists-full" });
const recommendationsCache = new Cache<SpotifyRecommendations>({ disk: "recommendations" });
const recommendationsFullCache = new Cache<SpotifyRecommendations>({ disk: "recommendations-full" });

function isDynamicPlaylist(playlist: SpotifyPlaylist): boolean {
	const name = playlist.name?.toLowerCase() ?? "";
	return name.includes("mix") || name.includes("radio");
}

function cacheOptions(playlist: SpotifyPlaylist) {
	return isDynamicPlaylist(playlist) ? { ttl: DYNAMIC_TTL_MS, persist: false } : {};
}

// Partner API call, retried once with a fresh token on 401
async function partnerQuery<TResponse, TVariables extends SpotifyAPIRequest["variables"]>(operationName: string, sha256Hash: string, variables: TVariables): Promise<TResponse> {
	const payload: SpotifyAPIRequest<TVariables> = {
		variables,
		operationName,
		extensions: { persistedQuery: { version: 1, sha256Hash } },
	};
	const body = JSON.stringify(payload);
	const send = async () =>
		fetch(SPOTIFY_API_BASE, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${await getAccessToken()}`,
				"Content-Type": "application/json",
			},
			body,
		});

	let response = await send();
	if (response.status === 401) {
		invalidateAccessTokenCache();
		response = await send();
	}

	if (!response.ok) throw new Error(`Spotify API error -> ${response.status} ${response.statusText}`);
	return (await response.json()) as TResponse;
}

// Full Web API track objects, fetched in parallel batches
async function fetchTracksFull(ids: string[], clientId?: string, clientSecret?: string): Promise<SpotifyTrack[]> {
	const token = await getWebApiToken(clientId, clientSecret);

	const batches: string[][] = [];
	for (let i = 0; i < ids.length; i += WEB_API_BATCH_SIZE) batches.push(ids.slice(i, i + WEB_API_BATCH_SIZE));

	const results = await Promise.all(
		batches.map(async (batch) => {
			const response = await fetch(`${SPOTIFY_WEB_API_BASE}/tracks?ids=${encodeURIComponent(batch.join(","))}`, {
				headers: { Authorization: `Bearer ${token}` },
			});

			if (!response.ok) {
				const text = await response.text();
				throw new Error(`Spotify Web API error -> ${response.status} ${response.statusText} - ${text}`);
			}

			const data = (await response.json()) as { tracks?: (SpotifyTrack | null)[] };
			return (data.tracks ?? []).filter((track): track is SpotifyTrack => Boolean(track));
		}),
	);

	return results.flat();
}

async function loadPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
	const page = (offset: number) =>
		partnerQuery<PartnerPlaylistResponse, PlaylistRequestVariables>("fetchPlaylist", PLAYLIST_HASH, {
			uri: `spotify:playlist:${playlistId}`,
			enableWatchFeedEntrypoint: false,
			limit: PLAYLIST_PAGE_SIZE,
			offset,
		});

	const first = await page(0);
	const content = first.data?.playlistV2?.content;
	const total = Math.min(content?.totalCount ?? 0, MAX_PLAYLIST_TRACKS);
	// Step on what Spotify actually returned, in case it caps the page below PLAYLIST_PAGE_SIZE
	const step = content?.items?.length || PLAYLIST_PAGE_SIZE;

	// Remaining pages in parallel, then merged into the first response
	const offsets: number[] = [];
	for (let offset = step; offset < total; offset += step) offsets.push(offset);

	const rest = await Promise.all(offsets.map(page));
	if (content?.items) for (const next of rest) content.items.push(...(next.data?.playlistV2?.content?.items ?? []));

	return transformPlaylistResponse(first);
}

export async function fetchPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
	return playlistCache.getOrLoad(playlistId, async () => {
		const playlist = await loadPlaylist(playlistId);
		return { value: playlist, ...cacheOptions(playlist) };
	});
}

export async function fetchPlaylistFull(playlistId: string, clientId?: string, clientSecret?: string): Promise<SpotifyPlaylist> {
	return playlistFullCache.getOrLoad(playlistId, async () => {
		const playlist = await fetchPlaylist(playlistId);
		const items = playlist.tracks?.items ?? [];
		const ids = items.map((item) => item.track?.id).filter((id): id is string => Boolean(id));

		if (!ids.length) return { value: playlist, ...cacheOptions(playlist) };

		const tracks = new Map((await fetchTracksFull(ids, clientId, clientSecret)).map((track) => [track.id, track]));
		const mergedItems = items.map((item) => {
			const full = item.track?.id ? tracks.get(item.track.id) : undefined;
			return full ? { ...item, track: full } : item;
		});

		// New object: the light playlist stays untouched in its own cache
		const full: SpotifyPlaylist = { ...playlist, tracks: { ...playlist.tracks, items: mergedItems, total: mergedItems.length } };
		return { value: full, ...cacheOptions(full) };
	});
}

export async function fetchRecommendations(trackId: string, limit = 5): Promise<SpotifyRecommendations> {
	return recommendationsCache.getOrLoad(`${trackId}_${limit}`, async () => {
		const data = await partnerQuery<Parameters<typeof transformRecommendationsResponse>[0], RecommendationRequestVariables>(
			"internalLinkRecommenderTrack",
			RECOMMENDATIONS_HASH,
			{ uri: `spotify:track:${trackId}`, limit },
		);
		const recommendations = transformRecommendationsResponse(data, trackId);
		// Empty answers are usually transient: keep them out of the disk cache
		return { value: recommendations, persist: recommendations.tracks.length > 0 };
	});
}

export async function fetchRecommendationsFull(trackId: string, limit = 5, clientId?: string, clientSecret?: string): Promise<SpotifyRecommendations> {
	return recommendationsFullCache.getOrLoad(`${trackId}_${limit}`, async () => {
		const rec = await fetchRecommendations(trackId, limit);
		const ids = rec.tracks.map((track) => track.id).filter(Boolean);

		if (!ids.length) return { value: { seeds: rec.seeds, tracks: [] }, persist: false };

		return { value: { seeds: rec.seeds, tracks: await fetchTracksFull(ids, clientId, clientSecret) } };
	});
}
