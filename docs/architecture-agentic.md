# Architecture: Agentic

The WHAT of AI-agent access to productivity-tools: how an agent calls the live API directly, on a
user's behalf. HOW: [`rules-agentic.md`](rules-agentic.md). WHY: [`decisions-agentic.md`](decisions-agentic.md).

> **Scope note.** This is a from-scratch, much smaller doc than co-sy-v2's `architecture-agentic.md`,
> which described that project's own internal build pipeline (a UI-component agent-descriptor
> registry, a worktree/port allocator, a permanent monitoring "board," a ledger-verification
> protocol). Productivity-tools has no such pipeline apparatus and none of it was ported. What is
> here is genuinely new: the design of the runtime feature that lets an AI agent drive a user's
> planner data through the API.

## The shape

```
AI agent
 │ authenticates as the prod-agent service account (Zitadel, `agent` role/claim)
 ▼
back/ API  ── every request ──▶  JwtAuthGuard validates the token like any other caller
 │
 │  X-On-Behalf-Of: <userId> header present?
 │     no  → caller has no rows of its own (prod-agent owns no Theme/Task data)
 │     yes → is the verified token's role `agent`?
 │             no  → 400, header rejected
 │             yes → ownerId for this request = the header's userId
 ▼
Service layer (themes/, tasks/) — same code path as a normal user request,
   scoped by the resolved ownerId, same envelope, same validation, same rate limits
```

There is no separate "agent API" — it is the same REST surface (`/api/v1/...`) every human user's
browser calls, with one additional header understood by one additional identity.

## Pieces

| Piece | Home | Job |
|-------|------|-----|
| `agent` role | Zitadel, org "Productivity" | Marks an identity as allowed to send `X-On-Behalf-Of` |
| `prod-agent` service account | Zitadel | The one identity holding the `agent` role today |
| `X-On-Behalf-Of` resolution | `back/src/common/` (alongside the auth guard) | Overrides effective `ownerId` for `agent`-role callers only |
| Operational how-to | repo-root `AGENTS.md` | How an agent authenticates and calls the API in practice — not duplicated here |

## Boundaries

- This mechanism changes **whose data a request is scoped to**; it never changes **what an
  endpoint is allowed to do** — permissions and validation are identical to the human path.
- Discovery/description of what the API can do is via the OpenAPI doc
  (`rules-autodoc-logging.md`), same as for any other consumer — there is no separate
  agent-descriptor or capability-registry layer, unlike co-sy-v2's UI-component descriptors. If a
  future need arises for agents to drive the **frontend UI** (not just the API) directly, that
  would be new scope requiring its own decision, not an assumed extension of this one.
