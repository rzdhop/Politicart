# The Politikart game server: the built game plus team races, on one port.
#
#   docker build -t politikart .
#   docker run --rm -p 8080:8080 politikart      # http://localhost:8080/
#
# Stage 1 builds the design system and the game. Stage 2 keeps only what the
# server runs: its own sources, the engine it imports from apps/game/src/engine,
# the built game it serves, and the server's production dependencies.

FROM node:26.10.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ui/package.json packages/ui/
COPY apps/game/package.json apps/game/
COPY apps/server/package.json apps/server/
RUN npm ci --no-audit --no-fund
COPY packages/ui packages/ui
COPY apps/game apps/game
RUN npm run build -w @politikart/ui && npm run build -w @politikart/game

FROM node:26.10.0-bookworm-slim
# Accounts go to a JSON file under /data unless DATABASE_URL names a Postgres
# database. Mount a volume on /data or they are lost with the container.
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 POLITIKART_DATA=/data/politikart-accounts.json
RUN mkdir -p /data && chown node:node /data
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ui/package.json packages/ui/
COPY apps/game/package.json apps/game/
COPY apps/server/package.json apps/server/
RUN npm ci --omit=dev --no-audit --no-fund --workspace=@politikart/server && npm cache clean --force
COPY apps/server/src apps/server/src
COPY apps/game/src/engine apps/game/src/engine
COPY --from=build /app/apps/game/dist apps/game/dist
USER node
EXPOSE 8080
CMD ["node", "apps/server/src/main.js"]
