# Rules: Auth (`auth/`)

Applies to everything under `auth/`. Shape (WHAT): [`architecture-auth.md`](architecture-auth.md).
Read [`rules-system.md`](rules-system.md) and [`rules-users.md`](rules-users.md) first.

> **Status: in build**, alongside `back/` and `front/`. These rules are in force from the start.

## 1. Stack (fixed)

- **Zitadel**, run via **Docker** — the **same local instance co-sy-v2 uses** (`localhost:8080`),
  under a **separate, dedicated org: `Productivity`**. Never read or write co-sy-v2's org.
- Zitadel is the **single identity provider** for the whole system. No other auth mechanism is
  introduced anywhere.

## 2. Responsibilities

- `auth/` owns: user login, sessions, token issuing, credential storage, and the OIDC/OAuth
  endpoints, scoped to the `Productivity` org.
- `front/` is an **OIDC client**. `back/` is an **OIDC resource server** that validates tokens.
  Neither reimplements any of the above.

## 3. Configuration

- Everything Zitadel-side is driven via `docker compose`. Config is via env + committed
  `.env.example`; **no real secrets committed**.
- The issuer URL, client ID, and audience are configuration shared (by value, not by code) with
  `front/` and `back/` through their own env files.
- Ports: **front `3200`**, **back `3201`**, Zitadel `8080` (shared with co-sy-v2, unchanged).

## 4. Integration contract

- **L3, inherited from co-sy-v2:** the front never calls Zitadel directly. It talks to the `back/`
  BFF, which drives Zitadel's Session API and returns a Zitadel-signed access JWT (front holds it
  in Pinia; refresh via httpOnly cookie).
- Backend validates access tokens: check **issuer**, **audience**, **signature** (via Zitadel's
  JWKS), and expiry, on every protected request.
- Roles/permissions come from Zitadel claims and map to the (deliberately small) model in
  [`rules-users.md`](rules-users.md) §3.

## 5. Identity, org, and onboarding — SINGLE ORG, no invitations

- Two sign-in methods only: **Google** (external IdP) and **local Zitadel accounts**. No other
  login mechanism anywhere.
- **One org only: `Productivity`.** There is no multi-org model, no org creation/switching, no
  `X-Acting-Org` header, and no per-org RLS. Every user who signs in is a member of the same
  single org — tenancy is not a concept this project has.
- **No invitations module.** Users are provisioned directly (Zitadel console or the bootstrap
  script) into `Productivity`; there is no invite/accept flow, no invitation tokens, no
  once-off/permanent access-scope distinction. If self-signup is ever wanted, it is a new,
  explicit decision — not a default.
- **No forced MFA.** The login flow has no step-up/MFA gate. (co-sy-v2 forces MFA for its
  B2B agreements product; this app doesn't carry that requirement — see D-auth-056.)

## 6. Login UI & configuration

- Same **L3** pattern as co-sy-v2: our own Vue/Nuxt login UI, Zitadel **invisible**, driven
  headlessly via the **Session API** (local password) and **IdP intents** (Google). Zitadel's
  hosted login UI is not used.
- All Zitadel config is **managed as code**: a committed, re-runnable bootstrap script against
  Zitadel's management API. No console-only, hand-clicked setup.

## 7. Agent access — `agent` role + `prod-agent` service account

- A dedicated **`agent`** Zitadel role and a **`prod-agent`** service (machine) account let AI
  agents call the API directly, without a human in the loop.
- The service account authenticates like any other client (client credentials / JWT profile) and
  carries the `agent` role in its token — the same JWKS validation as a human token, no side door.
- A caller holding the `agent` role may send an **`X-On-Behalf-Of`** header naming the target
  user; `back/` trusts that header **only** from a verified `agent`-role token and scopes the
  request to that user's `ownerId` (see `rules-users.md` §2). Any other caller sending the header
  has it ignored.
- Full usage details (how an agent obtains credentials, calling conventions): root `AGENTS.md`.

## 8. Don'ts

- Do not store passwords or mint/verify tokens in `front/` or `back/`. The custom Vue login UI
  forwards credentials to Zitadel's Session API and never persists them.
- Do not add any sign-in method other than Google or local Zitadel.
- Do not configure Zitadel by hand in a way a committed script can't reproduce.
- Do not commit Zitadel master keys, client secrets, or admin credentials.
- Do not put auth config or compose files anywhere but `auth/`.
- Do not build an invitation flow, org switcher, or forced-MFA gate — out of scope by design
  (D-auth-056). If a real need for one emerges, it is a new decision, not a silent addition.
- Do not touch co-sy-v2's Zitadel org, its `.machinekey/` credentials, or its bootstrap script.
