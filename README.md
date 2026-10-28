# Sonara-API

Spotify resolver API: playlists, recommendations and lyrics, with built-in anonymous token generation (Playwright).

- Resolves full playlists (up to 10,000 tracks) and track recommendations without a Spotify developer account.
- Generates the anonymous web player tokens in-process with a headless Chromium, refreshed in the background.
- Exposes those tokens for [LavaSrc](https://github.com/topi314/LavaSrc)/Lavalink (`/spotifytoken`, `/clienttoken`).
- Responses follow the Spotify Web API object shapes.

## Setup

> [!NOTE]
> Requires Node.js >= 22.18.

```bash
pnpm install
pnpm install:browser   # downloads the Chromium build matching the installed Playwright version
cp .env.example .env
```

Every setting is optional, see [`.env.example`](.env.example):

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `1500` | HTTP port |
| `BROWSER_PATH` | bundled Chromium | Path to a Chromium executable (Pterodactyl / restricted environments) |
| `API_KEY` | none | Required key for every route except `/health`, see [Access control](#access-control) |
| `RATE_LIMIT_PER_MINUTE` | `0` (off) | Requests per minute and per IP |
| `TRUST_PROXY` | `false` | Read the client IP from `X-Forwarded-For` / `X-Real-IP`. Only behind a reverse proxy |
| `SPOTIFY_SP_DC` | none | `sp_dc` cookie of a Spotify account, enables `/lyrics` |
| `CACHE_DIR` | `./cache` | Disk cache folder |
| `CACHE_MEMORY_MAX_MB` | `200` | Total size of the JSON kept in memory, all caches together |
| `CACHE_MEMORY_TTL_HOURS` | `12` | In-memory lifetime |
| `CACHE_DISK_TTL_HOURS` | `24` | On-disk lifetime, `0` = never expires |
| `SPOTIFY_MARKET` | none | Country code (e.g. `FR`) for the `/full` routes: tracks get `is_playable` instead of the long `available_markets` list, which makes responses much lighter |
| `SPOTIFY_PLAYLIST_HASH` · `SPOTIFY_RECOMMENDATIONS_HASH` | built-in | Persisted query hashes of the web player, to override if Spotify rotates them |

Spotify only serves lyrics to logged-in users, so `/lyrics` needs the `sp_dc` cookie of an account
(open.spotify.com while logged in, browser dev tools, Application, Cookies). Use a separate account, not your personal one.
The cookie stays valid for about a year, or until that account logs out everywhere.

## Usage

```bash
pnpm dev          # watch mode (tsx)
pnpm start        # tsx, no build step

pnpm build        # tsc && tsc-alias -> dist/
pnpm start:prod   # node dist/index.js
pm2 start ecosystem.config.cjs   # after pnpm build

pnpm test         # Vitest
pnpm typecheck    # tsc, sources and tests
pnpm lint         # Biome: formatting + lint, no changes
pnpm format       # Biome: formats and applies safe fixes
```

Keep a single instance: the token cache and the browser lock live in memory.

On `SIGINT`/`SIGTERM`, the server stops accepting connections and lets in-flight requests finish (up to 8s) before exiting.

### Docker

The image is based on the official Playwright image, Chromium included:

```bash
docker build -t sonara-api .
docker run -d -p 1500:1500 --env-file .env -v sonara-cache:/app/cache sonara-api
```

The container reports its state through `/health` (`docker ps` shows `healthy` once the tokens are ready).

## Endpoints

| Route | Description |
| --- | --- |
| `GET /playlist/:id` · `GET /playlist?url=` | Playlist with all its tracks (max 10,000) |
| `GET /playlist/full/:id` · `GET /playlist/full?url=` | Same, with full Web API track objects. Requires `client_id`/`client_secret` |
| `GET /recommendations/:id?limit=5` · `GET /recommendations?url=` | Recommendations for a track (`limit` 1-100, default 5) |
| `GET /recommendations/full/:id` · `GET /recommendations/full?url=` | Same, with full Web API track objects. Requires `client_id`/`client_secret` |
| `GET /lyrics/:id` · `GET /lyrics?url=` | Lyrics of a track. Requires `SPOTIFY_SP_DC` |
| `GET /spotifytoken` | Anonymous access token (LavaSrc `customTokenEndpoint`) |
| `GET /clienttoken` | Spotify client token |
| `GET /health` | `status`, uptime and which tokens are ready. 200 when the access and client tokens are available, 503 otherwise. No call to Spotify, safe to poll |

`url` accepts an open.spotify.com URL (with or without locale prefix and query) or a `spotify:<type>:<id>` URI.

Credentials for the `/full` routes can be passed as headers (`X-Client-Id` / `X-Client-Secret`, or `X-Spotify-Client-Id` / `X-Spotify-Client-Secret`)
or as query params (`client_id`, `client_secret`). They come from an app on the [Spotify developer dashboard](https://developer.spotify.com/dashboard).
Prefer the headers: URLs, query included, end up in the access logs of reverse proxies and load balancers.

Playlist and recommendation responses carry an `ETag`: send it back in `If-None-Match` and the API answers `304 Not Modified` without a body when nothing changed.
Responses are gzip-compressed when the client sends `Accept-Encoding: gzip`.

LavaSrc example:

```yaml
spotify:
  preferAnonymousToken: true
  customTokenEndpoint: "http://localhost:1500/spotifytoken"
  # with API_KEY set: "http://localhost:1500/spotifytoken?key=<your key>"
```

## Access control

Both are off by default, for a server only reachable from your own machines.

- **`API_KEY`**: every route except `/health` requires the key, as `Authorization: Bearer <key>`, `X-API-Key: <key>` or `?key=<key>`
  (the query param is for clients that only take a URL, like LavaSrc). Otherwise the API answers `401`.
- **`RATE_LIMIT_PER_MINUTE`**: requests per minute and per IP. Over the limit the API answers `429` with `Retry-After`.
  Every response carries `X-RateLimit-Limit` and `X-RateLimit-Remaining`.
- Behind a reverse proxy (nginx, Caddy, Cloudflare...), set **`TRUST_PROXY=true`** so the limit applies to the real client IP and not to the proxy.
  Leave it off otherwise: anyone could send a fake `X-Forwarded-For` to dodge the limit.

## Responses

### Playlist

A Web API [playlist object](https://developer.spotify.com/documentation/web-api/reference/get-playlist), with every track in `tracks.items` (no pagination, `tracks.next` is always `null`).

```json
{
	"id": "37i9dQZF1DXcBWIGoYBM5M",
	"name": "Today's Top Hits",
	"description": "...",
	"images": [{ "url": "https://...", "width": 640, "height": 640 }],
	"owner": { "id": "spotify", "display_name": "Spotify", "...": "..." },
	"followers": { "href": null, "total": 34000000 },
	"tracks": {
		"total": 50,
		"items": [
			{
				"added_at": "2026-10-24T04:00:00Z",
				"track": {
					"id": "4uLU6hMCjMI75M1A2tKUQC",
					"name": "...",
					"duration_ms": 213573,
					"explicit": false,
					"artists": [{ "id": "...", "name": "...", "uri": "spotify:artist:..." }],
					"album": { "id": "...", "name": "...", "images": [{ "url": "https://..." }] },
					"uri": "spotify:track:4uLU6hMCjMI75M1A2tKUQC"
				}
			}
		]
	}
}
```

On `/playlist`, tracks are built from Spotify's internal API: `popularity`, `preview_url`, `external_ids` and `album.release_date` are not available (`null` or empty).
On `/playlist/full`, each `track` is the complete Web API [track object](https://developer.spotify.com/documentation/web-api/reference/get-track) (ISRC in `external_ids`, `popularity`, release date...).

### Recommendations

Same shape as the Web API recommendations: `seeds` describes the seed track, `tracks` holds the recommended tracks (light or full, as above).

```json
{
	"seeds": [{ "id": "4uLU6hMCjMI75M1A2tKUQC", "type": "track", "initialPoolSize": 5, "afterFilteringSize": 5, "afterRelinkingSize": 5, "href": "..." }],
	"tracks": [{ "id": "...", "name": "...", "artists": [], "album": {}, "is_playable": true }]
}
```

### Lyrics

Spotify's `lyrics` object, as sent to the web player:

```json
{
	"lyrics": {
		"syncType": "LINE_SYNCED",
		"lines": [{ "startTimeMs": "1230", "words": "...", "endTimeMs": "0" }],
		"provider": "MusixMatch",
		"providerDisplayName": "Musixmatch",
		"language": "en"
	}
}
```

`syncType` tells whether `lines` are timed (e.g. `LINE_SYNCED`) or plain text (`UNSYNCED`).

### Errors

Errors are returned as `{ "error": "<message>" }`:

| Status | When |
| --- | --- |
| 400 | Missing or unparsable id/url, missing `client_id`/`client_secret` |
| 401 | Invalid `client_id`/`client_secret`, missing or wrong `API_KEY` |
| 404 | Playlist not found or private, track without lyrics |
| 429 | Rate limit of this API (`RATE_LIMIT_PER_MINUTE`), or Spotify's that did not clear after the retries |
| 502 | Unexpected error from Spotify |
| 503 | Spotify tokens unavailable, or lyrics disabled (`SPOTIFY_SP_DC` not set) |
| 504 | Spotify did not answer in time |

Calls to Spotify time out after 15s and are retried up to 3 times on network errors, 429 (honoring `Retry-After`) and 5xx.

## Cache

- Two levels: memory (LRU), then JSON files under `cache/` (`playlists`, `playlists-full`, `recommendations`, `recommendations-full`, `lyrics`).
- The memory cache stores serialized JSON, sent as is, and is capped by `CACHE_MEMORY_MAX_MB` across all caches: the least recently used entries go first.
- Concurrent requests for the same resource share a single Spotify call.
- Errors are never cached. Files are written atomically, so a crash never leaves a truncated file.
- Playlists generated by Spotify (Daily Mix, radios, Discover Weekly, Release Radar) and playlists with "mix" or "radio" as a word in their name
  stay in memory for 1h only and are not written to disk.
- Recommendations are fetched once with the maximum `limit` (100) and every smaller `limit` is served from it; empty results are not written to disk.
- Tracks without lyrics are remembered in memory for 6h only.
- Expired files are removed at startup and every 6h.

## Tokens

- The access token and the client token are captured from a single Chromium page load.
- The user agent sent to Spotify follows the version of the bundled Chromium.
- The anonymous token is refreshed in the background 60s before it expires, so requests never wait for Chromium.
- Concurrent requests during a refresh share the same fetch. A failed background refresh is retried after 30s.
- On a 401 from Spotify, the token that was rejected is invalidated and the request is retried once.

## Structure

```
src/
├── config/env.ts              # environment settings
├── middlewares/               # API key, rate limit, error handler
├── routes/spotify.routes.ts   # resolver routes
├── services/
│   ├── spotify.service.ts     # Spotify API calls (pagination, parallel batches)
│   ├── lyrics.service.ts      # Spotify lyrics
│   ├── cache.service.ts       # memory + disk cache, request de-duplication
│   └── token.service.ts       # tokens (in-process anonymous + Web API client_credentials)
├── token/
│   ├── browser.ts             # Playwright: token capture
│   ├── handler.ts             # access/client/account token slots, Hono handlers
│   ├── request.ts             # TokenSlot: cache, single-flight refresh, timer
│   └── index.ts               # shared instance `tokenHandler`
├── types/{spotify,token}.ts
├── utils/                     # extractors, transformers, http, ip, playlists, user-agent, logger, semaphore
└── index.ts                   # Hono server
test/                          # Vitest
```

Import aliases: `@/*` → `src/*` (keep the `.js` extension; `tsc-alias` rewrites them at build time).

## Credits

Token generation is based on [devoxin/anonify](https://github.com/devoxin/anonify), see `LICENSE.accessify`.
