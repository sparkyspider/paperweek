# Architecture: Security (cross-cutting)

**The WHAT** — where a request's authority is decided, layer by layer, and where
the per-user boundary actually lives. Then follow
[`rules-security.md`](rules-security.md) (HOW); why:
[`decisions-security.md`](decisions-security.md). Read
[`architecture-system.md`](architecture-system.md) first; auth flow detail:
[`architecture-auth.md`](architecture-auth.md).

**KEEP TERSE.** A map. Constraints live in the rules, signposted.

---

## Enforcement layers

Every authenticated request passes the same stack:

```
request ─▶ JwtAuthGuard        verify Bearer JWT via Zitadel JWKS (iss/aud/sig/exp)
        ─▶ resolve caller       normally the JWT `sub`; for an agent request,
        │                        the resolved X-On-Behalf-Of subject (PAPERWEEK_DELETE right, granted to agent accounts only)
        ─▶ service layer        every Theme/Task query is scoped `WHERE ownerId = :caller`
        └▶ PrismaService        no ambient "all rows" query path exists for these tables
```

- **No multi-org RLS** (co-sy-v2's tenant model does not apply here — single org,
  "Productivity"). The isolation unit is the **user**, enforced at the query layer
  by `ownerId`, not at the database policy layer by an org claim.
- **Fail-closed:** an unresolved caller means the request is refused, never a
  default owner and never an unfiltered read. Rule: `rules-security.md` §6.
- **Deny-by-default routes:** every route needs a JWT; this project has no
  public content routes (`rules-security.md` §8) — unlike co-sy-v2 there is no
  invitation-link doorway to reason about.

## The agent path

```
prod-agent (Zitadel service account, role: agent)
    │ authenticates normally (its own credentials)
    ▼
back/  ─ JwtAuthGuard passes (valid token, role = agent)
       ─ X-On-Behalf-Of: <user sub>  →  caller resolves to that user
       ─ same ownerId-scoped queries as a human request
```

The service account is a **trusted delegate**, not a bypass: it still goes through
`JwtAuthGuard`, and everything it does is scoped to the `ownerId` it's acting as.
Detail: `rules-security.md` §7; the API contract itself: `AGENTS.md`.

## What co-sy-v2 has that this project doesn't

No multi-org RLS, no planes model (`super_admin`/`org_admin` ladder), no
membership/declared-access/audit-trail machinery, no forced MFA, no invitations.
These exist in co-sy-v2 because it's a multi-tenant B2B product; Productivity
Tools is two people plus their agents in one org, so the isolation problem is
solved once, simply, at the `ownerId` layer instead.

## Sessions

Access tokens from the shared local Zitadel instance; no project-specific
session/refresh model beyond what `architecture-auth.md` describes.
