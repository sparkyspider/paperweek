# Decisions: Deployment

Durable deployment decisions. Rules in `rules-deployment.md`.

**KEEP TERSE.** Read on every build; every token counts. One line title + 1–2
lines max. Append only; reverse via new entry + `Superseded by`. Promote hard
rules into `rules-deployment.md`. Status: `Decided` · `Proposed` · `Open` · `Superseded`.

**D-deploy-001 through D-deploy-003 are inherited from co-sy-v2**, unchanged in substance —
generic containerization/config principles this project reuses. Its four-repo branching model and
GCP-VM-specific production shape were **not** ported (this is a single repo, and hosting is
undecided — see D-deploy-002 below). New entries for this project start at D-deploy-002... see
note: numbering restarts cleanly since so little was inherited (below).

---

- **D-deploy-001 · Containerized, env-configured** — Decided 2026-07-07 (co-sy-v2)
  Each deployable is a container with its own Dockerfile. Config via env, no committed secrets.

- **D-deploy-002 · Ports — front `3200`, back `3201`, chosen to run alongside co-sy-v2 without
  collision** — Decided 2026-09-01
  productivity-tools runs on the same machine/environment as co-sy-v2 during development
  (front `3000`/back `3001`-ish range in that project), so its ports were picked clear of that
  range: **front `3200`, back `3201`**. Zitadel is not a new port — it's co-sy-v2's existing
  instance at `8080`, shared (see `decisions-auth.md` D-auth-056).

- **D-deploy-003 · Reuse co-sy-v2's deployment plumbing and pattern, not its production target**
  — Decided 2026-09-01
  This project reuses co-sy-v2's **engineering pattern** for deployment — containerized
  services, env-only config, no secrets committed, migrations as a separate step, one
  worktree-per-agent branching discipline — because that pattern is generic and already proven.
  It does **not** inherit co-sy-v2's specific production target (a GCP Compute Engine VM behind
  Caddy with Cloud SQL) as a settled decision — where this project actually gets hosted is
  **open**, to be decided when it's ready to ship, same as co-sy-v2's own hosting target was
  open early on (its D-deploy-004). It may end up co-located on the same VM, or somewhere else
  entirely — not ruled on yet.

- **D-deploy-004 · Hosting target** — Open 2026-09-01
  Not chosen. Revisit when this project is ready to deploy beyond local dev.
