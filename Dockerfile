FROM node:24-bookworm-slim AS base
WORKDIR /app
# pnpm at the version of the `packageManager` field
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Only the headless shell of Chromium and its system libraries, at the version of the installed `playwright`
RUN node node_modules/playwright/cli.js install --with-deps --only-shell chromium \
	&& rm -rf /var/lib/apt/lists/* \
	&& mkdir -p /app/cache && chown node:node /app/cache

USER node
EXPOSE 1500
VOLUME ["/app/cache"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
	CMD node -e "fetch('http://localhost:' + (process.env.PORT || 1500) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "dist/index.js"]
