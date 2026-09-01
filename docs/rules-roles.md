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

## 2. Holding `agent` is never sufficient alone — it must always resolve to a specific user (D-role-011)

This carries forward co-sy-v2's strongest lesson about capability-shaped roles (its
`CAN_` privileges, D-role-007 there): a role that grants access to OTHER people's rows
must never be checked as a bare flag ("do they hold `agent` at all") — it must always be
resolved to exactly whose rows, on every request.

- The `agent` role by itself grants **nothing**. It only becomes meaningful together
  with a verified `X-On-Behalf-Of` header naming the target user.
- **The server must resolve the effective `ownerId` from the header on every
  owner-scoped route the agent calls** — never treat `agent` as "may see everything" or
  fall back to some notion of an org-wide view. There is no such view; there is no route
  that returns all users' data to anyone, `agent` included.
- A request bearing the `agent` role with no `X-On-Behalf-Of` header, or one naming a
  user that doesn't resolve, is refused — never silently treated as "act as the service
  account's own rows" (the service account owns no Theme/Task rows of its own).
- **This is server-side, always.** There is no UI surface for agent calls to hide behind
  in the first place.

## 3. No dead roles (carried forward from co-sy-v2, D-role-006)

A role or flag that no longer gates anything must be removed, not left in place — a
right nobody enforces implies a control that does not exist. With only one role in the
system this is easy to keep true; if a future role is retired, remove it from Zitadel
and every reference to it in the same change.

## 4. Grant-writing happens in Zitadel directly, not through the app

There is no in-product role editing (`architecture-roles.md` §No administration
surface). The `agent` grant on prod-agent is issued once, directly in the Zitadel
console/API, by whoever operates the stack — not through any route this app exposes.
