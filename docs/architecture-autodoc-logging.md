# Architecture: Autodoc & Logging

**WHAT** this area is: the two paths by which the system explains itself — one at the **API
boundary** (autodoc), one at **runtime** (logging). Rules: `rules-autodoc-logging.md`. Why:
`decisions-autodoc-logging.md`.

**Scope line (D-adl-002):** documentation that lives in or is generated from **source code**.
The hand-written `.md` governance docs are `CLAUDE.md`'s business, not this file's.

## 1. The autodoc pipeline — source ⇒ contract ⇒ client types

```
TS types + class-validator + JSDoc      (back/src — written by hand, once)
  └─► @nestjs/swagger CLI plugin        (nest-cli.json, introspectComments — a COMPILE-TIME plugin)
        └─► OpenAPI document            (/api/docs-json · UI at /api/docs)
              └─► front generated types
```

Consequences of that shape, and they bite:
- The plugin reads **declared return types**. It resolves **DTO classes**; it emits nothing for
  inline object literals (`Promise<{ id: string }>`) or interfaces. Response DTOs are
  therefore what makes an endpoint documentable, not an annotation.
- The plugin runs at **compile time** (`nest build` / `nest start`) — never under bare `ts-node`, and
  not under ts-jest either (so any QA gate over the document must build from `dist/`).
- It cannot see **interceptors**, so a response envelope (if one is added) is invisible to it —
  it needs a post-process step over the generated document, the same way co-sy-v2 needed one.

## 2. The logging pipeline — one id, two audiences

```
request ──► envelope mints requestId ──► meta.requestId  ──► CLIENT  (safe message only)
                                    └──► server log      ──► US      (diagnostics, stack traces)
```

The split should live in one place in `back/src/common/` — an interceptor for success, a filter
for errors — the same shape co-sy-v2 uses (`ResponseEnvelopeInterceptor` /
`ExceptionEnvelopeFilter`). The filter computes a `detail` string and deliberately never puts it
on the wire. `requestId` is the only thing joining the two halves.

## 3. The agent API surface

This project's `agent` role and prod-agent service account (`X-On-Behalf-Of`) call the same
`back/` API a human-facing client would — there is no separate agent API. That means the autodoc
pipeline above is doubly load-bearing: it's not just documentation for a human reading
`/api/docs`, it's the discovery mechanism an agent uses to find and drive operations. Keep
`@ApiOperation` summaries genuinely descriptive of intent ("move a task to a different day",
not "PATCH task"), since that's what an agent-facing consumer reads to decide what to call.

## 4. Current state — honest

This is a new project inheriting the pattern, not the implementation, from co-sy-v2. Nothing in
this section is built yet; update it as the pipeline lands.

| Piece | State |
|---|---|
| JSDoc on back files / front components | not yet built |
| OpenAPI request DTOs | not yet built |
| OpenAPI response envelope | not yet built |
| Contract held by a QA gate | not yet built |
| `requestId` correlation | not yet built |
| Log levels · structured output · redaction · retention | not yet built |
