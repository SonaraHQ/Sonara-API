import type {
	PartnerArtist,
	PartnerImage,
	PartnerPlaylistItem,
	PartnerPlaylistResponse,
	PartnerRecommendationItem,
	PartnerRecommendationsResponse,
	RecommendationsResponse,
	SpotifyArtist,
	SpotifyPlaylist,
	SpotifyPlaylistTrackItem,
	SpotifyTrack,
} from "../types/spotify.js";

export function transformPlaylistResponse(
	data: PartnerPlaylistResponse,
): SpotifyPlaylist {
	const playlistData = data?.data?.playlistV2;
	if (!playlistData?.content?.items) {
		// Return an empty SpotifyPlaylist object (no legacy `{ tracks: [] }`)
		const playlistId = playlistData?.uri?.split(":")[2] ?? "";
		const empty: SpotifyPlaylist = {
			collaborative: !!(playlistData?.collaborative ?? false),
			description: playlistData?.description ?? null,
			external_urls: {
				spotify: `https://open.spotify.com/playlist/${playlistId}`,
			},
			followers: { href: null, total: playlistData?.followers?.total ?? null },
			href: `https://api.spotify.com/v1/playlists/${playlistId}`,
			id: playlistId,
			images: (Array.isArray(playlistData?.images)
				? playlistData.images
				: []
			).map((img: PartnerImage) => ({
				url: img.url ?? "",
				width: img.width ?? null,
				height: img.height ?? null,
			})),
			name: playlistData?.name ?? "",
			owner: {
				display_name: playlistData?.owner?.profile?.name ?? null,
				external_urls: {
					spotify: playlistData?.owner?.uri
						? `https://open.spotify.com/user/${playlistData?.owner?.uri?.split(":")[2]}`
						: "",
				},
				href: playlistData?.owner?.href ?? null,
				id: playlistData?.owner?.uri?.split(":")[2] ?? null,
				type: "user",
				uri: playlistData?.owner?.uri ?? null,
			},
			primary_color: null,
			public: playlistData?.public ?? null,
			snapshot_id: playlistData?.snapshotId ?? null,
			tracks: {
				href: `https://api.spotify.com/v1/playlists/${playlistId}/tracks?offset=0&limit=0`,
				items: [],
				limit: 0,
				next: null,
				offset: 0,
				previous: null,
				total: 0,
			},
			type: "playlist",
			uri: playlistData?.uri ?? `spotify:playlist:${playlistId}`,
		};
		return empty;
	}

	const rawItems = playlistData.content.items;
	const contentItems = Array.isArray(rawItems)
		? rawItems
		: rawItems
			? [rawItems]
			: [];

	const items = contentItems
		.map((item: PartnerPlaylistItem) => {
			const trackData = item.itemV2?.data;
			if (!trackData || trackData.__typename !== "Track") {
				return null;
			}

			const album = trackData.albumOfTrack;
			const artists: PartnerArtist[] = trackData.artists?.items ?? [];
			const albumId = album?.uri?.split(":")[2] ?? "";
			const trackId = trackData.uri?.split(":")[2] ?? "";

			const track: SpotifyTrack = {
				album: {
					album_type: "album",
					artists: artists.map(
						(artist): SpotifyArtist => ({
							external_urls: {
								spotify: `https://open.spotify.com/artist/${artist.uri?.split(":")[2]}`,
							},
							href: `https://api.spotify.com/v1/artists/${artist.uri?.split(":")[2]}`,
							id: artist.uri?.split(":")[2] ?? "",
							name: artist.profile?.name ?? "",
							type: "artist",
							uri: artist.uri ?? "",
						}),
					),
					external_urls: {
						spotify: `https://open.spotify.com/album/${albumId}`,
					},
					href: `https://api.spotify.com/v1/albums/${albumId}`,
					id: albumId,
					images:
						(Array.isArray(album?.coverArt?.sources)
							? album.coverArt.sources
							: []
						).map((source: PartnerImage) => ({
							url: source.url ?? "",
							width: source.width ?? null,
							height: source.height ?? null,
						})) || [],
					name: album?.name ?? "",
					release_date: null,
					release_date_precision: "day",
					total_tracks: null,
					type: "album",
					uri: album?.uri ?? "",
				},
				artists: artists.map(
					(artist): SpotifyArtist => ({
						external_urls: {
							spotify: `https://open.spotify.com/artist/${artist.uri?.split(":")[2]}`,
						},
						href: `https://api.spotify.com/v1/artists/${artist.uri?.split(":")[2]}`,
						id: artist.uri?.split(":")[2] ?? "",
						name: artist.profile?.name ?? "",
						type: "artist",
						uri: artist.uri ?? "",
					}),
				),
				disc_number: trackData.discNumber,
				duration_ms: trackData.trackDuration?.totalMilliseconds,
				explicit: trackData.contentRating?.label !== "NONE",
				external_urls: {
					spotify: `https://open.spotify.com/track/${trackId}`,
				},
				href: `https://api.spotify.com/v1/tracks/${trackId}`,
				id: trackId,
				is_local: false,
				name: trackData.name ?? "",
				popularity: null,
				preview_url: null,
				track_number: trackData.trackNumber,
				type: "track",
				uri: trackData.uri ?? "",
			};

			const playlistItem: SpotifyPlaylistTrackItem = {
				added_at: item.addedAt ?? item.added_at ?? null,
				added_by: item.addedBy
					? {
							display_name: item.addedBy?.profile?.name ?? null,
							external_urls: {
								spotify: item.addedBy?.uri
									? `https://open.spotify.com/user/${item.addedBy?.uri?.split(":")[2]}`
									: "",
							},
							href: item.addedBy?.href ?? null,
							id: item.addedBy?.uri?.split(":")[2] ?? null,
							type: "user",
							uri: item.addedBy?.uri ?? null,
						}
					: null,
				is_local: false,
				primary_color: null,
				track,
				video_thumbnail: { url: null },
			};

			return playlistItem;
		})
		.filter((it): it is SpotifyPlaylistTrackItem => Boolean(it));

	// derive playlist-level metadata defensively
	const playlistId = playlistData?.uri?.split(":")[2] ?? "";
	const playlist: SpotifyPlaylist = {
		collaborative: !!(playlistData?.collaborative ?? false),
		description: playlistData?.description ?? null,
		external_urls: {
			spotify: `https://open.spotify.com/playlist/${playlistId}`,
		},
		followers: { href: null, total: playlistData?.followers?.total ?? null },
		href: `https://api.spotify.com/v1/playlists/${playlistId}`,
		id: playlistId,
		images: (Array.isArray(playlistData?.images)
			? playlistData.images
			: []
		).map((img: PartnerImage) => ({
			url: img.url ?? "",
			width: img.width ?? null,
			height: img.height ?? null,
		})),
		name: playlistData?.name ?? "",
		owner: {
			display_name: playlistData?.owner?.profile?.name ?? null,
			external_urls: {
				spotify: playlistData?.owner?.uri
					? `https://open.spotify.com/user/${playlistData?.owner?.uri?.split(":")[2]}`
					: "",
			},
			href: playlistData?.owner?.href ?? null,
			id: playlistData?.owner?.uri?.split(":")[2] ?? null,
			type: "user",
			uri: playlistData?.owner?.uri ?? null,
		},
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

	return playlist;
}

export function transformRecommendationsResponse(
	data: PartnerRecommendationsResponse,
	seedTrackId: string,
): RecommendationsResponse {
	// shits api may return recommendations under different fields depending on
	// the persisted query. prefer `internalLinkRecommenderTrack`, but fall back
	// to `seoRecommendedTrack` when available (observed in partner responses)
	const recommendations =
		data?.data?.internalLinkRecommenderTrack?.items ??
		data?.data?.seoRecommendedTrack?.items;
	if (!recommendations) {
		return { seeds: [], tracks: [] };
	}

	const tracks = recommendations
		.map((item: PartnerRecommendationItem) => {
			// Support both { content: { data } } and { data } item shapes returned
			// by different partner persisted queries.
			const trackData = item.content?.data ?? item.data;
			if (!trackData || trackData.__typename !== "Track") {
				return null;
			}

			const album = trackData.albumOfTrack;
			const artists: PartnerArtist[] = trackData.artists?.items ?? [];
			const albumId = album?.uri?.split(":")[2] ?? "";
			const trackId = trackData.uri?.split(":")[2] ?? "";

			const track: SpotifyTrack = {
				album: {
					album_type: "album",
					total_tracks: null,
					available_markets: [],
					external_urls: {
						spotify: `https://open.spotify.com/album/${albumId}`,
					},
					href: `https://api.spotify.com/v1/albums/${albumId}`,
					id: albumId,
					images:
						(Array.isArray(album?.coverArt?.sources)
							? album.coverArt.sources
							: []
						).map((source: PartnerImage) => ({
							url: source.url ?? "",
							height: source.height ?? null,
							width: source.width ?? null,
						})) || [],
					name: album?.name ?? "",
					release_date: null,
					release_date_precision: "year",
					type: "album",
					uri: album?.uri ?? "",
					artists: artists.map(
						(artist): SpotifyArtist => ({
							external_urls: {
								spotify: `https://open.spotify.com/artist/${artist.uri?.split(":")[2]}`,
							},
							href: `https://api.spotify.com/v1/artists/${artist.uri?.split(":")[2]}`,
							id: artist.uri?.split(":")[2] ?? "",
							name: artist.profile?.name ?? "",
							type: "artist",
							uri: artist.uri ?? "",
						}),
					),
				},
				artists: artists.map(
					(artist): SpotifyArtist => ({
						external_urls: {
							spotify: `https://open.spotify.com/artist/${artist.uri?.split(":")[2]}`,
						},
						href: `https://api.spotify.com/v1/artists/${artist.uri?.split(":")[2]}`,
						id: artist.uri?.split(":")[2] ?? "",
						name: artist.profile?.name ?? "",
						type: "artist",
						uri: artist.uri ?? "",
					}),
				),
				available_markets: [],
				disc_number: trackData.discNumber,
				duration_ms: trackData.trackDuration?.totalMilliseconds,
				explicit: trackData.contentRating?.label !== "NONE",
				external_ids: {},
				external_urls: {
					spotify: `https://open.spotify.com/track/${trackId}`,
				},
				href: `https://api.spotify.com/v1/tracks/${trackId}`,
				id: trackId,
				is_playable: trackData.playability?.playable || false,
				name: trackData.name ?? "",
				popularity: null,
				preview_url: null,
				track_number: trackData.trackNumber,
				type: "track",
				uri: trackData.uri ?? "",
				is_local: false,
			};
			return track;
		})
		.filter((track: SpotifyTrack | null): track is SpotifyTrack =>
			Boolean(track),
		);

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
