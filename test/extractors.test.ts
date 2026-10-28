import { extractPlaylistId, extractTrackId } from "@/utils/extractors.js";
import { describe, expect, it } from "vitest";

const PLAYLIST_ID = "7epfU4cGVZ1xHWQbQJl7km";
const TRACK_ID = "4uLU6hMCjMI75M1A2tKUQC";

describe("extractPlaylistId", () => {
	it.each([
		[PLAYLIST_ID],
		[`https://open.spotify.com/playlist/${PLAYLIST_ID}`],
		[`https://open.spotify.com/playlist/${PLAYLIST_ID}?si=abc123`],
		[`https://open.spotify.com/intl-fr/playlist/${PLAYLIST_ID}/`],
		[`spotify:playlist:${PLAYLIST_ID}`],
		[`${PLAYLIST_ID}&limit=5`],
		[`  ${PLAYLIST_ID}#fragment `],
		[encodeURIComponent(`https://open.spotify.com/playlist/${PLAYLIST_ID}`)],
	])("extracts the id from %s", (input) => {
		expect(extractPlaylistId(input)).toBe(PLAYLIST_ID);
	});

	it("does not take a track URL for a playlist", () => {
		expect(extractPlaylistId(`https://open.spotify.com/track/${TRACK_ID}`)).toBe(`https://open.spotify.com/track/${TRACK_ID}`);
	});
});

describe("extractTrackId", () => {
	it.each([[TRACK_ID], [`https://open.spotify.com/track/${TRACK_ID}?si=x`], [`spotify:track:${TRACK_ID}`]])("extracts the id from %s", (input) => {
		expect(extractTrackId(input)).toBe(TRACK_ID);
	});

	it("returns unparsable input unchanged", () => {
		expect(extractTrackId("not an id")).toBe("not an id");
		expect(extractTrackId("")).toBe("");
	});
});
