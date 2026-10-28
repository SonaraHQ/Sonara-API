# Sonara-API

Merge of two projects into a single server:

- **hfy** (Search): Spotify resolver for playlists and recommendations.
- **accessify** (Token): anonymous Spotify token generation with Playwright. Based on [devoxin/anonify](https://github.com/devoxin/anonify), see `LICENSE.accessify`.

The resolver gets its token directly in-process (`src/token/`) instead of calling `TOKEN_ENDPOINT` over HTTP.
The `/spotifytoken` and `/clienttoken` routes are still exposed for LavaSrc/Lavalink.

## Setup

> [!NOTE]
> Requires Node.js >= 22.18.

```bash
pnpm install
pnpm install:browser   # downloads the Chromium build matching the installed Playwright version
cp .env.example .env
```

`.env`:

```env
PORT=1500
# Optional: path to a Chromium executable (Pterodactyl / restricted environments)
# BROWSER_PATH=/home/container/chrome-linux/chrome
```

Optional cache settings:

```env
CACHE_DIR=cache              # default: ./cache
CACHE_MEMORY_TTL_HOURS=12    # in-memory lifetime
CACHE_DISK_TTL_HOURS=24      # on-disk lifetime, 0 = never expires (old behavior)
```

Optional Spotify lyrics:

```env
SPOTIFY_SP_DC=...            # sp_dc cookie of a Spotify account, enables GET /lyrics
```

Spotify only serves lyrics to logged-in users, so `/lyrics` needs the `sp_dc` cookie of an account
(open.spotify.com while logged in, browser dev tools, Application, Cookies). Use a separate account, not your personal one.
The cookie stays valid for about a year, or until that account logs out everywhere.

`TOKEN_ENDPOINT` is no longer used.

## Usage

```bash
pnpm dev          # watch mode (tsx)
pnpm start        # tsx, no build step

pnpm build        # tsc && tsc-alias -> dist/
pnpm start:prod   # node dist/index.js
pm2 start ecosystem.config.cjs   # after pnpm build
```

Keep a single instance: the token cache and the browser lock live in memory.

## Endpoints

| Route | Description |
| --- | --- |
| `GET /playlist/:id` · `GET /playlist?url=` | Playlist (Partner API), all tracks (paginated, max 10,000) |
| `GET /playlist/full/:id` · `GET /playlist/full?url=` | Full details, requires `client_id`/`client_secret` |
| `GET /recommendations/:id?limit=5` · `GET /recommendations?url=` | Recommendations (`limit` 1-100, default 5) |
| `GET /recommendations/full/:id` · `GET /recommendations/full?url=` | Full details, requires `client_id`/`client_secret` |
| `GET /lyrics/:id` · `GET /lyrics?url=` | Spotify lyrics of a track (`lyrics` object from Spotify: `syncType`, `lines`, `providerDisplayName`). Requires `SPOTIFY_SP_DC`; 404 when the track has no lyrics, 503 when lyrics are disabled |
| `GET /spotifytoken` | Anonymous access token (LavaSrc `customTokenEndpoint`) |
| `GET /clienttoken` | Spotify client token |
| `GET /health` | `status`, uptime and which tokens are ready. 200 when the access and client tokens are available, 503 otherwise. No call to Spotify, safe to poll |

`url` accepts an open.spotify.com URL (with or without locale prefix and query) or a `spotify:<type>:<id>` URI.

Credentials for the `/full` routes can be passed as query params (`client_id`, `client_secret`)
or as headers (`X-Client-Id` / `X-Client-Secret`, or `X-Spotify-Client-Id` / `X-Spotify-Client-Secret`).
Response formats are documented in `../Search/README.md`.

Responses are gzip-compressed when the client sends `Accept-Encoding: gzip`.

LavaSrc example:

```yaml
spotify:
  preferAnonymousToken: true
  customTokenEndpoint: "http://localhost:1500/spotifytoken"
```

## Cache

- Two levels: memory (LRU), then JSON files under `cache/` (`playlists`, `playlists-full`, `recommendations`, `recommendations-full`).
- Concurrent requests for the same resource share a single Spotify call.
- Playlists whose name contains "mix" or "radio" stay in memory for 1h only and are not written to disk.
- Recommendations are cached per `trackId + limit`; empty results are not written to disk.
- Expired files are removed at startup and every 6h.

## Tokens

- The anonymous token is refreshed in the background 60s before it expires, so requests never wait for Chromium.
- Concurrent requests during a refresh share the same fetch. A failed background refresh is retried after 30s.
- On a 401 from Spotify, the token is invalidated and the request is retried once.

## Structure

```
src/
├── config/env.ts              # PORT, BROWSER_PATH, cache settings
├── routes/spotify.routes.ts   # resolver routes
├── services/
│   ├── spotify.service.ts     # Spotify API calls (pagination, parallel batches)
│   ├── cache.service.ts       # memory + disk cache, request de-duplication
│   └── token.service.ts       # tokens (in-process anonymous + Web API client_credentials)
├── token/                     # formerly accessify
│   ├── browser.ts             # Playwright: token capture
│   ├── handler.ts             # access/client token slots, Hono handlers
│   ├── request.ts             # TokenSlot: cache, single-flight refresh, timer
│   └── index.ts               # shared instance `tokenHandler`
├── types/{spotify,token}.ts
├── utils/{extractors,transformers,logger,semaphore}.ts
└── index.ts                   # single Hono server
```

Import aliases: `@/*` → `src/*` (keep the `.js` extension; `tsc-alias` rewrites them at build time).
