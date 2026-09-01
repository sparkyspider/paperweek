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
- **Never modify the "Co-Sy" org**, its project, apps, or machine users. This app's bootstrap
  (`auth/bootstrap-productivity.sh`) only ever touches the "Productivity" org it creates.
- **Never touch ports 3100/3101.** Those belong to Mark's own launchd services
  (`org.co-sy.board-web` / `org.co-sy.board-api`, `~/Library/LaunchAgents/`), deliberately
  outside this app's port range. This app uses 3200 (front) / 3201 (back).
- **Never write secret values (PATs, client secrets, passwords) to stdout, logs, or any file
  outside `auth/.machinekey/`** (git-ignored). `auth/.machinekey/prod-agent-secret.json` holds
  the credential this document tells you how to use — read it, never print it.
- Themes/tasks are **soft-deleted** everywhere (`archivedAt` / `deletedAt`, row kept). Prefer
  the API's `DELETE` routes over raw SQL; if you must touch the DB directly, never hard-delete
  a user-created row.

## How an agent authenticates

The `prod-agent` Zitadel machine user (provisioned by `auth/bootstrap-productivity.sh`) holds
the project role `agent`. Its client credentials live in
`auth/.machinekey/prod-agent-secret.json`: `{"userId", "clientId", "clientSecret"}`.

Get a token via the OAuth2 **client_credentials** grant, requesting BOTH the project-audience
scope (so the token's `aud` includes the "Productivity Platform" project, which is what
back/'s JWKS-based guard checks) AND the projects-roles scope (so the `agent` role is actually
asserted into the token — verified live: without it, the roles claim is silently absent):

```bash
CLIENT_ID=$(python3 -c "import json;print(json.load(open('auth/.machinekey/prod-agent-secret.json'))['clientId'])")
CLIENT_SECRET=$(python3 -c "import json;print(json.load(open('auth/.machinekey/prod-agent-secret.json'))['clientSecret'])")
PROJECT_ID=<from auth/.env ZITADEL_PROJECT_ID>

TOKEN=$(curl -s -X POST http://localhost:8080/oauth/v2/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d grant_type=client_credentials \
  -d "scope=openid urn:zitadel:iam:org:projects:roles urn:zitadel:iam:org:project:id:${PROJECT_ID}:aud" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])")
```

The resulting JWT's `aud` is `[<projectId>]` and it carries a roles claim under
`urn:zitadel:iam:org:project:<projectId>:roles` — a **different key shape** than a human BFF
login gets (`urn:zitadel:iam:org:project:roles`, no project id in the key). back/'s
`JwtAuthGuard` checks both shapes (`core/security/claims.ts` `ROLES_CLAIM_PATTERN`) and both
audiences (`ZitadelService.audiences` = `[oidcClientId, projectId]`), so either kind of token
authenticates the same routes.

Tokens last ~12h (`expires_in`); just request a fresh one, there is no refresh flow for
machine tokens.

### Acting on behalf of a person — `X-On-Behalf-Of`

Every `/api/*` route scopes data by `ownerId`. A caller normally acts as themselves (their
JWT `sub`). The `agent` role may instead act on a named person's behalf by setting:

```
X-On-Behalf-Of: <that person's Zitadel user id>
```

The guard refuses this header outright (403) for any caller that does **not** hold the
`agent` role — it never widens what a non-agent caller can do, only narrows what `prod-agent`
acts as. Omit the header to act as `prod-agent`'s own (empty) data.

Mark's (mark@flyh2.com) Zitadel user id — the value to put in `X-On-Behalf-Of` to manage his
themes/tasks — is `387437754994130946`, or look it up fresh:
`GET /management/v1/users/_search {"queries":[{"emailQuery":{"emailAddress":"mark@flyh2.com","method":"TEXT_QUERY_METHOD_EQUALS_IGNORE_CASE"}}]}`
against Zitadel with any of this app's PATs.

