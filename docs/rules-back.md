# Rules: Backend (`back/`)

Applies to everything under `back/`. Shape (WHAT): [`architecture-back.md`](architecture-back.md). Read [`rules-system.md`](rules-system.md) first.

## 1. Stack (fixed)

- **NestJS 11**.
- **TypeScript**, `strict: true`. No plain-JS source.
- Package manager: **npm** (the repo standard). Commit `package-lock.json`.
- **Prisma 6** + **PostgreSQL**.

## 2. Project conventions

- Live entirely inside `back/`. Never reach outside it.
- Follow NestJS module structure: feature **modules**, each with its
  controllers, services, and DTOs. Keep modules cohesive and small.
- File naming follows Nest conventions: `*.module.ts`, `*.controller.ts`,
  `*.service.ts`, `*.dto.ts`, `*.spec.ts`.
- Business logic lives in **services**, not controllers. Controllers are thin.

## 3. API design

- REST by default (unless a task specifies otherwise). Version the API where it
  makes sense (`/api/v1/...`).
- **Validate all input** at the boundary using DTOs + `class-validator` and a
  global `ValidationPipe` (whitelist on). **Validation is server-side only** — the front
  duplicates no rules (one source of truth); it renders what the envelope returns.
- **Deny-by-default.** A global `JwtAuthGuard` protects **every** route; make a route
  anonymous ONLY with an explicit `@Public()`. Never rely on "forgot to add a guard" — the default
  is protected. Controller `RolesGuard` gates authorization on top.
- **Rate limiting.** `@nestjs/throttler`, **in-memory** (single VM to start). Limits are **per
  handler**: a caller-keyed default budget (body identifier → bearer subject → client IP) under a
  per-address ceiling, and a tighter limit on public side-effecting routes. The two throttlers are
  a pair — the caller-keyed one reads an *unverified* token (it runs ahead of `JwtAuthGuard` so
  floods die before JWKS work), and the address ceiling is what stops a forged-subject flood; never
  ship one without the other. `trust proxy` should be configured to match the real deployment
  topology (exactly as many hops as the actual reverse proxy chain) — never trust more hops than
  exist, and never trust any in dev, where the header is spoofable.
  **Loopback may be exempted in development only**: loopback peers can skip both throttlers when
  `NODE_ENV !== 'production'`, but the exemption must be **structurally** unreachable in
  production — never a runtime `if` inside a shared `skipIf`, since behind any reverse proxy every
  request presents as `127.0.0.1` and an ungated exemption would silently disable rate limiting for
  the whole internet.
- **Error envelope: the client gets only what it may show a user.**
  `error.message` = user-displayable (and the **major**/form-level error when `error.fields`
  is empty) · `error.fields[]` = `{field, message, code}` keyed by the **submitted JSON key**
  (dot-path when nested) so a form can mark the offending input.
  **Diagnostics never cross the wire** — upstream errors, stack traces and internals are
  **logged** against `meta.requestId` and stay on the server; the user quotes the requestId,
  we grep it. Never put internals in `message`, and never add a `detail`-style field to the
  envelope "just for dev" — the wire shape is identical in every environment on purpose.
- Return typed responses. Don't leak internal entities directly; map to DTOs.
- **JSDoc, Swagger/OpenAPI and logging:** see [`rules-autodoc-logging.md`](rules-autodoc-logging.md)
  (SSOT). It governs JSDoc-every-file, the swagger CLI plugin, `@ApiTags`/`@ApiOperation`,
  **response DTOs over inline return types**, and how to learn what an endpoint does.
- **Every response is the standard envelope** `{ data, meta, error }` — success and error
  alike — applied globally by a response interceptor + exception filter in `back/src/common/`.
  Controllers never return raw; **nothing bypasses**. The front consumes it via one `useApi`
  fetcher; no client call happens outside it. Envelope type is SSOT (`back/` emits OpenAPI →
  `front` generates).
- Configuration via `@nestjs/config`; every env var is in `back/.env.example`.
  No hard-coded secrets, ports, or URLs. Default port **3201**.

## 4. Auth

- The backend **trusts Zitadel** for identity (shared local instance, `http://localhost:8080`,
  org "Productivity"). It validates OIDC/JWT access tokens (issuer, audience, signature) — it does
  not issue its own tokens or store passwords.
- Authorization (guards/roles) is enforced in the backend based on verified token claims. See
  [`rules-auth.md`](rules-auth.md).
- **Data access is scoped per user, not per org.** Every `Theme`/`Task` row carries an `ownerId`
  set from the JWT `sub`; every service query filters by `ownerId`. There is no per-organization
  Postgres row-level security to enforce here — see [`rules-database.md`](rules-database.md) for
  the full tenancy model. A caller may only read or write rows whose `ownerId` matches their own
  subject — **except** a caller authenticated as the `prod-agent` service account holding the
  `agent` role, whose effective `ownerId` is resolved from the `X-On-Behalf-Of` header instead of
  its own subject. See [`rules-agentic.md`](rules-agentic.md) for that mechanism in full; this is
  the single sanctioned exception to "the caller only ever touches their own rows."

## 5. Quality gates

- `npm run build` succeeds (`nest build`).
- `npx prisma generate` runs before the build in any gate — a stale client passes `nest build`
  today and breaks the next schema-touching change tomorrow; regenerate unconditionally, don't
  wait for "did the schema change?" to be judged by hand.
- Type-check passes with zero errors (`strict`).
- Lint passes; code is Prettier-formatted.
- Unit tests for non-trivial services (`*.spec.ts`) and they pass.
- No secrets, no `console.log` for real logging ([`rules-autodoc-logging.md`](rules-autodoc-logging.md) §3).

## 6. Don'ts

- No new top-level docs — keep documentation inside `docs/`.
- No committing `.env`, `dist/`, `node_modules/`, or coverage output.
- No importing frontend code; no direct coupling to the frontend.
