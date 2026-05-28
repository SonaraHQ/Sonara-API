import type { RecommendationRequestVariables, SpotifyRecommendations, SpotifyPlaylistTrackItem, PlaylistRequestVariables, SpotifyAPIRequest, SpotifyPlaylist, SpotifyTrack,} from "../types/spotify.js";
import { transformRecommendationsResponse, transformPlaylistResponse } from "../utils/transformers.js";
import { invalidateAccessTokenCache, getAccessToken, getWebApiToken } from "./token.service.js";
import { LRUCache } from "lru-cache";
import fs from "node:fs/promises";
import path from "node:path"; 

const SPOTIFY_API_BASE = "https://api-partner.spotify.com/pathfinder/v2/query";
const SPOTIFY_WEB_API_BASE = "https://api.spotify.com/v1";

const playlistCache = new LRUCache<string, SpotifyPlaylist>({
	max: 1000,
	ttl: 43_200_000,
	ttlAutopurge: true,
	updateAgeOnGet: true,
});

const recommendationsCache = new LRUCache<string, SpotifyRecommendations>({
	max: 1000,
	ttl: 43_200_000,
	ttlAutopurge: true,
	updateAgeOnGet: true,
});

async function readJSON<T>(filePath: string): Promise<T | null> {
	try {
		const data = await fs.readFile(filePath, "utf-8");
		return JSON.parse(data) as T;
	} catch (err) {
		return null;
	};
};

async function writeJSON(filePath: string, data: unknown): Promise<void> {
	try {
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, JSON.stringify(data), "utf-8");
	} catch (err) {
		console.log(`Failed to write JSON file -> ${filePath} -> ${err}`);
	};
};

export async function fetchPlaylist(playlistId: string, limit: number = 100, authToken?: string) {
	const cached = playlistCache.get(playlistId);
	if (cached) return cached;

	const fileCached = await readJSON<SpotifyPlaylist>(path.join("./cache/playlists", `${playlistId}.json`));
	if (fileCached) {
		playlistCache.set(playlistId, fileCached);
		return fileCached;
	};

	const token = authToken ?? (await getAccessToken());
	const payload: SpotifyAPIRequest<PlaylistRequestVariables> = {
		variables: {
			uri: `spotify:playlist:${playlistId}`,
			enableWatchFeedEntrypoint: false,
			limit,
		},
		operationName: "fetchPlaylist",
		extensions: {
			persistedQuery: {
				version: 1,
				sha256Hash:
					"a65e12194ed5fc443a1cdebed5fabe33ca5b07b987185d63c72483867ad13cb4",
			},
		},
	};

	let response = await fetch(SPOTIFY_API_BASE, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	if (response.status === 401) {
		invalidateAccessTokenCache();

		const newToken = await getAccessToken();
		response = await fetch(SPOTIFY_API_BASE, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${newToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});
	};

	if (!response.ok) throw new Error(`Spotify API error -> ${response.statusText}`);

	const data = await response.json();
	const playlist = transformPlaylistResponse(data) as SpotifyPlaylist; // returns a SpotifyPlaylist object (Spotify Web API-like) or legacy tracks list

	return playlist;
};

export async function fetchPlaylistFull(playlistId: string, clientId?: string, clientSecret?: string) {
	const playlist = (await fetchPlaylist(playlistId)) as SpotifyPlaylist;

	const items: SpotifyPlaylistTrackItem[] = playlist.tracks?.items ?? [];
	const ids = items.map((it) => it.track?.id).filter((x): x is string => Boolean(x));

	if (!ids.length) return playlist;
	
	const token = await getWebApiToken(clientId, clientSecret);

	const batches: string[][] = [];
	for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));
	
	const aggregatedTracks: SpotifyTrack[] = [];
	for (const batch of batches) {
		const url = `${SPOTIFY_WEB_API_BASE}/tracks?ids=${encodeURIComponent(batch.join(","))}`;
		const response = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(
				`Spotify Web API error -> ${response.status} ${response.statusText} - ${text}`,
			);
		};

		const data = await response.json();
		if (Array.isArray(data.tracks)) {
			aggregatedTracks.push(...data.tracks);
		};
	};

	// Merge full track objects back into playlist items
	const idMap = new Map(aggregatedTracks.map((t) => [t.id, t]));
	const mergedItems = items.map((it) => {
		const id = it.track?.id;
		if (id && idMap.has(id)) return { ...it, track: idMap.get(id) };
		
		return it;
	});

	playlist.tracks.items = mergedItems; // Patch the existing playlist object
	playlist.tracks.total = mergedItems.length;
	
	const name = playlist?.name?.toLowerCase() || "";
	const isDynamic = name.includes("mix") || name.includes("radio");

	if (!isDynamic) {
		playlistCache.set(playlistId, playlist);
		await writeJSON(path.join("./cache/playlists", `${playlistId}.json`), playlist); 
	};
	
	return playlist;
};

export async function fetchRecommendations(trackId: string, limit: number = 5, authToken?: string) : Promise<SpotifyRecommendations> {
	const cached = recommendationsCache.get(trackId);
	if (cached) return cached;

	const filePath = path.join("./cache/recommendations", `${trackId}.json`);
	const fileCached = await readJSON<SpotifyRecommendations>(filePath);
	if (fileCached) {
		recommendationsCache.set(trackId, fileCached);
		return fileCached;
	};
	
	const token = authToken ?? (await getAccessToken());
	const payload: SpotifyAPIRequest<RecommendationRequestVariables> = {
		variables: {
			uri: `spotify:track:${trackId}`,
			limit,
		},
		operationName: "internalLinkRecommenderTrack",
		extensions: {
			persistedQuery: {
				version: 1,
				sha256Hash:
					"c77098ee9d6ee8ad3eb844938722db60570d040b49f41f5ec6e7be9160a7c86b",
			},
		},
	};

	let response = await fetch(SPOTIFY_API_BASE, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	if (response.status === 401) {
		invalidateAccessTokenCache();

		const newToken = await getAccessToken();
		response = await fetch(SPOTIFY_API_BASE, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${newToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});
	};

	if (!response.ok) throw new Error(`Spotify API error -> ${response.statusText}`);

	const data = await response.json();
	const recommendations = transformRecommendationsResponse(data, trackId) as SpotifyRecommendations;
	
	recommendationsCache.set(trackId, recommendations);
	await writeJSON(filePath, recommendations); 
	return recommendations;
};

export async function fetchRecommendationsFull(trackId: string, limit: number = 5, clientId?: string, clientSecret?: string) {
	// Get the lightweight recommendations (seeds + track ids)
	const rec = await fetchRecommendations(trackId, limit);
	const ids = rec.tracks.map((t) => t.id).filter(Boolean);

	if (!ids.length) return { seeds: rec.seeds, tracks: [] }; // return the original seeds and empty tracks array

	const token = await getWebApiToken(clientId, clientSecret);

	const batches: string[][] = [];
	for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));
	
	const aggregatedTracks: SpotifyTrack[] = [];

	for (const batch of batches) {
		const url = `${SPOTIFY_WEB_API_BASE}/tracks?ids=${encodeURIComponent(batch.join(","))}`;

		const response = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(
				`Spotify Web API error -> ${response.status} ${response.statusText} - ${text}`,
			);
		};

		const data = await response.json();
		if (Array.isArray(data.tracks)) aggregatedTracks.push(...data.tracks);
	};

	return { seeds: rec.seeds, tracks: aggregatedTracks };
};