**Mark's account:** home org **FlyH2** (`387435674619346946`, a live tenant org of the
separate `co-sy-v2` app — not this project's org), user id `387437754994130946`. He does not
live in "Productivity" — he reaches this app's `admin`/`user` project roles via Zitadel's
native cross-org mechanism (a project grant of "Productivity Platform" to the FlyH2 org, plus
a user grant for him on it), not a duplicate account. See `auth/README.md` "Known state" and
`docs/decisions-auth.md` D-auth-058.

### Verified live (2026-09-01)

Real curl against the running instance: obtained a `prod-agent` token as above, called
`GET /auth/me` (confirmed `roles: ["agent"]`, `isAgent: true`), created a theme with
`X-On-Behalf-Of: <mark's sub>` (confirmed `ownerId` on the created row = mark's sub, and the
theme appeared in `GET /api/themes` for that owner), and deleted it (soft-archived, then
removed as pure verification noise). Full transcript basis for this doc — not a hypothetical.

## API contract

Base URL: `http://localhost:3201`. **All responses use the envelope**
`{ data, meta: { status, code, requestId, messages? }, error: { code, message, fields? } | null }`.
All `/api/*` routes require `Authorization: Bearer <token>` (human via the BFF, or `prod-agent`
as above). `/auth/*` routes are the BFF surface (see below). Weeks start Monday; dates are
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
- `GET /auth/me` → `{sub, email?, displayName?, roles, isAgent}` — the caller's own profile,
  read off the verified token.

### Themes

```
GET    /api/themes?includeArchived=true|false(default false)
POST   /api/themes {name, color?}                          → position auto-appended
PATCH  /api/themes/:id {name?, color?, position?, archived?}  → archived:true/false sets/clears archivedAt
DELETE /api/themes/:id                                       → soft archive (= PATCH {archived:true})
```

### Tasks

```
GET    /api/tasks?from=YYYY-MM-DD&to=YYYY-MM-DD      → non-deleted scheduled tasks in range
GET    /api/tasks?themeId=<uuid>&backlog=true         → non-deleted unscheduled tasks for a theme
POST   /api/tasks {themeId, title, notes?}            → creates a backlog task
PATCH  /api/tasks/:id {title?, notes?, themeId?, scheduledOn?(YYYY-MM-DD|null), daypart?(morning|afternoon|evening|null), position?, done?}
DELETE /api/tasks/:id                                  → soft delete
```

### curl examples (agent token)

```bash
# List Mark's active themes
curl -s http://localhost:3201/api/themes \
  -H "Authorization: Bearer $TOKEN" -H "X-On-Behalf-Of: $MARK_SUB"

# Create a backlog task
curl -s -X POST http://localhost:3201/api/tasks \
  -H "Authorization: Bearer $TOKEN" -H "X-On-Behalf-Of: $MARK_SUB" \
  -H "Content-Type: application/json" \
  -d '{"themeId":"<theme-uuid>","title":"Renew FlyH2 insurance"}'

# Schedule it for Monday morning
curl -s -X PATCH http://localhost:3201/api/tasks/<task-id> \
  -H "Authorization: Bearer $TOKEN" -H "X-On-Behalf-Of: $MARK_SUB" \
  -H "Content-Type: application/json" \
  -d '{"scheduledOn":"2026-09-07","daypart":"morning"}'

# Mark it done
curl -s -X PATCH http://localhost:3201/api/tasks/<task-id> \
  -H "Authorization: Bearer $TOKEN" -H "X-On-Behalf-Of: $MARK_SUB" \
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

`admin`, `user`, `agent` on the "Productivity Platform" project. The API does not currently
gate any `/api/*` route by role — every valid token may manage its own (or, for `agent`,
its `X-On-Behalf-Of` target's) themes/tasks. `RolesGuard`/`@Roles(...)` exist as reusable
infrastructure for future role-gated routes.
