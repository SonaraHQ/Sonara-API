import type {
	RecommendationRequestVariables,
	PartnerRecommendationsResponse,
	RecommendationsResponse,
	PartnerPlaylistResponse,
	PlaylistRequestVariables,
	SpotifyAPIRequest,
	SpotifyPlaylist,
	PartnerErrors,
	SpotifyTrack,
} from "@/types/spotify.js";
import { transformRecommendationsResponse, transformPlaylistResponse } from "@/utils/transformers.js";
import { invalidateAccessTokenCache, getAccessToken, getWebApiToken } from "@/services/token.service.js";
import { Cache, type CacheEntry } from "@/services/cache.service.js";
import { fetchWithRetry, upstreamError } from "@/utils/http.js";
import { isDynamicPlaylist } from "@/utils/playlists.js";
import { HTTPException } from "hono/http-exception";
import { config, HOUR } from "@/config/env.js";

const SPOTIFY_API_BASE = "https://api-partner.spotify.com/pathfinder/v2/query";
const SPOTIFY_WEB_API_BASE = "https://api.spotify.com/v1";

// Partner API (undocumented) max page size, Spotify rejects anything above
const PLAYLIST_PAGE_SIZE = 5_000;
const MAX_PLAYLIST_TRACKS = 10_000;
export const MAX_RECOMMENDATIONS = 100;
// Web API `GET /tracks` accepts at most 50 ids per call
const WEB_API_BATCH_SIZE = 50;
// Mixes and radios change often: memory only, short lifetime
const DYNAMIC_TTL_MS = HOUR;

const playlistCache = new Cache<SpotifyPlaylist>("playlists");
const playlistFullCache = new Cache<SpotifyPlaylist>("playlists-full");
// Recommendations are fetched once at MAX_RECOMMENDATIONS: Spotify returns the same ranking
// for any limit, so each `limit` is a prefix of it and is served from a memory-only slice
const recommendationsCache = new Cache<RecommendationsResponse>("recommendations");
const recommendationsFullCache = new Cache<RecommendationsResponse>("recommendations-full");
const recommendationsSliceCache = new Cache<RecommendationsResponse>("recommendations-slices", { disk: false });

function cacheOptions(playlist: SpotifyPlaylist) {
	return isDynamicPlaylist(playlist) ? { ttl: DYNAMIC_TTL_MS, persist: false } : {};
}

function graphqlErrors(response: PartnerErrors): string | undefined {
	return response.errors?.length ? response.errors.map((error) => error.message ?? "unknown error").join(", ") : undefined;
}

// Partner API call, retried once with a fresh token on 401
async function partnerQuery<TResponse extends PartnerErrors & { data?: unknown }, TVariables extends SpotifyAPIRequest["variables"]>(
	operationName: string,
	sha256Hash: string,
	variables: TVariables,
): Promise<TResponse> {
	const payload: SpotifyAPIRequest<TVariables> = {
		variables,
		operationName,
		extensions: { persistedQuery: { version: 1, sha256Hash } },
	};
	const body = JSON.stringify(payload);
	const label = `Spotify API ${operationName}`;
	const send = async () => {
		const token = await getAccessToken();
		const response = await fetchWithRetry(label, SPOTIFY_API_BASE, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body,
		});
		return { token, response };
	};

	const first = await send();
	let response = first.response;
	if (response.status === 401) {
		invalidateAccessTokenCache(first.token);
		response = (await send()).response;
	}

	if (!response.ok) throw await upstreamError(label, response);

	const json = (await response.json()) as TResponse;
	// No data at all (e.g. outdated persisted query hash): fail instead of caching an empty result
	const errors = graphqlErrors(json);
	if (errors && !json.data) throw new HTTPException(502, { message: `${label} -> ${errors}` });
	return json;
}

async function fetchTracksFull(ids: string[], clientId?: string, clientSecret?: string): Promise<SpotifyTrack[]> {
	const token = await getWebApiToken(clientId, clientSecret);
	const label = "Spotify Web API tracks";

	const batches: string[][] = [];
	for (let i = 0; i < ids.length; i += WEB_API_BATCH_SIZE) batches.push(ids.slice(i, i + WEB_API_BATCH_SIZE));

	// All batches at once, 429s are retried by fetchWithRetry
	const results = await Promise.all(
		batches.map(async (batch) => {
			const market = config.spotifyMarket ? `&market=${config.spotifyMarket}` : "";
			const response = await fetchWithRetry(label, `${SPOTIFY_WEB_API_BASE}/tracks?ids=${encodeURIComponent(batch.join(","))}${market}`, {
				headers: { Authorization: `Bearer ${token}` },
			});

			if (!response.ok) throw await upstreamError(label, response);

			const data = (await response.json()) as { tracks?: (SpotifyTrack | null)[] };
			return (data.tracks ?? []).filter((track): track is SpotifyTrack => Boolean(track));
		}),
	);

	return results.flat();
}

