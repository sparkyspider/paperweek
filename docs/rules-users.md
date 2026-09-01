# Rules: Users & Identity

The shared model for **who a user is** across the whole system. Read
[`rules-system.md`](rules-system.md) and
[`rules-auth.md`](rules-auth.md) alongside this.

> **Status: baseline.** This project's user model is deliberately small: one org
> (`Productivity`), no tenancy, data owned per-user. Adapted from co-sy-v2's `rules-users.md`,
> with the multi-org/module-role machinery removed — see `decisions-auth.md` D-auth-056.

## 1. Source of truth

- **Zitadel is the source of truth for identity.** A "user" is a Zitadel account in the
  `Productivity` org. The backend does **not** maintain its own password/credential store.
- If the backend needs to store app-specific data about a user (profile, themes, tasks), it keys
  that data by the **stable Zitadel subject (`sub`)** — never by email (emails change).

## 2. Identity in the backend

- The authenticated user is derived **only** from a verified token (see `rules-auth.md`). Never
  trust a user id sent in a request body or query param.
- A verified request carries at least: `sub` (stable id) and a role claim (`user` or `agent`).
- **Data ownership is per-user, not per-org.** `Theme` and `Task` rows carry an **`ownerId`**
  column set to the JWT `sub` of the user who created them. Every query that reads or writes
  either table is scoped by `ownerId` at the service layer — there is no cross-user visibility,
  and (unlike co-sy-v2) no organisation boundary to reason about instead. An agent request bearing
  `X-On-Behalf-Of` (see `rules-auth.md` §7) is scoped to the named user's `ownerId` exactly as if
  that user had made the request themselves.

## 3. Roles & permissions

- Roles are defined in Zitadel and delivered as token claims. The backend enforces them; the
  frontend may use them to show/hide UI but **never** relies on the frontend for enforcement.
- Default posture is **deny**: an endpoint is protected unless explicitly made public.
- **The role set is intentionally small — two roles, no tiers, no per-module rights:**
  - **`user`** — every human signing in through Google or local Zitadel. Full access to their own
    data (`ownerId`-scoped). There is no admin/manager/read-only distinction — a single-person
    planner has no need for one.
  - **`agent`** — held only by the `prod-agent` service account (`rules-auth.md` §7). Grants API
    access on behalf of a named user via `X-On-Behalf-Of`, never a standing view of everyone's
    data.
- Adding a role is a real decision (this project explicitly did not carry over co-sy-v2's major
  role + module role model, `decisions-auth.md` D-auth-056) — don't reintroduce tiers or
  per-feature rights without one.

## 4. Personal data

- Treat user data as sensitive. Log identifiers, not personal data; never log tokens or
  credentials — enforced in [`rules-autodoc-logging.md`](rules-autodoc-logging.md) §3.
- Only store the user data a feature actually needs.
- **Nobody but the owner sees a user's themes or tasks — there is no admin override.** Unlike
  co-sy-v2 (where a platform `super_admin` can see membership data across orgs), this project has
  no admin role with elevated read access to another user's planner data. If support/debugging
  ever needs it, that is a new, explicit decision, not an assumed capability.

## 5. Don'ts

- No user id trusted from the client without token verification.
- No *authoritative* second user store — Zitadel remains the only identity authority.
- No keying app data by email or display name — use `sub` (via `ownerId`).
- No org, tenant, or multi-org concept anywhere in the data model — this project has exactly one
  org and scopes everything by user instead.
