# productivity-tools

**AGENTS: read this file before writing code, creating files, or changing anything.**
It is the index; the full product spec is [`SPEC.md`](SPEC.md); the engineering
rules/architecture/decisions live in [`docs/`](docs/), ported and adapted from the
sibling project `co-sy-v2`, which this project shares its Zitadel instance and most of
its stack conventions with.

## 1. What this is

A TeuxDeux-inspired weekly planner. Life-**Themes** (user-defined, e.g. "FlyH2",
"Admin", "Life Balance") hold a **backlog** of Tasks; tasks get dragged from the
backlog onto a **Mon–Sun week grid** split into **Morning / Afternoon / Evening**
dayparts, with **two weeks visible at once**. Look and feel: art-paper / watercolor —
warm paper backgrounds, hand-lettered display type, gouache-pen accents — calm rather
than corporate. Full detail, including the two named users and the soft-delete
philosophy: [`SPEC.md`](SPEC.md) (single source of truth for product behaviour — this
file never repeats it).

**Paperweek is a Co-Sy satellite app** (branch `sat-1019`, co-sy-v2 task 084). People sign
in on Co-Sy's sign-in page with their Co-Sy account (`@co-sy/satellite-auth` in `front/`);
`back/` checks their token with `@co-sy/satellite-guard` and admits only holders of the
`PAPERWEEK_USER` role of Paperweek's own project, owned by Co-Sy's **Public** organisation.
Data stays in Paperweek's own database, keyed on the token's `sub`.

**Agents acting for a person are PARKED.** The old `prod-agent` + `X-On-Behalf-Of` path is
removed and not replaced, pending Mark's ruling 084-Q8 (what an agent may do for a person).
[`rules-agentic.md`](docs/rules-agentic.md) describes the old mechanism and no longer applies.
Superseded 2026-10-19 (084-Q8): agents sign in with their own Public account; PAPERWEEK_DELETE allows owner-only hard delete; no caller acts for another person.

## 2. Repository layout

| Path | Stack | Purpose |
|------|-------|---------|
| `front/` | Nuxt 4 + Vue 3.5 + Tailwind 4 | Web frontend, port **3200** |
| `back/`  | NestJS 11 + Prisma 6 + PostgreSQL | API, port **3201**, database `productivity` |
| `auth/`  | Zitadel (Docker, shared) | Points at co-sy-v2's existing local Zitadel (`localhost:8080`). `auth/co-space.json` is Paperweek's Co-Sy settings file; the old "Productivity" scripts predate the satellite conversion |
| `docs/`  | Markdown | Rules, architecture, decisions (this index) |
| `SPEC.md` | Markdown | The product spec — SSOT for what this app does |

Single repo (unlike co-sy-v2's multi-repo layout) — `front/`, `back/`, `auth/` are
plain folders, not independent git checkouts (`decisions-system.md` D-sys-016). Root
stays clean: only `CLAUDE.md`, `SPEC.md`, `README.md`/`AGENTS.md` if/when they exist,
`docs/`, and the three project folders. No stray scripts or notes at root.

## 3. The key differences from co-sy-v2 — read this before assuming anything carries over

productivity-tools reuses co-sy-v2's plumbing (Zitadel/BFF pattern, Nest/Prisma/Nuxt
conventions, envelope response shape, logging) but is a **much simpler shape**:

- **Single org ("Productivity"), not multi-org.** No org creation/switching, no
  `X-Acting-Org`, no per-org Postgres RLS.
- **Per-user data scoping instead.** `Theme`/`Task` rows carry `ownerId` = the
  Zitadel JWT `sub`; every query filters by it at the service layer (no RLS enforcing
  it at the database) — `decisions-database.md` D-db-016.
- **No invitations module.** Users are provisioned directly into the org.
- **No forced MFA.**
- **No agreements, documents, e-signing, or CRM** — none of co-sy-v2's business
  domain applies here.
- **Sign-in is Co-Sy's** (satellite conversion, 084): no BFF login routes, no refresh cookie,
  no Zitadel credential in `back/`. The `agent` role / `X-On-Behalf-Of` path
  (`decisions-agentic.md` D-agentic-002) is removed, parked on 084-Q8.

Every ported doc below states explicitly, where it matters, what it kept from
co-sy-v2 and what it cut or replaced because of these differences.

## 4. Doc layers — architecture, rules, decisions

Same three-layer convention as co-sy-v2 (`docs/README.md` there), used here without
the surrounding task-pipeline apparatus (no `docs/todo/`, no `TODO.md`/`DONE.md` —
not ported, out of scope for this project so far):

| Layer | File(s) | Question | Holds | A builder... |
|-------|---------|----------|-------|---------------|
| Decisions | `decisions-<area>.md` | **WHY** | The settled what-and-why, terse, append-only | skips |
| Architecture | `architecture-<area>.md` | **WHAT** | The shape: pieces, boundaries, flow | **reads first** |
| Rules | `rules-<area>.md` | **HOW** | Enforceable rules everyone must follow | **complies with** |

