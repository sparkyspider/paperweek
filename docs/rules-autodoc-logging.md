# Rules: Autodoc & Logging

**Cross-cutting — everyone who writes code reads this.** How code describes itself (JSDoc →
OpenAPI) and what it records at runtime (logs). Shape (WHAT): `architecture-autodoc-logging.md`.
Why: `decisions-autodoc-logging.md`. Read `rules-system.md` first.

**Scope (D-adl-002).** Documentation that lives in or is generated from **source**. The
hand-written `.md` governance docs are governed by `CLAUDE.md` + `rules-system.md` —
nothing here applies to them.

## 1. JSDoc — every file says what it is for

- **`back/`: JSDoc every file.** Module, controller, service, DTO and entity each open with a
  `/** … */` block stating their purpose, so the file is legible without reading the body.
- **`front/`: JSDoc every component.** The first thing inside `<script setup lang="ts">` is a
  `/** … */` block stating what the component is for.
- JSDoc is not decoration: the Swagger CLI plugin reads it (`introspectComments`), so a DTO's
  comments become its OpenAPI descriptions. Write it for both readers.

## 2. OpenAPI — the API's machine-readable contract

- **Swagger is enabled app-wide in dev/test — and OFF in production** (`NODE_ENV=production`
  never mounts the routes → 404). UI at `/api/docs`, JSON at `/api/docs-json`. That JSON is the
  **front's generated-types source**.
- **DTOs self-document.** The swagger CLI plugin (`nest-cli.json`, `introspectComments`) derives
  schemas from TS types + `class-validator` + JSDoc. Add `@ApiProperty` only to override or
  annotate — never to restate what the type already says.
- Controllers carry **`@ApiTags`** + **`@ApiOperation`**.
- **Return a DTO class, not an inline type.** The plugin resolves **classes**; it emits *no schema
  at all* for inline object literals (`Promise<{ id: string }>`) or interfaces. An endpoint
  without a response DTO is an endpoint absent from the contract — and `rules-back.md` already
  forbids leaking internal Prisma entities, so map to a DTO either way.
- **The plugin is compile-time.** It only runs under `nest build` / `nest start`. Generating the
  document any other way (bare `ts-node`) silently produces a *worse* document — don't trust it.
- **To learn what a `back/` endpoint does** (AI or human): read its **JSDoc** and/or fetch
  `/api/docs-json`. The document is **authoritative for response shapes** — every 2xx is the
  `{data,meta,error}` envelope with a named type in `data`.
- **The contract should be gated.** A `test:openapi` suite that asserts the above over every
  route (built from `dist/`, since the plugin only runs at compile time) is the recommended
  enforcement — see `decisions-back.md` for whether/when it lands here. Never weaken an assertion
  to get a green run.
- **The X-On-Behalf-Of / agent API surface is part of this contract too.** Endpoints reachable by
  the `agent` role / prod-agent service account get the same JSDoc + `@ApiOperation` treatment as
  any other route — an agent driving the API by intent needs the same machine-readable contract a
  human-facing client does.

## 3. Logging — what is settled

- **No `console.log` for real logging** — in `back/` use Nest's `Logger`; in `front/` no
  `console.log` survives into committed code.
- **Every log line carries the `requestId`** the envelope minted (`meta.requestId`) — one id joins
  what the user saw to what we recorded.
- **Diagnostics stay server-side.** Upstream errors, stack traces and internals are logged, never
  put on the wire; the client gets a short safe message plus the `requestId`.
- **Never log secrets or credentials.** No tokens, passwords, API keys, cookies, `Authorization`
  headers, or the `X-On-Behalf-Of` header's value beyond the identifier it names. Log
  **identifiers, not credentials** (`rules-security.md`).
- **Prefer identifiers and counts over bulk personal content in logs.** Theme and Task data is a
  person's own planning content (titles, notes) — log ids, counts, states and timestamps for
  diagnosis; avoid dumping full task/theme text into log lines. This is a lighter version of a
  rule co-sy-v2 needed at legal-document strength (never log document wording or a resolved
  merge-field value) — the underlying instinct (the log outlives the request, is read by more
  people for longer, and shouldn't carry content it doesn't need) still applies here even though
  the content itself is lower-stakes.
- **Reduce an exception before you log it.** An error message is the one string in the system
  that nobody here wrote and nobody bounded. `PrismaClientValidationError` renders the **whole
  call-arguments object** into its own message, and `Error.stack` opens with that same message —
  so a raw stack can put more than intended into a log line. Prefer a helper that keeps an
  error's name, code and first line and says how much was withheld, over
  `${(e as Error).message}` or `logger.error(line, e.stack)` verbatim.
- **Library is pino** (via Nest's `Logger`, pino-backed) — a structured, level-aware JSON logger.
  Do **not** add a second logging dependency or a bespoke formatter.
- **Log level is per-AREA and env-driven** (no rebuild). The "area" is the `Logger` **context**
  string. `LOG_LEVEL` = global floor; `LOG_LEVEL_<AREA>` overrides one area (e.g.
  `LOG_LEVEL_AUTH=debug`). Name the context after the module (`'Auth'`, `'Zitadel'`, `'Themes'`,
  `'Tasks'`, …) so it can be tuned.
- **Secrets are redacted by construction** (pino `redact`) — never rely on remembering not to log a
  token; the logger censors `password`/`token`/`authorization`/`cookie`/… regardless.

## 4. Logging — what is NOT settled (do not drift)

Retention/rotation, log shipping and alerting are not decided here — they're an ops concern to
settle when this project deploys past local dev, and belong in `rules-deployment.md` when they
are. Don't pre-empt it; today's `new Logger('X')` usage stands.

## 5. Don'ts

- No `@ApiProperty` that merely repeats the TS type.
- No endpoint shipped with an inline/interface return type (§2) — it documents nothing.
- No second logging library or bespoke formatter — logging goes through Nest's `Logger`/pino (§3).
- No diagnostic detail added to the response envelope "just for dev".
