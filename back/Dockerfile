# Paperweek back (NestJS + Prisma), a Co-Sy satellite API. Multi-stage, non-root, configuration by
# environment only: no .env and no secret is baked in. Mirrors positive-polar-api's Dockerfile.
# Spec: co-sy-v2 docs/todo/084-paperweek-satellite-pilot/deploy/RUN-SHEET-paperweek.md, step 0b.
#
# Build:   docker build -t cosy-paperweek-back:<tag> back
# Migrate: docker build --target build -t cosy-paperweek-back-migrate:<tag> back
#          The build stage keeps the prisma CLI and prisma/migrations for `npx prisma migrate deploy`,
#          run as its own deploy step (compose service paperweek-migrate). The runtime image has no
#          prisma CLI.

# ---- build stage: full deps, generated Prisma client, compiled dist ----
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# vendor/ holds the @co-sy/satellite-guard tarball that package.json points at.
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- prod-deps stage: runtime dependencies only, no dev tooling ----
FROM node:22-slim AS proddeps
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor
# `prisma` (the CLI) is a devDependency but also an optional peer of @prisma/client, so the lockfile
# marks it devOptional and --omit=dev still installs it. The runtime needs only the generated
# client, so the CLI is removed here: the runtime image cannot run migrations.
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && rm -rf node_modules/prisma node_modules/.bin/prisma

# ---- runtime: slim, non-root, production ----
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3201
WORKDIR /app
COPY --chown=node:node --from=proddeps /app/node_modules ./node_modules
# The generated Prisma client (engine and typed client) over the runtime deps.
COPY --chown=node:node --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3201
CMD ["node", "dist/main"]
