# Architecture: Deployment

**The WHAT** — how the pieces are packaged and run. Read this to understand it, then follow
`rules-deployment.md` (HOW). Why: `decisions-deployment.md`. Read
[`architecture-system.md`](architecture-system.md) first.

**KEEP TERSE.** A map. Structure once; constraints live in `rules-deployment.md`, signposted.

---

## Model

Three pieces, each independently deployable: `front/` (Nuxt) and `back/` (NestJS) each own a
container/Dockerfile; `auth/` is **not a separate deployment** — it points at co-sy-v2's existing
Zitadel instance (Docker Compose, already running), scoped to the `Productivity` org. Config is
env-only (committed `.env.example` per unit, real secrets injected at deploy — never in the
repo).

```
front (Nuxt, :3200)   back (NestJS, :3201)   auth → co-sy-v2's Zitadel (:8080, shared, "Productivity" org)   db (PostgreSQL)
     └────────────────── each scales / deploys separately, wired by env ──────────────────┘
migrations:  `prisma migrate deploy` as its own step (not on app boot); app runs as a
             non-owner DB role once ownership-based scoping is in place.
```

## Targets

- **Local dev:** `docker compose`, front on `3200`, back on `3201`, pointed at co-sy-v2's
  Zitadel at `localhost:8080`.
- **Production:** **not yet decided.** co-sy-v2 settled on a single GCP Compute Engine VM running
  Docker Compose services behind Caddy, with Cloud SQL + Secret Manager — this project may or may
  not follow the same shape; it hasn't been ruled on (`decisions-deployment.md`).

## Gate

**Never deploy — including any preview — without explicit go-ahead.** Suggest, then wait.
Everything reproducible from repo + env; no manual undocumented server steps.
(`rules-deployment.md`.)