**Build-time reading order: architecture → rules.** Read your area's
`architecture-*.md` (plus `architecture-system.md`) first, then `rules-*.md` for how.
Read `decisions-*.md` when you need the *why* or are about to change direction.
Decision IDs (`D-<area>-NNN`) inherited from co-sy-v2 keep their **original numbers**
for traceability; new entries for this project start after the highest inherited
number in each log and are dated 2026-09-01 ("founding decisions"). Every log states
at its top what was and wasn't carried forward.

**Keep every doc terse** — read on every build; every token spent is context taken
from the work (`rules-system.md` §3, D-sys-007 single-source-of-truth).

## 5. The rules — one per area

Read [`rules-system.md`](docs/rules-system.md) first (cross-cutting), then your area.

- [`rules-system.md`](docs/rules-system.md) — cross-cutting: root-clean, SSOT, boundaries, config.
- [`rules-front.md`](docs/rules-front.md) — everything about `front/` (Nuxt, Tailwind, TS, the week-grid/backlog UI).
- [`rules-back.md`](docs/rules-back.md) — everything about `back/` (NestJS, Prisma).
- [`rules-auth.md`](docs/rules-auth.md) — everything about `auth/` (Zitadel — shared instance, own org).
- [`rules-users.md`](docs/rules-users.md) — the (deliberately small) identity model: per-user `ownerId`, no org membership.
- [`rules-roles.md`](docs/rules-roles.md) — the rights model: ordinary users need no role; `agent` is the one exception.
- [`rules-database.md`](docs/rules-database.md) — PostgreSQL + Prisma + per-user `ownerId` scoping (no RLS).
- [`rules-deployment.md`](docs/rules-deployment.md) — packaging, config, running the pieces; ports 3200/3201.
- [`rules-security.md`](docs/rules-security.md) — secrets & credentials; the agent service-account trust boundary.
- [`rules-autodoc-logging.md`](docs/rules-autodoc-logging.md) — JSDoc, OpenAPI/Swagger, and logging conventions.
- [`rules-agentic.md`](docs/rules-agentic.md) — the `agent` role / `prod-agent` / `X-On-Behalf-Of` API-access mechanism.

Matching `architecture-*.md` and `decisions-*.md` exist for every area above, plus
[`architecture-scaling-up.md`](docs/architecture-scaling-up.md) — the single-instance-assumptions
registry (no rules/decisions counterpart, same as in co-sy-v2).

**Process docs — `docs/process/`** (how the multi-agent operation runs; not read on every build):
[`STATE.md`](docs/process/STATE.md) — the resurrection point, rewritten at every session close;
[`OPERATIONS.md`](docs/process/OPERATIONS.md) — roster, protocols, verification recipes, instruments;
[`LESSONS.md`](docs/process/LESSONS.md) — incident log, symptom → cause → rule, append-only.
Evidence for a diagnosis lives in `docs/process/evidence/<topic>-<date>/` (prediction, traces,
plots, rigs, verbatim rulings); `video/` folders are gitignored, local only.

If a rule blocks you and you believe it's wrong, don't break it silently — say so and
leave the rule in place until it's deliberately changed.

## 6. Getting started as an agent

1. Read this file, then [`SPEC.md`](SPEC.md) for the product.
2. Read `architecture-system.md` + your area's `architecture-<area>.md`, then
   `rules-system.md` + your area's `rules-<area>.md`.
3. Calling the API as an agent rather than building it? Read
   [`rules-agentic.md`](docs/rules-agentic.md) and root `AGENTS.md`.
4. Do the work inside the correct folder (`front/`, `back/`, `auth/`, or `docs/`). The
   root stays clean (§2).

## 7. Starting paperweek locally (the short version)

Three pieces, in this order. Ports: Zitadel **8080**, back **3201**, front **3200**
(3100/3101 belong to Mark's co-sy board launchd services — never use them).

```bash
# 1. Zitadel — shared from co-sy-v2; Docker Desktop must be running first
open -a Docker && cd ~/IdeaProjects/co-sy-v2/auth && docker compose up -d
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/.well-known/openid-configuration   # 200

# 2. Backend (Postgres on localhost:5432 must be up: `pg_isready`)
cd ~/IdeaProjects/paperweek/back && npm run start:dev          # http://localhost:3201/health -> 200

# 3. Frontend
cd ~/IdeaProjects/paperweek/front && npm run dev               # http://localhost:3200
```

Run 2 and 3 in separate terminals (or background them with `nohup ... &`). First-time
setup (DB role, Zitadel org, `.env`, migrations, seed) is in [`README.md`](README.md).
