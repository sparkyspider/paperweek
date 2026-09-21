# Decisions: Backend

Durable `back/` decisions. Distilled — rules in `rules-back.md`.

**KEEP TERSE.** Read on every build; every token counts. One line title + 1–2
lines max. Append only; reverse via new entry + `Superseded by`. Promote hard
rules into `rules-back.md`. Status: `Decided` · `Proposed` · `Open` · `Superseded`.

Entries below D-back-010 are inherited from co-sy-v2 where the pattern is generic backend
engineering practice (IDs kept as originally numbered there). Entries specific to co-sy's
agreements/documents/signing domain, multi-org RLS, or invitations (co-sy's D-back-003,
011–017) were not carried forward — they don't apply to a single-org, per-user app.

---

- **D-back-001 · NestJS 11 + TS strict** — Decided 2026-07-07
  Latest stable NestJS, `strict: true`, npm + lockfile. Thin controllers, logic
  in services, feature modules.

- **D-back-002 · Global validation + config** — Decided 2026-07-07
  Global `ValidationPipe({ whitelist, transform })`; `@nestjs/config` global;
  port from env (`PORT`, default 3201). No hard-coded secrets/ports/URLs.

- **D-back-004 · Mandatory response envelope** — Decided 2026-07-14
  Every `back/` response — success, error, validation, auth-fail — is wrapped in one canonical
  envelope `{ data, meta, error }` by a **global response interceptor + exception filter**.
  Controllers never return raw; **nothing bypasses**. Front consumes it via the single `useApi`
  fetcher — no client call happens outside it. Envelope type is SSOT (`back/` emits OpenAPI →
  `front` generates). Lives in `back/src/common/` (cross-cutting, not per-feature).

- **D-back-005 · Module layout — `common/` (cross-cutting) + feature modules** — Decided 2026-07-14
  Cross-cutting infra (envelope interceptor/filter, JWKS auth guard, PrismaService) lives in
  `back/src/common/`; each feature is a self-contained module (`back/src/<feature>/`).

- **D-back-006 · Envelope errors — the client gets a safe message; diagnostics stay on the server** — Decided 2026-07-15
  Extends D-back-004's `error`. **The client is told only what it may show a user**: **`message`** =
  user-displayable, and with no `fields` it IS the **major** (form-level) error; **`fields[]`** =
  `{field, message, code}` where `field` is the **submitted JSON key** (dot-path when nested) so a
  form marks the offending input. **Diagnostics NEVER cross the wire** — upstream errors, stack
  traces and internals are logged against **`meta.requestId`** and stay server-side; the requestId
  is the handle joining what the user saw to what we logged. **No environment-dependent shape**:
  identical wire everywhere, so no "safe in dev, leaks in prod" surprise. **Validation is
  server-side ONLY** — the front duplicates no rules; it renders what the envelope says.

- **D-back-007 · Deny-by-default auth + in-memory rate limiting** — Decided 2026-07-16
  Two global `APP_GUARD`s, in order: **(1)** a throttler tracker guard (runs first — reject floods
  before any JWKS work), **(2)** `JwtAuthGuard` — so **every route requires a valid JWT unless
  marked `@Public()`**. Controller-level `RolesGuard` runs after both. **Rate limits:**
  `@nestjs/throttler` **in-memory** (single VM), a global default budget + a tighter limit on
  public side-effecting routes, **per-target keying** (caller identifier if available, else IP).
  `trust proxy` deliberately NOT set until a real reverse-proxy topology exists in front of it.
  **Loopback exempted in development only** — the exemption must be structurally unreachable in
  production (never a runtime `if` inside a shared `skipIf`), since behind any reverse proxy every
  request presents as loopback and an ungated exemption would disable rate limiting globally and
  silently.

- **D-back-008 · Logging = pino, with PER-AREA env levels** — Decided 2026-07-20
  Logging library is **pino**, wrapped by a logger service, set via `app.useLogger` so ordinary
  `new Logger('X')` call sites keep working unchanged. The Nest `Logger` context string is the
  "area"; each context becomes a pino **child logger whose level is resolved per-area from env**:
  `LOG_LEVEL` is the global floor, `LOG_LEVEL_<AREA>` overrides one area. Also: one `requestId`
  minted once per request, correlating response header and logs; secret redaction by construction;
  one request-log line per call. Pretty in dev / JSON in prod. Folded into
  `rules-autodoc-logging.md` §3.

- **D-back-009 · `common/` → `core/` layout + `core/security` SecurityModule** — Decided 2026-07-20
  **Rule:** a `src/` subfolder gets a `.module.ts` **iff it provides an injectable**. Injectable-
  providing infra lives under **`core/`** (`prisma` · `email` · `zitadel` · `logging` · `security`)
  and **`common/`** holds only dependency-free utilities (`envelope` · `contracts` · `throttler`).
  `common/auth` is a real **`@Global` `SecurityModule`** (`core/security`) exporting
  `RolesGuard`/`PlatformAdminGuard`/`SameOriginGuard` — features stop copy-declaring guards.
  **`JwtAuthGuard` stays the single app-module `APP_GUARD`** (deny-by-default) and is deliberately
  **not** provided by SecurityModule, since its `onModuleInit` reads `ZitadelService.issuerUrl`
  (JWKS) and a second copy would race its init ahead of `ZitadelService`.

- **D-back-010 · Auth upstream unreachable is a NAMED third failure class: 503
  `AUTH_UPSTREAM_UNAVAILABLE`** — Decided 2026-07-25
  Transport failure to Zitadel (container down, DNS, timeout) is neither a Zitadel *answer*
  (→ 502 UPSTREAM_ERROR) nor our bug (500 INTERNAL_ERROR): `ZitadelService` wraps every raw fetch,
  throws `AuthUpstreamUnavailableError`, and the envelope filter renders **503
  `AUTH_UPSTREAM_UNAVAILABLE` · "Could not contact the authentication service."** Blanket catches in
  auth flows rethrow it — an outage never reads as "Incorrect email or password."

- **D-back-011 · Per-user `ownerId` is the backend's data-access rule, enforced on every query** — Decided 2026-09-01
  `Theme` and `Task` carry `ownerId` (JWT `sub`); every service method filters by it — there is no
  organization-scoped RLS layer to enforce alongside it, because productivity-tools has a single
  org. The one sanctioned exception is a caller holding the `agent` role acting via
  `X-On-Behalf-Of` (see `decisions-agentic.md`). **Why:** this app has no multi-tenant boundary to
  defend — the tenancy rationale (why per-user rather than per-org, why no Postgres RLS is needed)
  lives in `decisions-database.md`; this entry records only the consequence for backend code: the
  `ownerId` filter is not optional per-query discipline, it is the equivalent of what co-sy-v2's
  RLS-by-org gave that project — a query that forgets it is a security bug, not a style nit.

- **D-back-012 · `POST /api/tasks/:id/restore` — undo for the soft delete, reaching a row past the deferred-commit window** — Decided 2026-09-21
  Backs the front end's Cmd+Z (`D-front-038`). `softDelete` only sets `deletedAt`; this route
  clears it, owner-scoped exactly like every other task route, and finds the row even though it
  is already soft-deleted (the owner-lookup helper never filtered on `deletedAt`, so no new bypass
  was needed). Exists because the front end holds a delete behind a 5s deferred commit before
  ever sending it — within that window Undo just cancels the pending request, but once it has
  actually fired there was no way back without a real restore endpoint.
