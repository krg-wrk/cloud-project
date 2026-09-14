# The Hub, as one image.
#
# A starting point rather than a house standard: whoever hosts this will have
# a base image, a registry and a scanner of their own, and swapping the two
# `FROM` lines is the whole of that change. What is worth keeping is the
# shape — build in one stage, ship only what runs in the next, and never copy
# node_modules across.
#
# Node 22 is a floor, not a preference: the SQLite path uses `node:sqlite`,
# which does not exist before it.

# --- build ------------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app

# The manifests first, so a change to the code does not re-resolve every
# dependency. This is the one layer worth caching.
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci

COPY . .
RUN npm run build

# The tests run against server/dist, which is what ships — so running them
# here tests the artefact rather than the source. Remove this line if the CI
# pipeline already gates the image.
RUN npm test -w server

# Drop everything the running server does not need: the client's toolchain,
# every type package, the test runners.
RUN npm prune --omit=dev

# --- run --------------------------------------------------------------------
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

# Not root. The Hub writes nothing outside its database, and its database is
# either Postgres or a mounted volume.
USER node

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/server/package.json ./server/package.json
COPY --from=build --chown=node:node /app/server/dist ./server/dist
# The built client, which the server serves from the same origin in production.
COPY --from=build --chown=node:node /app/client/dist ./client/dist

EXPOSE 3001

# Unauthenticated on purpose, so a load balancer can call it.
HEALTHCHECK --interval=30s --timeout=4s --start-period=20s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
