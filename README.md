# Productivity Tools

A TeuxDeux-style weekly planner. See `SPEC.md` for the product spec and `AGENTS.md` for the
API contract + agent authentication. This file covers running `back/` locally.

## Stack

- **back/** — NestJS 11 + Prisma 6 + PostgreSQL, port **3201**.
- **front/** — Nuxt (owned by a separate build; see its own docs), port **3200**.
- **auth/** — Zitadel provisioning scripts. Zitadel itself is **shared** from `co-sy-v2/auth`
  (`http://localhost:8080`) — see `auth/README.md`. No docker-compose here.

## First-time setup

```bash
# 1. Postgres role + database (already created for this machine; see auth/README.md if not)
psql postgres -c "CREATE ROLE productivity WITH LOGIN PASSWORD '...';"
psql postgres -c "CREATE DATABASE productivity OWNER productivity;"

# 2. Zitadel — provisions the "Productivity" org, populates back/.env
./auth/bootstrap-productivity.sh
./auth/add-user.sh mark@flyh2.com "Mark van Wyk" admin,user

# 3. back/
cd back
cp .env.example .env   # then fill in DATABASE_URL — bootstrap already filled the Zitadel vars
npm install
npx prisma migrate deploy
MARK_ZITADEL_USER_ID=<printed by add-user.sh> npm run prisma:seed
npm run start:dev
```

Backend listens on `http://localhost:3201`. Health check: `GET /health` → `{"status":"ok"}`
(wrapped in the standard envelope). Swagger (dev only): `http://localhost:3201/api/docs`.

## Don't touch

- `co-sy-v2/auth` — shared Zitadel instance. Never `docker compose down -v` there. Never
  modify the "Co-Sy" org.
- Ports **3100/3101** — Mark's own `org.co-sy.board-web` / `org.co-sy.board-api` launchd
  services. This app uses 3200/3201.

## Design

Single-org, per-user app (SPEC.md: Mark and Tarryn each have their own themes/tasks in one
shared Zitadel org, "Productivity"). Deliberately stripped of co-sy-v2's multi-tenant
machinery: no org switching, no org-drift reconciliation, no RLS-per-org (plain tables scoped
by `ownerId` at the service layer), no invitations module. See `AGENTS.md` for what an AI
agent can do here and how.
