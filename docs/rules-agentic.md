# Rules: Agentic

HOW AI agents get direct API access to productivity-tools, and what the backend must enforce
around that access. Read with [`architecture-agentic.md`](architecture-agentic.md) (WHAT); WHY in
[`decisions-agentic.md`](decisions-agentic.md). Read [`rules-back.md`](rules-back.md) §4 first —
this rule is the one sanctioned exception to that section's "callers only touch their own rows."

For the operational how-to (how an agent actually authenticates and calls the API day to day),
see the repo-root **`AGENTS.md`** — this file is the governance layer (why the design is shaped
this way, what must never regress), not a how-to guide, and must never duplicate its content.

> **Scope note.** co-sy-v2's `rules-agentic.md` is almost entirely about *that project's own*
> internal multi-agent build pipeline — a worktree/port allocator, a live "board" dashboard, a
> ledger-truth verification protocol, "dispatcher mode" for interactive sessions, and TOTP-based
> login for agents proving their own dev work. None of that is what "agentic" means for
> productivity-tools. Here, "agentic" means: **a production AI agent calling the live API on a
> user's behalf.** This file and its siblings were rewritten around that meaning rather than
> ported line-for-line; see `decisions-agentic.md` for the record of that call.

## 1. The mechanism

- Zitadel grants an `agent` role/claim. Today it is held by exactly one identity: the
  **`prod-agent`** service account.
- A caller authenticated as `prod-agent` (i.e. whose verified JWT carries the `agent` role) may
  send an **`X-On-Behalf-Of: <userId>`** header. The backend then scopes the request's `ownerId`
  to that header's value instead of the caller's own subject.
- Any caller **without** the `agent` role that sends `X-On-Behalf-Of` is refused (400) — the
  header is not a general impersonation mechanism, it only means something in the presence of the
  `agent` claim.
- Without the header, an `agent`-role caller has no rows of its own to act on — `prod-agent` is
  not a "user" with a `Theme`/`Task` backlog; every request it makes must name whose data it is
  acting on.

## 2. Trust boundary

- The `prod-agent` service account credential is a **privileged credential** — anyone holding it
  can act as any user of the system. Treat it exactly like an admin credential: never logged,
  never checked in, rotated the same way other service credentials are (`rules-security.md`).
- The `agent` role is granted to service accounts only, never to a human's own Zitadel identity —
  a human agent's actions go through their own account like anyone else's.
- Every request made via `X-On-Behalf-Of` is attributable to the `prod-agent` identity in
  server-side logs, independent of which user it claims to act for — an audit trail must be able
  to answer "which requests came through the agent path" without trusting the header's content.

## 3. What agent access does NOT change

- Ordinary auth, validation, and the response envelope (`rules-back.md` §3) apply identically to
  agent-driven requests — there is no separate, laxer code path.
- Rate limiting still applies; an agent flood is still a flood.
- The `agent` role grants **data scoping**, not extra **permissions** — an on-behalf-of request
  can do only what the target user could do themselves through the same endpoint.

## 4. Don'ts

- Don't add a second header, query param, or body field that also changes effective `ownerId` —
  `X-On-Behalf-Of` is the one door.
- Don't honor `X-On-Behalf-Of` from any caller lacking the verified `agent` claim, even for
  read-only routes.
- Don't build agent-specific endpoints that bypass the standard per-user scoping check — the
  on-behalf-of resolution happens in the same guard/interceptor path every request goes through.
