# Architecture: System (cross-cutting)

**The WHAT** — the shape of the whole stack: what the pieces are and how they fit.
Read this to understand the system; then follow `rules-system.md` (HOW) while you
build. The *why* is in `decisions-system.md`. **Everyone reads this.**

**KEEP TERSE.** A map, not an essay. Describe structure once; enforceable
constraints stay in the `rules-*.md` and are signposted, not copied.

---

## Repository shape

```
productivity-tools/   # single repo — everything below is version-controlled together
├── SPEC.md            # product spec — what's being built, for whom
├── CLAUDE.md          # entry point for AI — points at docs/
├── .gitignore
├── docs/              # architecture + rules + decisions
├── front/             # Nuxt 4 + Vue 3.5 + Tailwind 4 frontend (port 3200) — architecture-front.md
├── back/              # NestJS 11 + Prisma 6 backend (port 3201)          — architecture-back.md
└── auth/              # Zitadel config-as-code, shared local instance      — architecture-auth.md
```

**Single repo, not multi-repo** (differs from co-sy-v2): `front/`, `back/`, `auth/`
are plain folders, not independent checkouts. One `CLAUDE.md` at the root.

## Topology — who talks to whom

```
   ┌────────┐  HTTP (typed API,   ┌────────┐  Session API + IdP-intents  ┌────────┐
   │ front  │  never direct       │  back  │ ──────────────────────────▶ │  auth  │  Zitadel
   │ Nuxt 4 │ ── to Zitadel) ───▶ │ NestJS │ ◀── Zitadel-signed JWT ───── │(Docker,│  the IdP
   └────────┘ ◀── access JWT ──── └───┬────┘  (BFF brokers login;         │shared) │
                                      │        validates JWT via JWKS)     └────────┘
                                      ▼ Prisma, ownerId-scoped
                                ┌────────────┐
                                │ PostgreSQL │ (db: productivity)
                                └────────────┘
```

- **front ↔ back:** HTTP only, through one typed API layer. No cross-folder imports;
  shared shapes by contract. (Enforced `rules-system.md` §3.)
- **auth:** Zitadel owns all identity — the **same shared local instance co-sy-v2
  uses** (`http://localhost:8080`), under its own org, **"Productivity"**. The `back/`
  BFF brokers login and validates JWTs (resource server, JWKS); front never calls
  Zitadel directly. See [`architecture-auth.md`](architecture-auth.md).
- **back ↔ db:** Prisma; **single-org, per-user data scoping** — `Theme` and `Task`
  rows carry an `ownerId` column set to the JWT `sub`, and every query filters by
  it. No multi-org RLS: there is one org, so there is no cross-org isolation
  problem to solve. Detail: [`architecture-database.md`](architecture-database.md).
- **Agent access:** an `agent` Zitadel role + a `prod-agent` service account let AI
  agents call the API directly, acting on a person's behalf via an `X-On-Behalf-Of`
  header. See `AGENTS.md` and [`architecture-agentic.md`](architecture-agentic.md)
  if present.

## Feature shape

A feature spans a `front/` piece + a `back/` module, scoped to the calling user via
`ownerId` — there is no per-module org-role gating (single org, two humans + agents).

## The doc layers (how this repo documents itself)

**decisions** (settled why) → **architecture** (WHAT — this layer) + **rules**
(HOW). Decisions drive both architecture and rules; a builder reads
architecture → rules and can skip decisions unless changing direction. SSOT
applies to all layers (`rules-system.md` §2).
