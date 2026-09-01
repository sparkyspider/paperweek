# Rules: Deployment

How the pieces are packaged, configured, and run. Shape (WHAT): `architecture-deployment.md`.
Read `rules-system.md` and `decisions-deployment.md` first. **Keep terse.**

> Adapted from co-sy-v2's `rules-deployment.md`. This project is a **single git repo**
> (`front/`, `back/`, `auth/`, `docs/` as folders, not separate repos) — co-sy-v2's four-repo
> topology and its cross-repo branching rules do not apply here.

## Principles

- **Containerized.** Each deployable (`front/`, `back/`, DB) runs as a container; each
  sub-project owns its own `Dockerfile`. `auth/` runs Zitadel via `docker compose`, sharing
  co-sy-v2's existing instance under the `Productivity` org (`architecture-auth.md`) — it does
  not stand up a second Zitadel.
- **Config via env only.** Every service ships a committed `.env.example` documenting every var.
  No secrets in the repo, ever.
- **Nothing hard-coded** — ports, hostnames, URLs, issuer/DB connection all come from env.
- **Reproducible builds:** pinned base images + committed lockfiles. Latest stable runtimes.
- **Independently deployable:** front, back, db scale/deploy separately; no shared root build.

## Ports (fixed, chosen to run alongside co-sy-v2 without collision)

- **`front/` — `3200`**
- **`back/` — `3201`**
- Zitadel — `8080` (co-sy-v2's existing instance, shared; not a new port)

## Environments

- **Two kinds only: local and remote.** Local dev via `docker compose` — see `SETUP-LOCAL.md`
  once written. Remote hosting is **not yet decided** (`decisions-deployment.md` — open, same
  shape as co-sy-v2's D-deploy-004 was before it was settled).
- **Record remote infra as you provision it**, once a remote exists — a `SETUP-REMOTE.md`, same
  discipline co-sy-v2 uses: nothing exists remotely that isn't written down.
- `.env` files are git-ignored; real secrets injected by the platform at deploy, once there is one.

## Branching & repo topology

- **One repo.** Ordinary feature branches off the default branch; no cross-repo branch-name
  coordination is needed (co-sy-v2's four-repo "is it committed has four answers" problem does
  not exist here by construction).
- **One agent = one branch = one worktree.** Before touching files, an agent/session claims its
  own `git worktree` for its branch — never works in a checkout another session may share.
  **Never `git add -A` in a possibly-shared tree** — stage the explicit paths you authored.
  Remove the worktree when the branch merges.
- **Commit / merge / push only when asked.**
- **Verify the RESULT of a conflict resolution — never trust the resolution.** After any resolved
  conflict or non-trivial auto-merge, read the merged file: confirm both sides' changes are
  actually present, not silently dropped.

## Database in deployment

- App connects as a non-owner role once RLS/ownership scoping is in place (see
  `rules-database.md`). Migrations (`prisma migrate deploy`) run as a separate step, not on app
  boot in prod.

## Don'ts

- **Never deploy without an explicit go-ahead.** Suggest/ask, then wait.
- No secrets committed; no prod creds in images.
- No manual, undocumented server steps — everything reproducible from repo + env.
- No new top-level docs outside `docs/`.
