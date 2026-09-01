# Decisions: Autodoc & Logging

Durable decisions for **how the code describes itself** (JSDoc → OpenAPI) and **what it
records at runtime** (logs). Distilled — conversation in `DISCUSSION.txt`, shape in
`architecture-autodoc-logging.md`, rules in `rules-autodoc-logging.md`. IDs are `D-adl-*`.

**KEEP TERSE.** Read on every build; every token counts. One line title + 1–2
lines max. Append only; reverse via new entry + `Superseded by`. Promote hard
rules into `rules-autodoc-logging.md`. Status: `Decided` · `Proposed` · `Open` · `Superseded`.

**IDs D-adl-001…008 are inherited from co-sy-v2**, where the numbering originated. All of
them describe stack-level plumbing (JSDoc/OpenAPI/pino conventions) rather than co-sy's
business, so all are carried forward here as still applicable, verbatim except naming/paths.

---

- **D-adl-001 · Autodoc & logging is its own cross-cutting area** — Decided (inherited)
  JSDoc, OpenAPI/Swagger and logging are one concern — machine- and human-readable
  self-description, at the API boundary and at runtime — and cross-cutting, so they
  get their own `architecture`/`rules`/`decisions` trio rather than being scattered
  across `rules-back`/`front`/`users`.

- **D-adl-002 · "Autodoc" means generated-from-code ONLY — the `.md` docs are out of scope** — Decided (inherited)
  This area covers documentation that **lives in or is derived from source**: JSDoc blocks, the
  OpenAPI document, generated client types. The hand-written governance docs (`CLAUDE.md`,
  `architecture-*`, `rules-*`, `decisions-*`) are governed by `CLAUDE.md` + `rules-system.md`.

- **D-adl-003 · One `requestId` joins the client's response to the server's log** — Decided (inherited)
  The envelope mints a `requestId` (`meta.requestId`); the exception filter logs diagnostics
  against that same id. The user quotes the id, we grep it.

- **D-adl-006 · The OpenAPI document is the authoritative response contract** — Decided (inherited)
  Every operation's 2xx is the `{data,meta,error}` envelope, 400/401/500 are documented, and
  every route returns a DTO class so `data` is a named type. The document is a safe
  type-generation source for `front/`.

- **D-adl-007 · Return a DTO class, never an inline type or interface** — Decided (inherited)
  The swagger plugin resolves **classes** only: it emits *no schema at all* for
  `Promise<{a: string}>` or an interface, so such a route is absent from the contract entirely.
  Folded into `rules-autodoc-logging.md` §2.

- **D-adl-008 · Swagger is dev/test only — production never mounts /api/docs** — Decided (inherited)
  The full API surface map is not public: skip `SwaggerModule.setup` when
  `NODE_ENV=production` (routes 404).

---

## New for this project

No new decision earned its own entry at founding time — the JSDoc/OpenAPI/logging
conventions above transfer to this stack without modification, and the one genuinely
new fact (the `agent`/`X-On-Behalf-Of` API surface uses the same autodoc pipeline as the
human-facing one, rather than a separate contract) is recorded as architecture, not a
decision — see `architecture-autodoc-logging.md` §3. Add an entry here if that changes.
