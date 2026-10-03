module.exports = {
	apps: [
		{
			name: "Spotify-API",
			// Point PM2 straight at the built entrypoint (run `pnpm build` first).
			// Going through a package manager makes PM2 track the wrapper's PID.
			script: "dist/index.js",
			cwd: __dirname,

			exec_mode: "fork",
			// Must stay at 1: the token cache and the browser lock live in memory.
			instances: 1,

			autorestart: true,
			// Playwright launches a fresh Chromium per token fetch; only the node
			// process is counted here, the browsers are short-lived children.
			max_memory_restart: "500M",
			min_uptime: "10s",
			max_restarts: 10,
			restart_delay: 2000,

			// The app reads .env itself via `dotenv/config`.
			env: {
				NODE_ENV: "production",
			},

			time: true,
			merge_logs: true,
		},
	],
};
