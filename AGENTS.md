# AGENTS.md

Notes for AI coding agents working on Sonara-API. Humans are welcome to read it too.

We're happy to get contributions written with AI, and just as happy to get ones written by hand. Both are held to the same bar: the change works, it's small enough to review, and a person stands behind it. This file is about meeting that bar when an agent does part of the work. If the person you're working for or a maintainer tells you something different, do what they say.

Codex, Cursor, Windsurf, Zed, Jules and most other agents read this file directly. `CLAUDE.md` (Claude Code), `GEMINI.md` (Gemini CLI) and `.github/copilot-instructions.md` (GitHub Copilot) point here. Keep the rules in this file so they don't drift apart.

## What Sonara-API is

Sonara-API is a small self-hosted server that resolves Spotify playlists, recommendations and lyrics, and hands out anonymous Spotify tokens. It's written in TypeScript with [Hono](https://hono.dev/) and runs on Node.js 24. A headless Chromium (Playwright) fetches the tokens. The main clients are the [Sonara](https://github.com/SonaraHQ/Sonara) Lavalink plugin and LavaSrc.

- `src/index.ts`: the app, middleware order and graceful shutdown.
- `src/routes/`: the HTTP routes.
- `src/services/`: Spotify calls, lyrics, tokens and the cache.
- `src/token/`: token fetching with Chromium and token refresh.
- `src/middlewares/`: API key, rate limit and error handling.
- `src/config/env.ts`: every environment variable.
- `test/`: Vitest tests.

Imports use the `@/` alias with a `.js` extension (`@/utils/http.js`), like the existing code.

## Before you start

- Read the code around what you're changing and copy how it does things.
- Check open issues and PRs first. If someone is already working on the same thing, say so instead of building a second version.
- Base your branch on current `main`.
- Look at the working tree. Changes you didn't make belong to someone else: don't commit, reformat or discard them.

## Rules that matter here

- **Responses are a contract.** Sonara and LavaSrc parse the JSON this server returns, and it follows the Spotify Web API objects. Don't rename or remove fields, or change a route's path or status codes, unless the task is exactly that. Prefer additive changes, and say in the PR when a change can break a client.
- **Secrets stay out of the repo and the logs.** Never commit `.env`, and never log `sp_dc` cookies, `API_KEY`, client secrets or tokens.
- **New settings are documented.** A new environment variable goes in `src/config/env.ts`, `.env.example` and the Configuration section of the README.
- **`/health` makes no outbound calls**, so it stays cheap to poll. It's registered before the API key and the rate limit on purpose.
- **Don't guess Spotify's private API.** It changes without notice. Check a real response, or the existing types and transformers, instead of writing a parser from memory. Persisted query hashes stay overridable through the environment.
- **Formatting is Biome's job.** Tabs, double quotes, LF line endings (`.gitattributes` enforces them). Don't reformat files you didn't change.

## Checking your work

Use Node.js 24 (`.nvmrc`) and pnpm through corepack. Run the same steps as CI:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Passing tests don't prove a route works against Spotify. When you change how a route, the cache or the tokens behave, run the server (`pnpm install:browser` once, then `pnpm dev`) and call the routes you changed. If you couldn't do that, say which parts you didn't test.

Only add tests that would catch a real bug: parsers, extractors, cache and token edge cases. Check that a regression test fails without your fix. Put tests in `test/` next to the ones for the same module, and don't add tests that repeat the implementation.

## Keep it small

- Change what the task needs and nothing else. Mention unrelated bugs you notice instead of fixing them in the same diff.
- One fix or feature per PR.
- No unrelated dependency or lockfile updates (Dependabot handles those), no new abstractions "for later".
- Comments explain why, not what the next line does.

## Commits and pull requests

- Commit messages follow the existing history: a tag, then one plain sentence in the imperative, ending with a period.
    - `[+] Add ...` for something new: a route, a feature, a file.
    - `[~] ...` for everything else: changes, fixes, docs, refactors. For example `[~] Fix the cache key for recommendations.`
- Don't bump the version or edit `CHANGELOG.md`. The maintainer does both in the release commit (`[~] Bump version to x.y.z.`). Describe the change in the PR so it can go into the changelog.
- **The person you work for is responsible for the PR.** Before it goes up, they should have read the diff, run the change and be able to answer review questions about it. Only open a PR, or post comments and reviews, when they ask you to.
- **Say that AI helped.** Add one line at the top of the PR description, for example: `Written with help from <tool and model>.` This isn't a penalty, it tells reviewers how to read the PR. Commit trailers like `Co-Authored-By` are fine too.
- In the description, say what changed, why, and how it was tested. Keep it short.
- Don't open many PRs at once, and don't open a PR just to get a contribution in.
- Security problems go through the private advisory in [SECURITY.md](SECURITY.md), not a public issue or PR.

## When you hand over

Tell the person you work for, in your final message:

1. What you changed and what you tested.
2. What you couldn't test, so they can check it themselves.
3. That they need to read the diff before the PR goes up.