async function loadPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
	// Every page must carry content, otherwise the playlist would be cached empty or truncated
	const page = async (offset: number) => {
		const response = await partnerQuery<PartnerPlaylistResponse, PlaylistRequestVariables>("fetchPlaylist", config.playlistHash, {
			uri: `spotify:playlist:${playlistId}`,
			enableWatchFeedEntrypoint: false,
			limit: PLAYLIST_PAGE_SIZE,
			offset,
		});

		const playlist = response.data?.playlistV2;
		if (playlist?.content) return { response, content: playlist.content };

		const errors = graphqlErrors(response);
		if (errors) throw new HTTPException(502, { message: `Spotify API fetchPlaylist -> ${errors}` });
		throw new HTTPException(404, { message: `Playlist not found or private -> ${playlistId}${playlist?.__typename ? ` (${playlist.__typename})` : ""}` });
	};

	const { response: first, content } = await page(0);
	const total = Math.min(content.totalCount ?? 0, MAX_PLAYLIST_TRACKS);
	// Step on what Spotify actually returned, in case it caps the page below PLAYLIST_PAGE_SIZE
	const step = content.items?.length || PLAYLIST_PAGE_SIZE;

	const offsets: number[] = [];
	for (let offset = step; offset < total; offset += step) offsets.push(offset);

	const rest = await Promise.all(offsets.map(page));
	if (content.items) for (const next of rest) content.items.push(...(next.content.items ?? []));

	return transformPlaylistResponse(first);
}

export async function fetchPlaylist(playlistId: string): Promise<CacheEntry> {
	return playlistCache.getOrLoad(playlistId, async () => {
		const playlist = await loadPlaylist(playlistId);
		return { value: playlist, ...cacheOptions(playlist) };
	});
}

export async function fetchPlaylistFull(playlistId: string, clientId?: string, clientSecret?: string): Promise<CacheEntry> {
	return playlistFullCache.getOrLoad(playlistId, async () => {
		const playlist = playlistCache.value(await fetchPlaylist(playlistId));
		const items = playlist.tracks?.items ?? [];
		const ids = items.map((item) => item.track?.id).filter((id): id is string => Boolean(id));

		if (!ids.length) return { value: playlist, ...cacheOptions(playlist) };

		const tracks = new Map((await fetchTracksFull(ids, clientId, clientSecret)).map((track) => [track.id, track]));
		const mergedItems = items.map((item) => {
			const full = item.track?.id ? tracks.get(item.track.id) : undefined;
			return full ? { ...item, track: full } : item;
		});

		const full: SpotifyPlaylist = { ...playlist, tracks: { ...playlist.tracks, items: mergedItems, total: mergedItems.length } };
		return { value: full, ...cacheOptions(full) };
	});
}

function sliceRecommendations(recommendations: RecommendationsResponse, limit: number): RecommendationsResponse {
	const tracks = recommendations.tracks.slice(0, limit);
	const size = tracks.length;
	return {
		seeds: recommendations.seeds.map((seed) => ({ ...seed, initialPoolSize: size, afterFilteringSize: size, afterRelinkingSize: size })),
		tracks,
	};
}

async function allRecommendations(trackId: string): Promise<RecommendationsResponse> {
	const entry = await recommendationsCache.getOrLoad(trackId, async () => {
		const data = await partnerQuery<PartnerRecommendationsResponse, RecommendationRequestVariables>("internalLinkRecommenderTrack", config.recommendationsHash, {
			uri: `spotify:track:${trackId}`,
			limit: MAX_RECOMMENDATIONS,
		});
		const recommendations = transformRecommendationsResponse(data, trackId);
		// Empty answers are usually transient: keep them out of the disk cache
		return { value: recommendations, persist: recommendations.tracks.length > 0 };
	});
	return recommendationsCache.value(entry);
}

async function allRecommendationsFull(trackId: string, clientId?: string, clientSecret?: string): Promise<RecommendationsResponse> {
	const entry = await recommendationsFullCache.getOrLoad(trackId, async () => {
		const recommendations = await allRecommendations(trackId);
		const ids = recommendations.tracks.map((track) => track.id).filter(Boolean);

		if (!ids.length) return { value: { seeds: recommendations.seeds, tracks: [] }, persist: false };

		return { value: { seeds: recommendations.seeds, tracks: await fetchTracksFull(ids, clientId, clientSecret) } };
	});
	return recommendationsFullCache.value(entry);
}

export async function fetchRecommendations(trackId: string, limit = 5): Promise<CacheEntry> {
	return recommendationsSliceCache.getOrLoad(`light:${trackId}_${limit}`, async () => ({
		value: sliceRecommendations(await allRecommendations(trackId), limit),
	}));
}

export async function fetchRecommendationsFull(trackId: string, limit = 5, clientId?: string, clientSecret?: string): Promise<CacheEntry> {
	return recommendationsSliceCache.getOrLoad(`full:${trackId}_${limit}`, async () => ({
		value: sliceRecommendations(await allRecommendationsFull(trackId, clientId, clientSecret), limit),
	}));
}
