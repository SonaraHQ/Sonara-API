function safeDecode(input: string): string {
	try {
		return decodeURIComponent(input);
	} catch {
		return input;
	}
}

// Accepts a raw id, a `spotify:<kind>:<id>` URI or an open.spotify.com URL (with locale prefix, query, etc.)
function extractId(input: string, kind: "playlist" | "track"): string {
	if (!input) return input;

	// Drop query/fragment and accidental appended params like `&limit=5`
	const clean = safeDecode(input)
		.trim()
		.replace(/[?#&].*/s, "")
		.replace(/\/$/, "");

	return clean.match(new RegExp(`(?:spotify:${kind}:|${kind}/)([A-Za-z0-9]+)`))?.[1] ?? clean;
}

export function extractPlaylistId(input: string): string {
	return extractId(input, "playlist");
}

export function extractTrackId(input: string): string {
	return extractId(input, "track");
}
