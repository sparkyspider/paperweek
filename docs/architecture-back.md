# Architecture: Backend (`back/`)

**The WHAT** — the shape of the NestJS backend. Read this to understand it, then
follow `rules-back.md` (HOW). Why: `decisions-back.md`. Read
[`architecture-system.md`](architecture-system.md) first.

**KEEP TERSE.** A map. Structure once; constraints live in `rules-back.md`, signposted.

---

## Model

NestJS 11 (TS strict). REST API (`/api/v1/...`). A feature = a **server module**
paired with a `front/` client module. Independently deployable container
(architecture-deployment.md). Default port **3201**.

## Request path

```
HTTP request
  └─ JwtAuthGuard (common/)    validate Bearer JWT via Zitadel JWKS; user/roles from claims
       └─ Controller (thin)    validates input via DTO + global ValidationPipe
            └─ Service (logic)  business logic + ownerId scoping lives here
                 └─ Prisma      query filtered by ownerId (own rows only, or the
                      │          X-On-Behalf-Of subject for an `agent`-role caller)
                      ▼
                 PostgreSQL
  ◀─ Envelope { data, meta, error }   a global interceptor + exception filter wrap EVERY
                                      response (success/error alike); DTOs, no raw entities
```

## Module layout

- **`common/`** (cross-cutting, every module uses it): the **envelope** interceptor + exception
  filter + `Envelope<T>` type, the **JWKS auth guard** + `@CurrentUser()`/roles, `ZitadelService`,
  `PrismaService`.
- **Feature modules** `back/src/<feature>/`: `*.module/.controller(thin)/.service(logic)/.dto/.spec`.
  Core feature modules: `themes/` (life-themes), `tasks/` (backlog + week-grid items).
- Config via `@nestjs/config`; every env var in `back/.env.example`; port from env (default 3201).

## Identity & authorization

Back is a stateless **OIDC resource server** — validates each access token (issuer/audience/
signature via JWKS/expiry), user/roles from verified claims only, never the body. Session model:
front holds the access JWT client-side; token refresh via Zitadel's own flow. There is a **single
org** ("Productivity") — no org switching, no per-org token minting, no `X-Acting-Org` header.

**Data scoping is per user, not per org.** Every `Theme`/`Task` row carries `ownerId` (the JWT
`sub`). A service filters every query by `ownerId` unconditionally — this is the whole of the
authorization model for normal callers; there is no RLS-by-organization to layer on top of it,
because there is only one organization. Detail: `rules-database.md`, `rules-back.md` §4.

**The one exception — agent access.** A caller authenticated as the `prod-agent` service account,
carrying the `agent` role/claim, may send an `X-On-Behalf-Of: <userId>` header; the backend then
resolves the effective `ownerId` from that header instead of the caller's own subject. Every other
caller is refused if it sends that header. Full design: `rules-agentic.md`,
`decisions-agentic.md`, and the repo-root `AGENTS.md` for the operational how-to.

**Deny-by-default:** every route needs a valid JWT unless `@Public()`. Public routes are
rate-limited (see `rules-back.md` §3).

## Data

Persistence = PostgreSQL + Prisma, per-user `ownerId` scoping (architecture-database.md).
