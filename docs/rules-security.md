# Rules: Security (cross-cutting)

Two things in one file: **secrets & credentials** (§1–5 — every repo, everyone
touching a secret reads them) and **data-isolation & access posture** (§6–8 — the
per-user `ownerId` model, the agent service-account path, and authenticated-only
content). Read [`rules-system.md`](rules-system.md) first; area rules signpost
here. Shape (WHAT): [`architecture-security.md`](architecture-security.md); why:
[`decisions-security.md`](decisions-security.md).

> **Roles are simpler here than in co-sy-v2.** There is one org ("Productivity")
> and no per-org role ladder — see [`rules-roles.md`](rules-roles.md) if present,
> or `decisions-database.md` for the ownerId model this file assumes throughout.

## 1. One source of truth: a secret manager

- Prefer **not keeping real secrets on disk long-term**; nothing real is committed
  or emailed/Slacked.
- Each repo ships a committed **`.env.example`** documenting every variable **by
  name only**. Local **`.env` is git-ignored**, never hand-authored with values
  that also live anywhere else that matters.
- Config-as-code references secrets, never inlines them.

## 2. Never commit or keep a secret — and history counts

- A real secret must **never be committed** — and **never be in git history**.
- If a secret is exposed, **rotation is the fix** (invalidate the value); history-purge
  (`git filter-repo`/BFG) is cleanup you do *after* rotating, not instead.
- `.gitignore` must cover **backups too** (`*.bak*`, `.env*` beyond `.env.example`) —
  the common leak is an un-ignored `.env.server.bak`.

## 3. Identity over keys

- Prefer identity-based auth (ADC / Workload Identity, or the local Zitadel service
  account) over downloaded long-lived keys. Mint a key only when a workload
  genuinely cannot use its own identity.

## 4. Local dev — grant identity, not values

- Local dev talks to the **shared local Zitadel instance** (`http://localhost:8080`,
  org "Productivity") — the same instance co-sy-v2 uses, a different org inside it.
  No separate auth infra to stand up.
- **Never email/Slack a `.env`.** If a raw value must be shared, use a shared vault.

## 5. Least-loss & rotation

- **No secret scanner** — deliberately not adopted (same call as co-sy-v2): the
  discipline in this file (grant identity not values, git-ignored dev `.env`,
  rotation-on-exposure) is the defence, not a pre-commit/CI gate.
- Secrets are **per-environment** (dev/prod isolated, once a prod environment
  exists). Rotate on exposure.
- **NEVER REMOVE AN API KEY.** No agent may delete, blank, or overwrite a
  credential value in ANY `.env` or credential file — not even temporarily. If a
  capability must be OFF locally, override at process launch or in your own
  shell — the file itself is untouchable.

## 6. Data isolation is per-user, and it is fail-closed (LIVE)

Productivity Tools has **no multi-org tenancy problem** (single org, "Productivity")
but it has the equivalent single-user one: `Theme` and `Task` rows carry an
`ownerId` set to the authenticated caller's JWT `sub`.

- **Every query that reads or writes a `Theme`/`Task` row filters by `ownerId`.**
  There is no route that returns or mutates a row without that filter — a missing
  filter is a cross-user data leak, not a cosmetic bug.
- **`ownerId` is never taken from the request body or query string.** It is derived
  server-side from the verified JWT (or, for agent calls, from the resolved
  `X-On-Behalf-Of` subject — see §7). A client-supplied `ownerId` is never trusted.
- **Fail closed:** an unresolved or unverifiable owner means the request is
  refused, never defaulted to "no filter" (which would return everyone's rows) or
  to a guessed owner.
- A new table holding per-user data ships its `ownerId` column and the
  scoping-by-default query pattern in the **same** change that creates it — see
  [`rules-database.md`](rules-database.md) for the Prisma-level convention.

## 7. Agent access: a trusted service-account path, not open access

An `agent` Zitadel role plus a `prod-agent` service account let AI agents call the
`back/` API directly (`AGENTS.md` covers the how). Security-relevant constraints:

- The service account authenticates like any other client (its own Zitadel
  credentials) — it does not bypass `JwtAuthGuard`.
- `X-On-Behalf-Of` lets the service account act **as** a specific user, but only
  because it is itself already authenticated as the trusted `prod-agent`
  principal — the header is not a credential a caller can wield unauthenticated,
  it's a delegation the trusted principal is allowed to make. The resolved subject
  becomes the `ownerId` for §6's scoping — an agent call is never exempt from it.
- There is no forced MFA and no invitations module in this project (explicit
  simplifications vs co-sy-v2, see `decisions-security.md`) — the two-person +
  agents scale doesn't carry the same abuse surface. Don't port either back in
  without a decision recorded here first.

## 8. Nothing is shown to anybody who isn't signed in

Every route needs a JWT unless explicitly marked public, and a public route may
not render user content — only co-sy-v2 has invitation-link doorways; this
project doesn't have an equivalent pre-auth flow, so in practice this project
should have **no** public content routes at all. If one is ever needed, it must
answer the same test co-sy-v2 used: *does this reveal something the caller didn't
already have?* — and be recorded as a decision here, not added quietly.

## Applies everywhere

Area rules (`rules-back.md`, `rules-front.md`, `rules-database.md`, `rules-auth.md`)
keep only the short "config via env / no committed secrets / ownerId-scoped" reminder
and **defer to this file** for the full discipline.
