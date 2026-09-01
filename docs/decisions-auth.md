# Decisions: Auth

Durable auth/identity decisions. Distilled — rules in `rules-auth.md` / `rules-users.md`.

**KEEP TERSE.** Read on every build; every token counts. One line title + 1–2
lines max. Append only; reverse via new entry + `Superseded by`. Promote hard
rules into `rules-auth.md`. Status: `Decided` · `Proposed` · `Open` · `Superseded`.

**Entries D-auth-001 through D-auth-018 below are inherited from co-sy-v2's `decisions-auth.md`**
— the identity-provider architecture and session/token mechanics this project reuses wholesale.
Original decision dates are kept for lineage; wording is adapted to this project (no orgs, no
module roles). Everything co-sy-v2 decided about multi-org tenancy, invitations, forced MFA, and
agreements-signing was **not** ported — it doesn't apply here (see D-auth-056). New entries for
this project start at D-auth-056.

---

- **D-auth-001 · Zitadel is the IdP** — Decided 2026-07-07 (co-sy-v2)
  Zitadel (self-hosted, Docker) owns all auth. `front/` = OIDC client, `back/` = resource server.
  No custom login/token/password anywhere.

- **D-auth-004 · Backend trusts verified JWT claims** — Decided 2026-07-07 (co-sy-v2)
  Validate issuer/aud/sig (JWKS)/exp; read `sub` and role claim. Never trust ids from the request
  body.

- **D-auth-008 · Zitadel local via Docker, config as code** — Decided 2026-07-07 (co-sy-v2)
  `docker compose` runs Zitadel; all config applied by a committed, re-runnable script against
  the management API — no console-only setup, so it is AI-manageable and reproducible.

- **D-auth-013 · Level-3 custom login (Zitadel invisible via Session API)** — Decided 2026-07-14
  (co-sy-v2)
  Our own **Vue/Nuxt** login UI; Zitadel is never rendered, driven headlessly via the Session API
  (local password) and IdP intents (Google). An OIDC finalize then mints the JWT `back/`
  validates. `front`/`back` never store passwords or mint tokens themselves.

- **D-auth-014 · Session/token model — stateless JWT · Pinia access token · httpOnly refresh
  cookie** — Decided 2026-07-14 (co-sy-v2)
  `back/` is a stateless OIDC resource server: validate the Bearer JWT via Zitadel JWKS per call,
  no server session store. The SPA holds the short-lived access token in a Pinia singleton
  (in-memory, never localStorage); a refresh token in an httpOnly/Secure/SameSite cookie drives
  silent `/auth/refresh`.

- **D-auth-018 · Authorization model — JWKS guard + annotation-driven RolesGuard** — Decided
  2026-07-15 (co-sy-v2), role set narrowed for this project (see D-auth-056)
  **AuthN** = `JwtAuthGuard` (validate the Bearer JWT via Zitadel JWKS; attach the verified user).
  **AuthZ** = a `RolesGuard` driven by annotations (`@Roles(...)` via `SetMetadata` + `Reflector`)
  matched against the token's role claim. This project's role set is just `user` / `agent` — no
  tier ladder, no module roles (contrast co-sy-v2's richer model, not inherited).

- **D-auth-056 · Reuse co-sy-v2's shared local Zitadel instance under a new org, `Productivity` —
  single org, no invitations, no forced MFA** — Decided 2026-09-01
  productivity-tools runs against the **same local Zitadel instance** co-sy-v2 already has
  (`localhost:8080`), rather than standing up a second one — it's the same machine, same Docker
  setup, and a second instance would be pure duplication for a project this size. It gets a
  **new, separate org, `Productivity`**, never co-sy-v2's org.
  **Single org, no multi-tenancy.** This is a small, single-user-per-account planner, not a
  B2B platform — there is no customer/tenant boundary to model, so none of co-sy-v2's
  org-as-tenant machinery (org creation, switching, `X-Acting-Org`, per-org RLS) is built. Data
  isolation is **per user** instead: `Theme`/`Task` rows carry `ownerId` = JWT `sub`, filtered at
  the service layer.
  **No invitations module.** Nobody invites anybody — users are provisioned directly into
  `Productivity`. co-sy-v2's invitation system exists to onboard external counterparties into a
  multi-org agreements product; this app has neither counterparties nor other orgs to invite
  someone *into*.
  **No forced MFA.** co-sy-v2 forces MFA because it's signing legal agreements for other
  businesses; this is a personal-use planner with a much smaller blast radius if an account is
  compromised. MFA can be added later as a real decision if the risk profile changes — it is not
  a default this project inherits.
  **What IS inherited, deliberately:** the L3 custom-login pattern, the BFF/JWKS validation
  mechanics, and the Pinia-token/httpOnly-refresh-cookie session model (D-auth-001/004/013/014/018
  above) — all pure plumbing, unrelated to the tenancy/invitation/MFA decisions this entry
  declines to carry over.

- **D-auth-057 · Agent API access — `agent` role + `prod-agent` service account, `X-On-Behalf-Of`**
  — Decided 2026-09-01
  AI agents building and later operating this app need to call the API directly, without a human
  session. A dedicated Zitadel **service account, `prod-agent`**, holds a new **`agent`** role and
  authenticates like any machine client — same JWKS validation as a human token, no bypass of
  `JwtAuthGuard`. It may set an **`X-On-Behalf-Of: <userId>`** header, which `back/` honours only
  from a verified `agent`-role token, scoping the request to that user's `ownerId`. Rejected:
  giving agents a standing human-equivalent session (harder to audit, harder to revoke) or a
  guard bypass (defeats the point of JWKS validation existing at all). Full usage: root
  `AGENTS.md`.

- **D-auth-058 · Cross-org access via Zitadel's native project grant, not a duplicate account**
  — Decided 2026-09-01
  Zitadel users are **instance-wide with one home org**; a person doesn't get a new account per
  app that reuses the shared instance. mark@flyh2.com's home org is **"FlyH2"** — a live tenant
  org of the separate `co-sy-v2` app (he also logs into `co-sy-v2` under it), not something this
  project owns or may reconfigure. To let him use this app, `bootstrap-productivity.sh` grants
  **this project** to his home org (a **ProjectGrant**, "Productivity Platform" → FlyH2) and then
  grants **him** the roles on it (a **UserGrant** referencing that ProjectGrant) — Zitadel's own
  mechanism for exactly this, in place of `add-user.sh` duplicating him into "Productivity"
  (which would fail anyway: usernames are unique instance-wide) or asking co-sy-v2 to change
  anything about FlyH2 itself. This project's entire footprint on the FlyH2 org is those two
  **additive** grants plus (only because the account had none) setting his password — never a
  change to FlyH2's own settings, policies, IdPs, or membership. Generalized as
  `bootstrap-productivity.sh`'s `GRANT_USER_EMAIL`-driven step (idempotent, org
  auto-discovered): any app on this shared instance can grant its project to a user's home org
  the same way, rather than every app minting its own copy of the same person.
