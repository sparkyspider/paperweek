# Decisions: Roles & Rights

The settled what & why for the (deliberately small) rights model. Append-only.
Current-state rules: [`rules-roles.md`](rules-roles.md); shape:
[`architecture-roles.md`](architecture-roles.md). IDs are `D-role-*`.

**KEEP TERSE.** Read on every build. One-line title, then the ruling and its reason.
Append only; reverse via a new entry marked `Superseded by`. Status: `Decided` ·
`Proposed` · `Open` · `Superseded`.

Inherited from co-sy-v2 with the original ID kept where still applicable. The bulk of
co-sy-v2's roles decisions (D-role-002/003/004/005/007/008/009/010) concern the
multi-org admin ladder, `CAN_`-privilege row-scoping for agreements/documents, and
archived-organisation access — none of that applies to a single-org, no-admin-tier,
no-agreements app, and none of it was ported.

---

- **D-role-006 · No dead code, no dead roles** — Decided 2026-08-05 (co-sy-v2, Mark),
  inherited
  A role or flag that no longer gates anything must be removed, not left in place — a
  right nobody enforces implies a control that does not exist. Rule: `rules-roles.md`
  §3.

- **D-role-011 · The `agent` role + `prod-agent` service account + `X-On-Behalf-Of`
  header, replacing co-sy-v2's org-admin ladder** — Decided 2026-09-01 (founding
  decision)

  **What was decided.** productivity-tools drops co-sy-v2's two-axis role model
  (primary admin ladder, secondary module rights) entirely — there is no admin tier to
  climb, because there is nothing to administer inside a single-org, per-user-owned app
  (see `decisions-database.md` D-db-016 for the tenancy reasoning this follows from). In
  its place there is exactly one role: `agent`, held only by a `prod-agent` Zitadel
  service account, which lets AI agents call the API directly on a user's behalf. The
  target user is named by an `X-On-Behalf-Of` header, verified and resolved server-side
  to the `ownerId` the request acts as.

  **Why a service account + header, rather than issuing agents real user tokens.** An
  agent acting for a user should not need that user's own credentials, and a user
  should not have to mint or share a personal token for an agent to act for them. A
  single service identity that Zitadel grants once, carrying a role that means "may act
  on behalf of a named user," keeps agent access auditable (every call is visibly
  `prod-agent` in the token, with the target named in a header the server logs) and
  revocable in one place, without touching per-user grants.

  **The row-scoping obligation this creates.** Same shape as co-sy-v2's `CAN_`
  privileges (its D-role-007): holding `agent` is never itself sufficient — the server
  must resolve exactly which user's rows a given call may touch, every time, from the
  header. See `rules-roles.md` §2.

  Supersedes co-sy-v2's D-role-002/003/004/005 (the admin ladder and its self-edit/
  step-up rules) for this project — not ported, not applicable. Rule: `rules-roles.md`
  §§1–2. Architecture: `architecture-roles.md`.
