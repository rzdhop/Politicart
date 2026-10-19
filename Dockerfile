# The Kart République game server: the built game plus team races, on one port.
#
#   docker build -t kart-republique .
#   docker run --rm -p 8080:8080 kart-republique      # http://localhost:8080/
#   docker run --rm -p 8080:8080 -v kr-data:/data kart-republique   # cast edits kept
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
RUN npm run build -w @kart-republique/ui && npm run build -w @kart-republique/game

FROM node:26.10.0-bookworm-slim
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ui/package.json packages/ui/
COPY apps/game/package.json apps/game/
COPY apps/server/package.json apps/server/
RUN npm ci --omit=dev --no-audit --no-fund --workspace=@kart-republique/server && npm cache clean --force
COPY apps/server/src apps/server/src
COPY apps/game/src/engine apps/game/src/engine
COPY --from=build /app/apps/game/dist apps/game/dist
# The admin's cast edits. Fly mounts its volume here owned by root; without a
# volume the image's own /data is used (and lost with the container).
ENV KR_DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
EXPOSE 8080
# The server never runs as root. Started as root (the default, and what Fly
# does), the entrypoint hands /data to node, then drops to node with setpriv
# (util-linux, in every Debian image) and execs the server as PID 1, so it
# gets SIGTERM. Started as node already (`docker run --user node`), it just
# execs the server.
ENTRYPOINT ["/bin/sh", "-c", "if [ \"$(id -u)\" = 0 ]; then chown node:node /data && exec setpriv --reuid=node --regid=node --init-groups -- \"$@\"; fi; exec \"$@\"", "kr-entrypoint"]
CMD ["node", "apps/server/src/main.js"]
