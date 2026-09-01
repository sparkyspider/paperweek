# Architecture: Scaling up

**The WHAT — but forward-looking.** Not current-state (that's
[`architecture-deployment.md`](architecture-deployment.md)); this is the **registry of
single-instance assumptions we are knowingly making**, and the **trigger** that forces each to
be revisited. When you add a second `back/` instance, a load balancer, or pick an autoscaling
platform, read this first.

**KEEP TERSE.** One living list; add a row when a new single-instance assumption is baked in.

Inherited from co-sy-v2's `architecture-scaling-up.md` (added there by explicit exception over
its own "no new top-level docs" rule, Mark 2026-07-16) — the same exception applies here: this
doc exists because the pattern (a living single-instance-assumptions registry) is worth keeping,
not because every entry in co-sy-v2's version carries over. Its large **"Tenant-per-database — a
future direction"** section does **not** apply and is not ported: that section exists because
co-sy-v2 keeps the door open to splitting its multi-org Postgres RLS model into a database per
organisation later. productivity-tools has no organisations to split apart — it is, and is
expected to remain, a single-org, per-user-`ownerId` app (`decisions-database.md` D-db-016) — so
there is no equivalent future direction to protect. If that ever changes, this section is where a
new version of that analysis would go.

---

## Current posture (2026-09-01)

**One instance. No load balancer. No shared cache.** Everything below assumes exactly one
long-lived process serving `back/`.

## Compute target — OPEN, not yet decided

Unlike co-sy-v2 (which settled on a single GCP Compute Engine VM, `decisions-deployment.md`
D-deploy-007 there), production hosting for productivity-tools has **not been decided**
(`architecture-deployment.md` §Targets, `decisions-deployment.md`). Local dev runs one process via
`docker compose`. Whichever compute target is eventually chosen, the same rule applies: a
model that recycles or multiplies instances by default (e.g. a serverless autoscaler) invalidates
every in-memory assumption below immediately, not "at scale" — settle the compute target and this
section's assumptions together, not separately.

## Single-instance assumptions — revisit before instance #2

1. **Rate limiting is in-memory** (`@nestjs/throttler`, per-process counters keyed on caller
   identity then client IP — `rules-back.md` §3). Two instances = the real limit is 2× intended;
   a recycled instance forgets offenders. **At scale:** swap the throttler's store to
   Memorystore/Redis (a config change, not a rewrite).

*(Nothing else instance-local exists yet. This app has no MFA step-up state, no local
login-lockout counters, and no cron/scheduled jobs today — co-sy-v2 needed rows for exactly
these because it has forced MFA, a local login-lockout service, and scheduled cleanup jobs; none
of those exist here, see `rules-auth.md` §5 and `rules-security.md`. Add a row here the moment
any instance-local or in-memory state is introduced — a cache, a scheduled job, a step-up flow,
anything a second process or a restart would forget.)*

## Already scale-safe — no action needed

- **Auth is stateless** (`rules-auth.md` §4): JWKS validation per request, **no server session
  store**; access token client-side (Pinia), refresh via httpOnly cookie. Works unchanged across
  N instances. There is no MFA step-up state to caveat here (this app has none — §Single-instance
  assumptions above).
- **Per-user data isolation is also stateless**, just not database-enforced the way co-sy-v2's
  RLS is: every request resolves `ownerId` from the verified JWT `sub` (or, for the `agent` role,
  from a verified `X-On-Behalf-Of` header) and filters by it — no per-instance or per-connection
  state involved, so this holds unchanged across N instances exactly like RLS would
  (`decisions-database.md` D-db-016). The trade-off is not about instance count: it's that a
  forgotten `WHERE ownerId = …` fails open here where RLS would have failed closed — see D-db-016
  for that trade-off in full; it is unrelated to scaling.
- **Shared state is external**: PostgreSQL + whatever secret store the deployment target uses.
- **Zitadel** owns its own store (shared with co-sy-v2); its horizontal-scale story is Zitadel's,
  not ours.

## Load balancer / reverse proxy — none today

Before putting **anything** in front of `back/` (LB, CDN, ingress): configure Express
`trust proxy` **and** the throttler's tracker to read the real client IP from the proxy
(`rules-back.md` §3). Skip it and either all traffic buckets as the proxy's single IP (global
false-positive) or a spoofed `X-Forwarded-For` dodges the limiter entirely.

**And check the loopback exemption first.** Dev runs may skip throttling for loopback peers.
Behind a proxy on an untrusted `req.ip`, **every** request presents as `127.0.0.1` — so that
exemption reaching production would disable rate limiting for the whole internet, silently. It
must be **structurally** unreachable when `NODE_ENV=production` (`rules-back.md` §3) — confirm
that variable is genuinely set in the deployed environment before shipping anything behind a
proxy.

## Trigger to revisit this doc

Adding a 2nd `back/` instance · putting a load balancer/proxy in front · choosing an autoscaling
compute platform · introducing any new instance-local/in-memory state (a cache, a scheduled job,
a step-up flow, anything a restart or a second process would forget).
