import { isDynamicPlaylist } from "@/utils/playlists.js";
import { describe, expect, it } from "vitest";

describe("isDynamicPlaylist", () => {
	it.each([
		["37i9dQZF1E37jO8SiMT0yN", "Daily Mix 1"],
		["37i9dQZEVXcJZyENOWUFo7", "Discover Weekly"],
		["37i9dQZF1E4yrYiQJfy370", "Song Radio"],
		["5ABHKGoOzxkaa28ttQV9sE", "Chill mix"],
		["5ABHKGoOzxkaa28ttQV9sE", "Radio FR"],
	])("treats %s (%s) as dynamic", (id, name) => {
		expect(isDynamicPlaylist({ id, name })).toBe(true);
	});

	it.each([
		["37i9dQZF1DXcBWIGoYBM5M", "Today's Top Hits"],
		["5ABHKGoOzxkaa28ttQV9sE", "Best Remixes"],
		["5ABHKGoOzxkaa28ttQV9sE", "Mixtape 2026"],
		["5ABHKGoOzxkaa28ttQV9sE", "Radiohead essentials"],
	])("keeps %s (%s) as a regular playlist", (id, name) => {
		expect(isDynamicPlaylist({ id, name })).toBe(false);
	});
});
