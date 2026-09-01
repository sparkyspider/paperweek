# Decisions: System (cross-cutting)

Durable cross-cutting decisions. Distilled — the shape in `architecture-system.md`,
enforceable rules in `rules-system.md`.

**KEEP TERSE.** One line title + 1–2 lines max per decision. No prose, no repetition.
Append only; reverse via a new entry + `Superseded by`. Promote hard rules into
`rules-*.md`. Status: `Decided` · `Proposed` · `Open` · `Superseded`.

> **D-sys-001 through D-sys-007 below are inherited from co-sy-v2** (kept at their
> original numbers; entries that only applied to co-sy-v2's task pipeline, V1/Firebase
> migration, or multi-repo layout were dropped rather than renumbered — gaps in the
> sequence are expected in an append-only log). **D-sys-016 onward are this project's
> own, starting 2026-09-01.**

---

- **D-sys-001 · Root-clean layout** — Decided 2026-07-07 (inherited, adapted)
  Root = `CLAUDE.md`, `SPEC.md`, `docs/` + `front/ back/ auth/`; each sub-project
  self-contained; no root package.json/monorepo tool.

- **D-sys-003 · TS strict everywhere, latest stable** — Decided 2026-07-07 (inherited)
  Nuxt 4 / NestJS 11 / Tailwind 4, npm + lockfiles.

- **D-sys-004 · HTTP-only boundaries** — Decided 2026-07-07 (inherited)
  front↔back over HTTP only; no cross-folder imports; shared shapes by contract.

- **D-sys-005 · DB: Prisma + PostgreSQL** — Superseded by `decisions-database.md`
  See `decisions-database.md` / `rules-database.md` for the current-state detail.

- **D-sys-006 · Modular app: client + server modules** — Decided 2026-07-07 (inherited, adapted)
  Features are modules (a `front/` client piece + a `back/` server module). Unlike
  co-sy-v2, access is **not** gated per-module by org roles — see D-sys-016 below;
  gating is by `ownerId` (the calling user), not by role.

- **D-sys-007 · Single source of truth (MAJOR RULE)** — Decided 2026-07-07 (inherited)
  Every fact has one canonical home; docs link, never duplicate (duplication goes
  stale). Detail: `rules-system.md` §2.

- **D-sys-016 · Stack + plumbing reused from co-sy-v2; single-repo layout** — Decided 2026-09-01
  Nuxt 4 + Vue 3.5 + Tailwind 4 (front, port 3200) and NestJS 11 + Prisma 6 +
  PostgreSQL (back, port 3201, db `productivity`), reusing co-sy-v2's plumbing
  (auth broker pattern, Prisma conventions, doc-model conventions). Unlike
  co-sy-v2's multi-repo layout (D-sys-008 there), this project is a **single repo**
  — `front/`, `back/`, `auth/` are plain folders, not independent checkouts;
  supersedes that decision for this project rather than inheriting it. **Why:**
  a two-person + agents tool doesn't need the multi-repo isolation co-sy-v2's
  team size and deploy model called for.

- **D-sys-017 · Single org, per-user ownerId scoping — no multi-org RLS** — Decided 2026-09-01
  co-sy-v2 is multi-tenant (many orgs, Postgres RLS keyed on org). Productivity
  Tools is **single-org** — one Zitadel org, "Productivity" — with data scoped
  **per user**: `Theme` and `Task` rows carry `ownerId` (the JWT `sub`), and every
  query filters by it. No RLS-by-org, no invitations module, no forced MFA. **Why:**
  this is a two-person household tool (Mark, Tarryn) plus AI agents acting on
  their behalf, not a B2B multi-tenant product — the isolation unit is the person,
  not the organisation. Full rationale: `decisions-database.md`, `decisions-roles.md`.
