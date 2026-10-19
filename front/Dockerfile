# Paperweek front (Nuxt), a Co-Sy satellite site. Multi-stage, non-root.
# Spec: co-sy-v2 docs/todo/084-paperweek-satellite-pilot/deploy/RUN-SHEET-paperweek.md, steps 0b and 8.
#
# The six values below are read at BUILD time (nuxt.config.ts: the sign-in scopes are built from
# the two project ids) and are public ids and addresses, never secrets. nuxt.config.ts refuses a
# production build when any of them is missing, so a missing value fails this build.
#
# Build:   docker build -t cosy-paperweek-front:<tag> front \
#            --build-arg COSY_ISSUER=... --build-arg COSY_SATELLITE_CLIENT_ID=... \
#            --build-arg COSY_SATELLITE_PROJECT_ID=... --build-arg COSY_PROJECT_ID=... \
#            --build-arg COSY_API_BASE=.../api --build-arg NUXT_PUBLIC_BACKEND_BASE=...

# ---- build stage ----
FROM node:22-slim AS build
WORKDIR /app
# Declared before npm ci (the order is free: nuxt.config.ts checks the six values only at
# `nuxt build`, never during npm ci's `nuxt prepare`).
ARG COSY_ISSUER
ARG COSY_SATELLITE_CLIENT_ID
ARG COSY_SATELLITE_PROJECT_ID
ARG COSY_PROJECT_ID
ARG COSY_API_BASE
ARG NUXT_PUBLIC_BACKEND_BASE
# The whole context (see .dockerignore); vendor/ holds the @co-sy/satellite-auth tarball that
# package.json points at.
COPY . .
RUN npm ci --no-audit --no-fund
RUN npx nuxt build

# ---- runtime: slim, non-root, production ----
FROM node:22-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --chown=node:node --from=build /app/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
