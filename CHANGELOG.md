# Changelog

## 1.3.0

### Added

- Docker images for `amd64` and `arm64` published on GitHub Container Registry (`ghcr.io/sonarahq/sonara-api`) for every release.
- Dependabot updates and a security policy.

### Changed

- **Node.js 24 or later is now required** (was 22.18), to run on the current LTS line and its security fixes.
- The Docker image is based on `node:24-bookworm-slim` with the Chromium headless shell only (1.2GB, was 3.8GB with the full Playwright image).

### Upgrade notes

- Without Docker: update Node.js to 24 before `pnpm install`.

## 1.2.0

### Added

- Optional API key (`API_KEY`): sent as `Authorization: Bearer`, `X-API-Key` or `?key=`. `/health` stays public.
- Optional rate limit per IP (`RATE_LIMIT_PER_MINUTE`), with `TRUST_PROXY` to read the client IP behind a reverse proxy.
- `ETag` on playlist and recommendation responses, answered with `304 Not Modified` on `If-None-Match`.
- `CACHE_MEMORY_MAX_MB`: memory budget shared by all caches, the least recently used entries are evicted first.
- `SPOTIFY_MARKET`: country code for the `/full` routes, which drops the long `available_markets` lists.
- `SPOTIFY_PLAYLIST_HASH` / `SPOTIFY_RECOMMENDATIONS_HASH` to override the persisted query hashes when Spotify rotates them.
- Graceful shutdown: in-flight requests finish (up to 8s) before the process exits.
- Dockerfile based on the official Playwright image, with a healthcheck.
- Tests (Vitest), Biome config, `lint`/`format`/`test` scripts and a CI workflow.

### Changed

- Error responses keep their real status: 404 for a missing or private playlist, 401 for invalid credentials, 429, 502, 503, 504 (was always 500).
- Calls to Spotify time out after 15s and are retried up to 3 times on network errors, 429 (honoring `Retry-After`) and 5xx.
- Playlists are fetched by pages of 5,000 tracks (was 1,000).
- Recommendations are fetched once with `limit=100` and smaller limits are served from that result.
- Access and client tokens are captured from a single Chromium launch.
- The user agent sent to Spotify follows the bundled Chromium version.
- `/spotifytoken` and `/clienttoken` answer 503 with the reason when the token is unavailable (was `500 {}`).
- Dynamic playlists (kept 1h in memory only) are detected by Spotify's generated playlist ids and by whole words: "Remix" or "Mixtape" playlists are cached normally.
- The version shown on `/` is read from `package.json`.

### Fixed

- A missing or private playlist, or an outdated persisted query hash, was cached as an empty playlist for 24h.
- A request hanging on Spotify blocked every later request for the same resource.
- Concurrent requests for the same resource could both call Spotify.
- A late 401 could discard a freshly refreshed token and relaunch Chromium.
- A crash while writing the disk cache could leave a truncated file.

### Upgrade notes

- Run `pnpm build` again before restarting with PM2.
- The recommendation cache files of 1.1.0 (`<id>_<limit>.json`) are no longer read and get pruned after `CACHE_DISK_TTL_HOURS`.
