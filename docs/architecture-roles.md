# Architecture: Roles & Rights

**The WHAT** — the shape of the (deliberately small) rights model. Then follow
[`rules-roles.md`](rules-roles.md) (HOW); why: [`decisions-roles.md`](decisions-roles.md).
Read [`architecture-system.md`](architecture-system.md) first; token & tenancy
mechanics: [`architecture-auth.md`](architecture-auth.md).

**KEEP TERSE.** A map. Constraints live in the rules, signposted.

---

## One real distinction: a person, or the agent (D-role-011)

Unlike co-sy-v2's two-axis org-admin-ladder + module-rights model, productivity-tools
has no org tiers, no module privileges, and no invitations — there is one Zitadel org
and every authenticated user simply owns their own Theme/Task data. The only role that
exists is:

```
(no explicit role)   an ordinary authenticated user — reaches their OWN rows only,
                      resolved as owner_id = JWT sub. This needs no role grant beyond
                      "has a valid session in the Productivity org."

agent                 held ONLY by the prod-agent service account. Lets an AI agent call
                      the API directly, acting on behalf of a specific user, named by a
                      verified X-On-Behalf-Of header on the request. See rules-roles.md.
```

There is no admin ladder, no per-module UPPERCASE/lowercase vocabulary, and nothing to
parse from a role name — with one role in play, co-sy-v2's naming convention has nothing
to do.

## Where roles live

```
Zitadel   AUTHORITY. One Project, one org ("Productivity"). The `agent` role is granted
          to exactly one identity: the prod-agent service account.
token     CARRIER. The JWT's role claim names `agent` for that one caller; every other
          token carries no role claim, and needs none.
back      ENFORCER. A guard resolves the effective owner id: the caller's own `sub`,
          UNLESS the caller holds `agent` AND supplies a valid X-On-Behalf-Of header, in
          which case the header's user id is used instead. One resolution point, reused
          by every owner-scoped route (rules-database.md §Tenancy).
front     Never a gate — the front end has no admin surface, no role UI, and no People
          page, because there is nothing for one to administer.
```

## No administration surface

Unlike co-sy-v2 (People pages, org-admin role editing, an Administrators tab), there is
nothing here to build: the only grant in the whole system — `agent` on the prod-agent
service account — is issued once, directly in Zitadel, by whoever operates the stack.
There is no in-product role editing, because there is no second role to hand out.
