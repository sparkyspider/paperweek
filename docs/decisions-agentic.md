# Decisions: Agentic

Append-only log for AI-agent access to productivity-tools' API. WHAT:
[`architecture-agentic.md`](architecture-agentic.md). HOW: [`rules-agentic.md`](rules-agentic.md).

Nothing is inherited from co-sy-v2's `decisions-agentic.md` — see D-agentic-001 below.

---

- **D-agentic-001 · This log starts fresh; co-sy-v2's agentic decisions were not inherited** — Decided 2026-09-01
  co-sy-v2's `decisions-agentic.md` (30 entries) records the evolution of that project's own
  internal multi-agent **build pipeline**: a UI-component `agentDescriptor`/registry system, a
  machine-resource (port) allocator, a permanent monitoring dashboard, a ledger-truth verification
  protocol, "dispatcher mode," and TOTP-based login for agents proving their own dev work during
  code-automation runs. Productivity-tools does not run that pipeline and has no equivalent
  apparatus to carry those decisions forward onto. **Why not port a trimmed version instead:**
  those decisions are answers to problems specific to co-sy-v2's development process, not to this
  product — porting them would document tooling that doesn't exist here and invite confusion about
  what's actually built. If productivity-tools later adopts a comparable multi-agent build
  pipeline, that is new scope needing its own decisions, not a resurrection of these.

- **D-agentic-002 · AI agents get direct API access via an `agent` role + `prod-agent` service
  account + `X-On-Behalf-Of` header** — Decided 2026-09-01 (founding decision)
  Productivity-tools is explicitly built to let AI agents manage a user's planner data
  programmatically — creating themes, filing backlog tasks, moving tasks onto the week grid — not
  only through the browser UI. The mechanism: Zitadel grants an `agent` role to service-account
  identities (today, one: `prod-agent`); a caller whose verified token carries that role may send
  `X-On-Behalf-Of: <userId>`, and the backend resolves the request's effective `ownerId` from that
  header rather than the caller's own subject. Every other caller sending that header is refused.
  **Why this shape, and how it differs from co-sy-v2's mechanism:** co-sy-v2 gave agents
  first-class **login credentials** — dedicated system users (`agent-admin`/`agent-manager`/
  `agent-user`) signing in through the real OIDC flow with a TOTP second factor, so an agent's
  session was indistinguishable from a human's except for which account it used. That fits a
  project where an agent is *impersonating a role*, proving a UI works. Here the agent isn't a
  role — it's a proxy acting **for a specific real person's data**, so a single scoped credential
  plus a per-request target header is a smaller, easier-to-audit surface than minting and rotating
  a login per user an agent might act for. **Trust boundary:** the `prod-agent` credential is
  privileged (it can act as any user) and must be handled like an admin credential
  (`rules-security.md`); the header changes data scoping only, never permissions — an on-behalf-of
  request can do only what that endpoint already allows the target user to do. Detail:
  `rules-agentic.md`, `architecture-agentic.md`.
