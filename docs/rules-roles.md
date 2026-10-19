# Rules: Roles & Rights

The enforceable HOW of the (small) rights model. Read
[`rules-system.md`](rules-system.md) first. Shape (WHAT):
[`architecture-roles.md`](architecture-roles.md); why:
[`decisions-roles.md`](decisions-roles.md).

## 1. An ordinary user needs no role — only a valid session

Every authenticated caller with a valid Zitadel session in the Productivity org reaches
their own Theme/Task rows, resolved as `owner_id = JWT sub`. There is no ladder, no
per-module grant, and nothing to check beyond "is this token valid" — the resource-level
check is ownership, not a role (`rules-database.md` §Tenancy).

## 2. An agent is an ordinary account acting as itself (Mark's ruling 084-Q8, 19 Oct 2026)

Supersedes the old `agent` role and its `X-On-Behalf-Of` header (D-role-011), removed when
Paperweek became a Co-Sy satellite.

- An agent signs in with its own Public account, exactly like a person: Co-Sy's sign-in page,
  Paperweek's one sign-in app, the same guard. No client-credentials path, no second client.
- **Nobody acts for another person.** Every route keys rows on the verified token's `sub`; a
  header naming someone else is ignored.
- `PAPERWEEK_DELETE` (with `PAPERWEEK_USER`) allows only hard delete, and only of the caller's
  own rows: someone else's row answers 404 and nothing is deleted.

## 3. No dead roles (carried forward from co-sy-v2, D-role-006)

A role or flag that no longer gates anything must be removed, not left in place — a
right nobody enforces implies a control that does not exist. With two roles in the system
(`PAPERWEEK_USER`, `PAPERWEEK_DELETE`) this is easy to keep true; if a role is retired, remove
it from Co-Sy and every reference to it in the same change.

## 4. Grant-writing happens in Co-Sy, not through the app

There is no in-product role editing (`architecture-roles.md` §No administration
surface). `PAPERWEEK_USER` and `PAPERWEEK_DELETE` are granted in Co-Sy by Public, Paperweek's
owning organisation, never through any route this app exposes. Roles are read only from the
verified token, never looked up in a database.
