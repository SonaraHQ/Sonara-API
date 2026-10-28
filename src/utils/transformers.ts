import type {
	PartnerRecommendationsResponse,
	PartnerRecommendationItem,
	RecommendationsResponse,
	PartnerArtist,
	PartnerImage,
	PartnerPlaylistItem,
	PartnerPlaylistResponse,
	PartnerTrackData,
	SpotifyArtist,
	SpotifyImage,
	SpotifyPlaylist,
	SpotifyPlaylistTrackItem,
	SpotifyTrack,
	SpotifyUser,
} from "@/types/spotify.js";

type PartnerUser = { uri?: string; href?: string; profile?: { name?: string } };

// "spotify:track:abc" -> "abc"
function idFromUri(uri?: string): string | undefined {
	return uri?.split(":")[2];
}

function mapImages(images: unknown): SpotifyImage[] {
	return (Array.isArray(images) ? images : []).map((img: PartnerImage) => ({
		url: img.url ?? "",
		width: img.width ?? null,
		height: img.height ?? null,
	}));
}

function mapArtist(artist: PartnerArtist): SpotifyArtist {
	const id = idFromUri(artist.uri);
	return {
		external_urls: { spotify: `https://open.spotify.com/artist/${id}` },
		href: `https://api.spotify.com/v1/artists/${id}`,
		id: id ?? "",
		name: artist.profile?.name ?? "",
		type: "artist",
		uri: artist.uri ?? "",
	};
}

function mapUser(user: PartnerUser | undefined): SpotifyUser {
	const id = idFromUri(user?.uri);
	return {
		display_name: user?.profile?.name ?? null,
		external_urls: { spotify: user?.uri ? `https://open.spotify.com/user/${id}` : "" },
		href: user?.href ?? null,
		id: id ?? null,
		type: "user",
		uri: user?.uri ?? null,
	};
}

// Track fields shared by playlists and recommendations
function mapTrack(trackData: PartnerTrackData) {
	const album = trackData.albumOfTrack;
	const artists = (trackData.artists?.items ?? []).map(mapArtist);
	const albumId = idFromUri(album?.uri) ?? "";
	const trackId = idFromUri(trackData.uri) ?? "";

	return {
		artists,
		album: {
			album_type: "album",
			artists,
			external_urls: { spotify: `https://open.spotify.com/album/${albumId}` },
			href: `https://api.spotify.com/v1/albums/${albumId}`,
			id: albumId,
			images: mapImages(album?.coverArt?.sources),
			name: album?.name ?? "",
			release_date: null,
			total_tracks: null,
			type: "album",
			uri: album?.uri ?? "",
		},
		track: {
			disc_number: trackData.discNumber,
			duration_ms: trackData.trackDuration?.totalMilliseconds,
			explicit: trackData.contentRating?.label !== "NONE",
			external_urls: { spotify: `https://open.spotify.com/track/${trackId}` },
			href: `https://api.spotify.com/v1/tracks/${trackId}`,
			id: trackId,
			is_local: false,
			name: trackData.name ?? "",
			popularity: null,
			preview_url: null,
			track_number: trackData.trackNumber,
			type: "track",
			uri: trackData.uri ?? "",
		},
	} as const;
}

function mapPlaylistItem(item: PartnerPlaylistItem): SpotifyPlaylistTrackItem | null {
	const trackData = item.itemV2?.data;
	if (!trackData || trackData.__typename !== "Track") return null;

	const { artists, album, track } = mapTrack(trackData);

	return {
		added_at: item.addedAt ?? item.added_at ?? null,
		added_by: item.addedBy ? mapUser(item.addedBy) : null,
		is_local: false,
		primary_color: null,
		track: { ...track, album: { ...album, release_date_precision: "day" }, artists } as SpotifyTrack,
		video_thumbnail: { url: null },
	};
}

export function transformPlaylistResponse(data: PartnerPlaylistResponse): SpotifyPlaylist {
	const playlistData = data?.data?.playlistV2;
	const rawItems = playlistData?.content?.items;
	const contentItems = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

	const items: SpotifyPlaylistTrackItem[] = [];
	for (const item of contentItems) {
		const mapped = mapPlaylistItem(item);
		if (mapped) items.push(mapped);
	}

	const playlistId = idFromUri(playlistData?.uri) ?? "";

	return {
		collaborative: !!(playlistData?.collaborative ?? false),
		description: playlistData?.description ?? null,
		external_urls: { spotify: `https://open.spotify.com/playlist/${playlistId}` },
		followers: { href: null, total: playlistData?.followers?.total ?? null },
		href: `https://api.spotify.com/v1/playlists/${playlistId}`,
		id: playlistId,
		images: mapImages(playlistData?.images),
		name: playlistData?.name ?? "",
		owner: mapUser(playlistData?.owner),
		primary_color: null,
		public: playlistData?.public ?? null,
		snapshot_id: playlistData?.snapshotId ?? null,
		tracks: {
			href: `https://api.spotify.com/v1/playlists/${playlistId}/tracks?offset=0&limit=${items.length}`,
			items,
			limit: items.length,
			next: null,
			offset: 0,
			previous: null,
			total: items.length,
		},
		type: "playlist",
		uri: playlistData?.uri ?? `spotify:playlist:${playlistId}`,
	};
}

function mapRecommendation(item: PartnerRecommendationItem): SpotifyTrack | null {
	// Support both { content: { data } } and { data } item shapes returned
	// by different partner persisted queries.
	const trackData = item.content?.data ?? item.data;
	if (!trackData || trackData.__typename !== "Track") return null;

	const { artists, album, track } = mapTrack(trackData);

	return {
		...track,
		album: { ...album, available_markets: [], release_date_precision: "year" },
		artists,
		available_markets: [],
		external_ids: {},
		is_playable: trackData.playability?.playable || false,
	} as SpotifyTrack;
}

export function transformRecommendationsResponse(data: PartnerRecommendationsResponse, seedTrackId: string): RecommendationsResponse {
	// The API may return recommendations under different fields depending on
	// the persisted query. Prefer `internalLinkRecommenderTrack`, but fall back
	// to `seoRecommendedTrack` when available (observed in partner responses)
	const recommendations = data?.data?.internalLinkRecommenderTrack?.items ?? data?.data?.seoRecommendedTrack?.items;
	if (!recommendations) return { seeds: [], tracks: [] };

	const tracks: SpotifyTrack[] = [];
	for (const item of recommendations) {
		const mapped = mapRecommendation(item);
		if (mapped) tracks.push(mapped);
	}

	return {
		seeds: [
			{
				afterFilteringSize: tracks.length,
				afterRelinkingSize: tracks.length,
				href: `https://api.spotify.com/v1/tracks/${seedTrackId}`,
				id: seedTrackId,
				initialPoolSize: tracks.length,
				type: "track",
			},
		],
		tracks,
	};
}
