# Decisions: Security

The settled **what & why** for the cross-cutting security area. Append-only.
Current-state rules: [`rules-security.md`](rules-security.md); shape:
[`architecture-security.md`](architecture-security.md).

> **D-sec-001 is inherited from co-sy-v2 at its original number.** co-sy-v2's
> D-sec-002 through D-sec-015 — the tenant-fail-closed model, the planes model,
> membership/declared-access, tokens, the audit trail, the directory — are all
> about **multi-org tenancy**, which this project does not have (single org,
> "Productivity"), so none of them were ported. D-sec-016 onward are this
> project's own, starting 2026-09-01.

---

- **D-sec-001 · Secrets management — no committed secrets, identity over keys** — Decided 2026-07-14 (inherited, adapted)
  Nothing real is committed, in git history, or emailed. Prefer identity-based
  auth over downloaded keys; local dev hydrates a git-ignored `.env`. On
  exposure, **rotate** (history-purge is cleanup after). No secret scanner —
  deliberately not adopted; see `rules-security.md` §5. Home: `rules-security.md`.

- **D-sec-016 · Shared local Zitadel instance, new "Productivity" org** — Decided 2026-09-01
  This project reuses co-sy-v2's shared local Zitadel instance (`http://localhost:8080`)
  rather than standing up its own auth infrastructure, under a **new org**,
  "Productivity". **Why:** there's no reason to run two identity providers
  locally for two personal projects; the org boundary is enough separation.

- **D-sec-017 · No forced MFA, no invitations module** — Decided 2026-09-01
  Two explicit simplifications vs co-sy-v2: MFA is not forced at login, and there
  is no invitation flow — the two account holders (Mark, Tarryn) are provisioned
  directly in the "Productivity" org. **Why:** co-sy-v2's MFA/invitation
  machinery exists for a multi-tenant B2B product's abuse surface; a two-person
  household tool doesn't carry that risk, and adding the machinery back without
  a real threat driving it would be process for its own sake (`rules-system.md` §9).

- **D-sec-018 · Agent API access via an `agent` role + `prod-agent` service account, `X-On-Behalf-Of`** — Decided 2026-09-01
  AI agents are first-class users of this product (see `SPEC.md`). A `prod-agent`
  Zitadel service account, holding a new `agent` role, authenticates normally and
  calls the `back/` API directly; an `X-On-Behalf-Of` header lets it act as a
  specific user. It is a **trusted delegation path, not an open one** — the
  service account still passes `JwtAuthGuard`, and every action it takes is
  scoped by the resolved user's `ownerId` exactly like a human request
  (`rules-security.md` §7). **Why:** the alternative — agents holding a human's
  own long-lived credentials — is worse for rotation and audit than one
  well-scoped service account.
  Superseded 2026-10-19 (084-Q8): agents sign in with their own Public account; PAPERWEEK_AGENT allows owner-only hard delete; no caller acts for another person.
