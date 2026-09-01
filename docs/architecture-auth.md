# Architecture: Auth (`auth/`)

**The WHAT** — the shape of identity & auth. Read this to understand it, then follow
`rules-auth.md` + `rules-users.md` (HOW). Why: `decisions-auth.md`. Read
[`architecture-system.md`](architecture-system.md) first.

**KEEP TERSE.** A map. Structure once; constraints live in `rules-auth.md`, signposted.

---

## Model

**Zitadel** (self-hosted via Docker Compose — the **same instance co-sy-v2 runs**, at
`localhost:8080`) is the single identity provider — login, sessions, tokens, credentials. But
it's **invisible (Level 3, inherited from co-sy-v2's D-auth-013)**: users only ever see our own
**Vue** UI. `front/` renders the login; `back/` is a thin **BFF login-broker** driving Zitadel's
Session API (the public SPA can't hold Zitadel's privileged credential) **and** a **stateless
resource server** validating tokens. No custom auth logic — Zitadel stays the only
credential/token authority.

**productivity-tools has its own Zitadel org, `Productivity`**, separate from co-sy-v2's org in
the same instance. The two apps never read each other's org.

## Flow (L3 via the BFF)

```
front (Vue UI) ─▶ back/ BFF ─▶ Zitadel      (front never calls Zitadel directly)
  Continue with Google → /auth/idp/google → IdP intent → Google consent → /idps/callback
  email + password      → /auth/local      → Session API CreateSession
      each front door exits by minting a Zitadel access JWT
back returns:  access JWT → SPA Pinia (in-memory)  +  refresh token → httpOnly cookie
every later call:  back validates the Bearer JWT via JWKS (iss/aud/sig/exp); role from claims
  /auth/me = profile (name/email/role) · /auth/refresh = silent, role refreshed
```

## Single org, no tenancy

- **One org: `Productivity`.** Everyone who signs in is a member of it — there is no tenant
  concept, no org id on the token to key anything off, no org switcher, no `X-Acting-Org` header.
  This is the one structural simplification that ripples through the whole stack: `back/`'s
  authorization and `rules-database.md`'s data scoping key off **the user**, not an org.
- **Data isolation is per-user, not per-org.** `Theme` and `Task` rows carry an `ownerId` = the
  JWT `sub`. There is no RLS-by-organisation — every query is filtered by `ownerId` at the
  service layer (detail: `architecture-database.md`).

## Roles (deliberately small)

- **`user`** — the ordinary, human role. Everyone signing in through Google or local Zitadel gets
  it. No tier ladder, no module roles — a single-purpose app for one person's planner doesn't need
  one (contrast co-sy-v2's major-role + module-role model, which this project does not carry).
- **`agent`** — held only by the `prod-agent` service account (see below). Never held by a human.
- Full model: `rules-users.md` §3.

## Onboarding

- Two sign-in methods: **Google** (external IdP) and **local Zitadel** accounts.
- **No invitation flow, no self-signup gate.** A user is provisioned directly into `Productivity`
  (Zitadel console or the bootstrap script). There is nothing to accept, no org to join — signing
  in for the first time with a provisioned identity just works.

## Agent auth (non-human)

A single Zitadel **service account, `prod-agent`**, holds the **`agent`** role and authenticates
like any machine client — no side door, same JWKS validation `back/` applies to human tokens. A
request bearing an `agent`-role token may carry an **`X-On-Behalf-Of: <userId>`** header; `back/`
trusts it only from that verified role and scopes the request to the named user's `ownerId`. This
is how AI agents (this project's own build agents included, per root `AGENTS.md`) call the API
directly without impersonating a human's session. Credentials live in `auth/.machinekey/`
(git-ignored), mirroring co-sy-v2's pattern for its own system users.

## Configuration

All Zitadel config for the `Productivity` org is **managed as code** — a committed, re-runnable
bootstrap script against the management API (no console-only setup). **Login UI is our own Vue
(L3)** — Zitadel's hosted UI is not used. Issuer URL / client ID / audience are shared to front &
back by value via their env files.
