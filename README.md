# Sonara-API

[![CI](https://github.com/SonaraHQ/Sonara-API/actions/workflows/ci.yml/badge.svg)](https://github.com/SonaraHQ/Sonara-API/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Self-hosted Spotify resolver API: full playlists, recommendations and lyrics, with built-in anonymous token generation.

- **No developer account needed** for playlists (up to 10,000 tracks) and recommendations.
- **Web API compatible** responses, with optional full track details through your own Spotify app credentials.
- **Token endpoint for [LavaSrc](https://github.com/topi314/LavaSrc)/Lavalink**, refreshed in the background.
- **Built to be exposed**: memory and disk cache, automatic retries, optional API key and rate limit, Docker image.

## Quick start

Requires Node.js 24 or later. [nvm](https://github.com/nvm-sh/nvm) ([nvm-windows](https://github.com/coreybutler/nvm-windows) on Windows)
installs and switches Node.js versions: `nvm install 24`.

```bash
corepack enable   # provides the pnpm version of package.json
pnpm install
pnpm install:browser
cp .env.example .env
pnpm build && pnpm start:prod
```

The API listens on `http://localhost:1500`. With PM2: `pm2 start ecosystem.config.cjs`.

### Docker

Images for `amd64` and `arm64` are published on GitHub Container Registry:

```bash
docker run -d -p 1500:1500 --env-file .env -v sonara-cache:/app/cache ghcr.io/sonarahq/sonara-api:latest
```

To build it yourself: `docker build -t sonara-api .`

## Configuration

Every setting is optional. See [`.env.example`](.env.example) for details.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `1500` | HTTP port |
| `API_KEY` | — | Require a key on every route except `/health` |
| `RATE_LIMIT_PER_MINUTE` | `0` | Requests per minute and per IP, `0` to disable |
| `TRUST_PROXY` | `false` | Read the client IP from proxy headers, only behind a reverse proxy |
| `SPOTIFY_SP_DC` | — | `sp_dc` cookie of a Spotify account, enables `/lyrics` |
| `SPOTIFY_MARKET` | — | Country code for the `/full` routes, makes responses lighter |
| `CACHE_DIR` | `cache` | Disk cache folder |
| `CACHE_MEMORY_MAX_MB` | `200` | Memory cache size |
| `CACHE_MEMORY_TTL_HOURS` | `12` | Memory cache lifetime |
| `CACHE_DISK_TTL_HOURS` | `24` | Disk cache lifetime, `0` = never expires |
| `BROWSER_PATH` | bundled | Custom Chromium executable |

## API

| Route | Description |
| --- | --- |
| `GET /playlist/:id` | Playlist with all its tracks |
| `GET /playlist/full/:id` | Same, with full track details ¹ |
| `GET /recommendations/:id?limit=5` | Recommendations for a track, `limit` from 1 to 100 |
| `GET /recommendations/full/:id?limit=5` | Same, with full track details ¹ |
| `GET /lyrics/:id` | Lyrics of a track ² |
| `GET /spotifytoken` | Anonymous access token |
| `GET /clienttoken` | Spotify client token |
| `GET /health` | Service status, safe to poll |

Every route taking an `:id` also accepts `?url=` with an open.spotify.com link or a `spotify:` URI.

¹ Requires the credentials of an app from the [Spotify developer dashboard](https://developer.spotify.com/dashboard),
sent as `X-Client-Id` / `X-Client-Secret` headers (or `client_id` / `client_secret` query params).

² Requires `SPOTIFY_SP_DC`, the `sp_dc` cookie of a Spotify account (open.spotify.com while logged in, browser dev tools, Application, Cookies).
Use a dedicated account rather than your personal one. Spotify serves lyrics to Free and Premium accounts, but may cap how many lyrics
a Free account can view per month: prefer a Premium account if you rely on lyrics.

Responses follow the Spotify Web API [playlist](https://developer.spotify.com/documentation/web-api/reference/get-playlist)
and [track](https://developer.spotify.com/documentation/web-api/reference/get-track) objects.
Errors are returned as `{ "error": "<message>" }` with a matching HTTP status.

### Authentication

When `API_KEY` is set, send it as `Authorization: Bearer <key>`, `X-API-Key: <key>` or `?key=<key>`.

### LavaSrc

```yaml
spotify:
  preferAnonymousToken: true
  customTokenEndpoint: "http://localhost:1500/spotifytoken"
```

Append `?key=<key>` to the URL when `API_KEY` is set.

## Development

```bash
pnpm dev         # watch mode
pnpm test        # tests
pnpm lint        # lint and formatting check
pnpm typecheck   # type check
```

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Credits

Token generation is based on [devoxin/anonify](https://github.com/devoxin/anonify) ([license](LICENSE.accessify)).

## License

[MIT](LICENSE)
