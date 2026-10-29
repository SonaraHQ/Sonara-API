# Copilot instructions

The full instructions for coding agents are in [AGENTS.md](../AGENTS.md) at the repository root. Read it before you change anything. The rules that matter most:

- Sonara-API is a TypeScript server (Hono, Node.js 24, pnpm). Routes are in `src/routes/`, Spotify calls in `src/services/`, settings in `src/config/env.ts`.
- Responses are a contract: Sonara and LavaSrc parse them. Don't rename or remove fields, paths or status codes unless the task asks for it.
- Never commit `.env`, and never log `sp_dc` cookies, `API_KEY`, client secrets or tokens.
- A new environment variable goes in `src/config/env.ts`, `.env.example` and the README.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` before you hand over. Biome does the formatting.
- Commit messages: `[+] Add ...` for something new, `[~] ...` for everything else, one imperative sentence ending with a period. Don't bump the version or edit `CHANGELOG.md`.
- Change only what the task needs. A person reviews and runs the change before a PR goes up, and the PR description says that AI helped.
