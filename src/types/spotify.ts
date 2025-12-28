export interface SpotifyRequestVariables {
	enableWatchFeedEntrypoint?: boolean;
	limit?: number;
	uri: string;
};

export interface SpotifyAPIRequest <TVariables extends SpotifyRequestVariables = SpotifyRequestVariables> {
	variables: TVariables;
	operationName: string;
	extensions: {
		persistedQuery: {
			version: number;
			sha256Hash: string;
		};
	};
};

export interface SpotifyExternalUrl {
	spotify: string;
};

export interface SpotifyImage {
	height?: number | null;
	width?: number | null;
	url: string;
};

export interface SpotifyArtist {
	external_urls: SpotifyExternalUrl;
	type: "artist";
	name: string;
	href: string;
	uri: string;
	id: string;
};

export interface SpotifyAlbum {
	album_type: string;
	artists?: SpotifyArtist[];
	available_markets?: string[];
	external_urls: SpotifyExternalUrl;
	href: string;
	id: string;
	images: SpotifyImage[];
	name: string;
	release_date: string | null;
	release_date_precision: "day" | "month" | "year" | null;
	total_tracks: number | null;
	type: "album";
	uri: string;
};

export interface SpotifyTrack {
	album: SpotifyAlbum;
	artists: SpotifyArtist[];
	available_markets?: string[];
	disc_number?: number;
	duration_ms?: number;
	explicit: boolean;
	external_ids?: Record<string, unknown>;
	external_urls: SpotifyExternalUrl;
	href: string;
	id: string;
	is_local: boolean;
	is_playable?: boolean;
	name: string;
	popularity: number | null;
	preview_url: string | null;
	track_number?: number;
	type: "track";
	uri: string;
}

export interface SpotifyUser {
	display_name?: string | null;
	external_urls?: SpotifyExternalUrl;
	href?: string | null;
	id?: string | null;
	type?: string | null;
	uri?: string | null;
};

export interface SpotifyPlaylistTrackItem {
	added_at?: string | null;
	added_by?: SpotifyUser | null;
	is_local?: boolean;
	primary_color?: string | null;
	track?: SpotifyTrack | null;
	video_thumbnail?: { url?: string | null };
};

export type SpotifyRecommendations = {
	seeds: {
		afterFilteringSize: number;
		afterRelinkingSize: number;
		href: string;
		id: string;
		initialPoolSize: number;
		type: "track";
	}[];
	tracks: SpotifyTrack[];
};

export interface SpotifyPlaylist {
	collaborative: boolean;
	description: string | null;
	external_urls: SpotifyExternalUrl;
	followers: { href: string | null; total: number | null };
	href: string;
	id: string;
	images: SpotifyImage[];
	name: string;
	owner: SpotifyUser;
	primary_color?: string | null;
	public?: boolean | null;
	snapshot_id?: string | null;
	tracks: {
		href: string;
		items: SpotifyPlaylistTrackItem[];
		limit?: number;
		next?: string | null;
		offset?: number;
		previous?: string | null;
		total?: number;
	};
	type: "playlist";
	uri: string;
};

export interface RecommendationSeed {
	afterFilteringSize: number;
	afterRelinkingSize: number;
	href: string;
	id: string;
	initialPoolSize: number;
	type: "track";
};

export interface RecommendationsResponse {
	seeds: RecommendationSeed[];
	tracks: SpotifyTrack[];
};

export interface SpotifyPlaylistTrackItem {
	track?: SpotifyTrack | null;
};

export interface SpotifyWebPlaylistTracksResponse {
	items?: SpotifyPlaylistTrackItem[];
};

export interface PartnerImage {
	url?: string;
	width?: number;
	height?: number;
};

export interface PartnerProfile {
	name?: string;
};

export interface PartnerArtist {
	uri?: string;
	profile?: PartnerProfile;
};

export interface PartnerAlbum {
	uri?: string;
	coverArt?: {
		sources?: PartnerImage[];
	};
	name?: string;
};

export interface PartnerContentRating {
	label?: string;
};

export interface PartnerTrackDuration {
	totalMilliseconds?: number;
};

export interface PartnerPlayability {
	playable?: boolean;
};

export interface PartnerArtistCollection {
	items?: PartnerArtist[];
};

export interface PartnerTrackData {
	__typename?: string;
	albumOfTrack?: PartnerAlbum;
	artists?: PartnerArtistCollection;
	discNumber?: number;
	trackDuration?: PartnerTrackDuration;
	contentRating?: PartnerContentRating;
	uri?: string;
	name?: string;
	trackNumber?: number;
	playability?: PartnerPlayability;
};

export interface PartnerPlaylistItem {
	itemV2?: {
		data?: PartnerTrackData;
	};

	// optional metadata included by partner responses
	addedAt?: string;
	added_at?: string;
	addedBy?: {
		uri?: string;
		href?: string;
		profile?: { name?: string };
	};
};

export interface PartnerPlaylistResponse {
	data?: {
		playlistV2?: {
			content?: {
				items?: PartnerPlaylistItem[];
			};
			// optional metadata mirrored from the Web API
			uri?: string;
			name?: string;
			description?: string;
			images?: PartnerImage[];
			owner?: { uri?: string; href?: string; profile?: { name?: string } };
			followers?: { total?: number };
			public?: boolean;
			snapshotId?: string;
			collaborative?: boolean;
		};
	};
};

export interface PartnerRecommendationItem {
	// some partner persisted queries return items wrapped as { content: { data: ... } }
	// while others return { data: ... } at the top level. Support both shapes.
	content?: {
		data?: PartnerTrackData;
	};
	data?: PartnerTrackData;
};

export interface PartnerRecommendationsResponse {
	data?: {
		internalLinkRecommenderTrack?: {
			items?: PartnerRecommendationItem[];
		};
		// some partner endpoints return recommendations under `seoRecommendedTrack`
		// (observed in partner responses). Support that shape as a fallback.
		seoRecommendedTrack?: {
			items?: PartnerRecommendationItem[];
		};
	};
};

export type PlaylistRequestVariables = {
	uri: string;
	enableWatchFeedEntrypoint: boolean;
	limit: number,
};

export type RecommendationRequestVariables = {
	uri: string;
	limit: number;
};