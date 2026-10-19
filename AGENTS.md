# AGENTS.md — Productivity Tools

A TeuxDeux-style weekly planner. Backend: NestJS 11 + Prisma 6 + PostgreSQL, on port **3201**.
Frontend: Nuxt, on port **3200**. Auth: Zitadel OIDC, shared local instance from
`co-sy-v2/auth` (`http://localhost:8080`), own org **"Productivity"**.

This document is for an AI agent calling the API directly — how to authenticate, the full
route contract, and the rules that keep this shared local environment safe for everyone
using it.

## Don't-touch rules — read first

- **Never run `docker compose down -v`** (or any destructive compose command) in
  `co-sy-v2/auth/` — that is the shared Zitadel instance every project on this machine
  depends on, containers included.
- **Never modify the "Co-Sy" org**, its project, apps, or machine users. This app no longer provisions
  anything in Zitadel (old bootstrap script removed 2026-10-19).
- **Never touch ports 3100/3101.** Those belong to Mark's own launchd services
  (`org.co-sy.board-web` / `org.co-sy.board-api`, `~/Library/LaunchAgents/`), deliberately
  outside this app's port range. This app uses 3200 (front) / 3201 (back).
- **Never write secret values (PATs, client secrets, passwords) to stdout, logs, or any file
  outside `auth/.machinekey/`** (git-ignored). The old `prod-agent` credential is retired: an
  agent signs in with its own Public account, and its token is read, never printed.
- Themes/tasks are **soft-deleted** everywhere (`archivedAt` / `deletedAt`, row kept). Prefer
  the API's `DELETE` routes over raw SQL; if you must touch the DB directly, never hard-delete
  a user-created row.

## How an agent authenticates

**Retired (2026-10-19).** The old `prod-agent` client-credentials path and its provisioning
scripts (`auth/bootstrap-productivity.sh`, `auth/add-user.sh`) were removed when Paperweek became a
Co-Sy satellite. Agents acting for a person are parked pending Mark's ruling. Sign-in is now the
Co-Sy satellite guard; see `auth/co-space.json`. The curl examples below are historical.

**Agents now (Mark's ruling 084-Q8, 19 Oct 2026).** An agent signs in with its own Public account,
exactly like a person: Co-Sy's sign-in page, Paperweek's one sign-in app, the same guard. It works
only on its own themes and tasks. `PAPERWEEK_AGENT` adds owner-only hard delete. Nobody acts for
another person: `X-On-Behalf-Of` is ignored, and every row is keyed on the token's `sub`.

## API contract

Base URL: `http://localhost:3201`. **All responses use the envelope**
`{ data, meta: { status, code, requestId, messages? }, error: { code, message, fields? } | null }`.
All `/api/*` routes require `Authorization: Bearer <token>` (a Co-Sy satellite token: a person
or an agent, each signed in as themselves). `/auth/*` routes are the BFF surface (see below). Weeks start Monday; dates are
plain `YYYY-MM-DD` strings, no timezone math server-side.

### Auth (BFF)

**Not** a redirect/authUrl flow — Zitadel's Login V2 hosted UI is not deployed on this shared
instance, so the backend checks the password directly via Zitadel's Session API server-side.

- `POST /auth/login {email, password}` → `{accessToken, expiresIn}` + sets an httpOnly
  `productivity_refresh` cookie (path `/auth`, 30 days).
- `POST /auth/refresh` → `{accessToken, expiresIn}`, rotates the cookie. Cookie-credentialed;
  same-origin only.
- `POST /auth/logout` → `{ok: true}`, revokes the refresh token at Zitadel (best-effort) and
  clears the cookie.
- `GET /auth/me` → `{sub, email?, displayName?, roles, isAgent}` — the caller's own profile.
  For human tokens, queries Zitadel's userinfo endpoint to get email and name. `displayName`
  is the `name` claim, or the email's local part, or `undefined` if neither is available
  (never the raw `sub`; frontend shows a neutral placeholder when `displayName` is absent).

### Themes

```
GET    /api/themes?includeArchived=true|false(default false)
POST   /api/themes {name, color?}                          → position auto-appended
PUT    /api/themes/order {ids: string[]}                     → reorders: ids must be EXACTLY the
                                                                 caller's current active theme id
                                                                 set (no omissions/dupes/foreign
                                                                 ids) or 400; sets position=index
PATCH  /api/themes/:id {name?, color?, position?, archived?}  → archived:true/false sets/clears archivedAt
DELETE /api/themes/:id                                       → soft archive (= PATCH {archived:true})
DELETE /api/themes/:id/hard                                  → PAPERWEEK_AGENT only: deletes the caller's
                                                                 own theme and its tasks for good
                                                                 (not the caller's → 404)
```

### Tasks

```
GET    /api/tasks?from=YYYY-MM-DD&to=YYYY-MM-DD      → non-deleted scheduled tasks in range
GET    /api/tasks?themeId=<uuid>&backlog=true         → non-deleted unscheduled tasks for a theme
POST   /api/tasks {themeId, title, notes?, bold?}     → creates a backlog task (bold defaults to false)
PATCH  /api/tasks/:id {title?, notes?, bold?, themeId?, scheduledOn?(YYYY-MM-DD|null), daypart?(morning|afternoon|evening|notes|null), position?, done?}
DELETE /api/tasks/:id                                  → soft delete
DELETE /api/tasks/:id/hard                             → PAPERWEEK_AGENT only: deletes the caller's own task
                                                          for good (not the caller's → 404)
```

### curl examples (agent token)

Historical: `X-On-Behalf-Of` no longer does anything. An agent sends only its own token.

```bash
# List Mark's active themes
curl -s http://localhost:3201/api/themes \
  -H "Authorization: Bearer $TOKEN"

# Create a backlog task
curl -s -X POST http://localhost:3201/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"themeId":"<theme-uuid>","title":"Renew FlyH2 insurance"}'

# Schedule it for Monday morning
curl -s -X PATCH http://localhost:3201/api/tasks/<task-id> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scheduledOn":"2026-09-07","daypart":"morning"}'

# Mark it done
curl -s -X PATCH http://localhost:3201/api/tasks/<task-id> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"done":true}'
```

## Ports

| Service                          | Port |
|-----------------------------------|------|
| back (this app)                   | 3201 |
| front (this app)                  | 3200 |
| Zitadel (shared, co-sy-v2/auth)   | 8080 |
| Postgres                          | 5432 |
| org.co-sy.board-web (do not touch)| 3100 |
| org.co-sy.board-api (do not touch)| 3101 |

## Roles

Paperweek's project roles, granted in Co-Sy by Public and read only from the verified token
(`auth/co-space.json`): `PAPERWEEK_USER` uses the app; `PAPERWEEK_AGENT` adds the two hard delete
routes, on the caller's own rows only. Every caller manages only its own themes and tasks; no
role reaches another person's rows (084-Q8).
