export function extractPlaylistId(input: string): string {
	if (!input) return input;

	const decoded = decodeURIComponent(input).trim();

	const clean = decoded.split(/[?#]/)[0].replace(/\/$/, "");

	const uriMatch = clean.match(/spotify:playlist:([A-Za-z0-9]+)/);
	if (uriMatch) return uriMatch[1];

	const urlMatch = clean.match(/playlist\/([A-Za-z0-9]+)/);
	if (urlMatch) return urlMatch[1];

	try {
		const u = new URL(clean);
		const parts = u.pathname.split("/").filter(Boolean);
		const idx = parts.indexOf("playlist");
		if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
	} catch {}

	const idMatch = clean.match(/^([A-Za-z0-9_-]{8,})$/);
	return idMatch ? idMatch[1] : clean;
}

export function extractTrackId(input: string): string {
	if (!input) return input;

	// Normalize and remove query/fragment or accidental appended params like
	// `&limit=5` so callers that pass malformed paths still resolve the id.
	const decoded = decodeURIComponent(input).trim();
	const clean = decoded.split(/[?#&]/)[0].replace(/\/$/, "");

	const uriMatch = clean.match(/spotify:track:([A-Za-z0-9]+)/);
	if (uriMatch) return uriMatch[1];

	const urlMatch = clean.match(/track\/([A-Za-z0-9]+)/);
	if (urlMatch) return urlMatch[1];

	try {
		const u = new URL(clean);
		const parts = u.pathname.split("/").filter(Boolean);
		const idx = parts.indexOf("track");
		if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
	} catch {}

	const idMatch = clean.match(/^([A-Za-z0-9_-]{8,})$/);
	return idMatch ? idMatch[1] : clean;
}
