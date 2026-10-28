# Official Playwright image: Node.js plus Chromium and its system libraries.
# Its version must match the `playwright` dependency, keep both in sync when upgrading.
FROM mcr.microsoft.com/playwright:v1.64.1-noble AS base
WORKDIR /app
RUN npm install -g pnpm@11.21.0

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM base
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/cache && chown pwuser /app/cache

USER pwuser
EXPOSE 1500
VOLUME ["/app/cache"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
	CMD node -e "fetch('http://localhost:' + (process.env.PORT || 1500) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "dist/index.js"]
