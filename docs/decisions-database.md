# Decisions: Database

Durable DB decisions. Distilled — rules in `rules-database.md`; shape in
`architecture-database.md`.

**KEEP TERSE.** Read on every build; every token counts. One line title + 1–2 lines max
(except the tenancy decision below, which gets a full writeup as the project's founding
call). Append only; reverse via new entry + `Superseded by`. Promote hard rules into
`rules-database.md`. Status: `Decided` · `Proposed` · `Open` · `Superseded`.

Inherited from co-sy-v2 with original IDs kept (not renumbered) where still applicable.
co-sy-v2's D-db-002/003/005–009/011–015 — multi-org RLS, per-transaction GUC context,
the acting-org header for platform admins, invitation-accept/MFA-handle RLS capability
exceptions, and the agreements-specific test-data contagion machinery — do not apply to
this single-org, per-user app and were not ported. See D-db-016 for what replaces
D-db-002/003/006.

---

- **D-db-001 · PostgreSQL (latest) + Prisma** — Decided 2026-07-07 (co-sy-v2), inherited
  Postgres latest as the DB, Prisma (now Prisma 6) as ORM + migrations.

- **D-db-004 · Migrations only; raw SQL for anything Prisma can't generate** — Decided
  2026-07-07 (co-sy-v2), inherited
  `prisma migrate` only, never `db push`/auto-sync in shared/prod. Custom indexes or
  functions are authored as raw SQL in migrations.

- **D-db-010 · Table naming: drop the prefix on the domain's namesake; never name
  ownership** — Decided 2026-07-27 (co-sy-v2), inherited
  `<domain>_<entity>`, but when the entity IS the domain's namesake the prefix is dropped
  (`theme`, `task`, not `theme_theme`). Ownership is never encoded in a table name —
  `owner_id` carries it (D-db-016), and a name that claims ownership goes stale the day a
  table's scope changes.

- **D-db-016 · Single org + per-user `ownerId` scoping, instead of multi-org Row-Level
  Security** — Decided 2026-09-01 (founding decision)

  **What was decided.** productivity-tools has exactly one Zitadel organisation
  ("Productivity"). There is no multi-tenancy to isolate at the organisation level, so
  there is no Postgres RLS. Instead, every user-owned table (`theme`, `task`) carries an
  `owner_id` column set to the Zitadel JWT `sub`, and isolation between users is enforced
  by the service layer always filtering by `ownerId` — never by a database policy.

  **Why.** co-sy-v2's RLS-by-org exists to keep unrelated organisations' data apart under
  a shared connection, with the database as the last line of defence against an
  application bug leaking one tenant's rows into another's request. productivity-tools
  has a fundamentally simpler shape: one organisation, and the only isolation that
  matters is between individual users' own planners. Standing up RLS policies, `FORCE
  ROW LEVEL SECURITY`, a non-owner runtime role, and per-transaction GUC binding for that
  purpose is machinery sized for a problem this app doesn't have. A `WHERE owner_id =
  :sub` filter, applied consistently through shared query helpers, gives the same
  practical guarantee for a single-tenant-shaped domain at a fraction of the operational
  and cognitive cost.

  **The trade-off, stated honestly.** RLS fails safe: a route that forgets its tenant
  filter still can't see another org's rows, because the database refuses regardless.
  The ownerId model does NOT fail safe the same way — a query that forgets `WHERE
  owner_id = ...` will happily return every user's rows. This is accepted because the
  blast radius of a same-tenant slip here (one user's tasks visible to another) is judged
  tolerable to guard against through code review, shared helpers, and tests, for an app
  of this size and stage — not because the risk is zero. If the app later needs a harder
  guarantee, RLS keyed on `owner_id` (rather than `org_id`) is the natural escalation
  path and does not require a schema change.

  **Consequence for agent access.** The `agent` role (`prod-agent` service account)
  reaches another user's rows deliberately, via a verified `X-On-Behalf-Of` header rather
  than its own `sub` — see `decisions-roles.md` D-role-011. That header resolution is the
  ONE case where `ownerId` is not simply "the caller's own JWT sub", and it must go
  through the same single, audited resolution point as every other `ownerId` derivation.

  Supersedes co-sy-v2's D-db-002 (RLS), D-db-003 (per-tx GUC context) and D-db-006
  (JWT-only org provenance) for this project — replaced by the model above. Rule:
  `rules-database.md` §Tenancy. Architecture: `architecture-database.md` §Tenancy.
