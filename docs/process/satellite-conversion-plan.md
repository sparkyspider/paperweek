# Satellite conversion plan — Paperweek as a Co-Sy satellite

*(Facts as of 2026-10-02, gathered from the co-sy-v2 PRE-DEPLOYMENT window (Marlow).)*

## Status

Paperweek is NOT a Co-Sy satellite. Nothing has been converted.
It is Milestone 2 work. Mark: "excluding PAPERWEEK which is part of a M2 deploy".

## Mark's rule

> I don't want any "you can't do this because it wasn't implemented" - that is a core M1 feature and the rule. No semi-implemented features.

Any auth or Co-Sy-side need goes to the co-sy-v2 window as Co-Sy work.
Never design around a gap.

## Co-Sy records

- co-sy-v2 task 084 "paperweek-satellite-pilot". The ledger is on branch `wave-084-250925`.
- The converter is `.claude/skills/satellite-app-converter/`. It pins `@co-sy/satellite-auth` 0.1.5; 0.1.7 is newest.
- The Nest guard is `@co-sy/satellite-guard` 0.1.0, at `~/IdeaProjects/co-sy-satellite-guard`.
- The direction is open as co-sy-v2 Q333.

## Shape (defaults until Mark rules Q333 and 084-Q4)

- The Zitadel project stays in the "Productivity" org (084-Q4, proxy ruling 2026-09-25, Mark may overturn).
- Users keep their subs, so `ownerId` needs no re-key.
- Sign-in moves to Co-Sy's hosted login page. The BFF login broker is removed.
- Access is a Paperweek project role, e.g. `PAPERWEEK_USER`, granted in Co-Sy People > Satellite apps.
- The converter runs with `--owning-org-id` = Productivity.
- Tasks stay in Paperweek.
- Each theme optionally maps to a Co-Sy client, a client+project, or nothing (Q333 default).

## First checks of the conversion walk

Use a test user in Productivity.

1. Co-Sy's hosted login page signs in a Productivity-org user (N2).
2. The `login_user` row is created correctly when the owner is Productivity (084 AC-2.7).

## Dependencies

These are Co-Sy needs. The conversion waits for each.

- N3: Mark's ruling on what an agent may do acting for a person, plus the per-satellite service-account design.
- A converted Paperweek must not ship a private agent bypass beside the guard.
- Until N3 lands: no conversion, current setup unchanged.
- N5: Google sign-in on Co-Sy's hosted page reaches Productivity users. No conversion ships without it.
- Co-Sy's token-status route ships with Milestone 1.
- "Track this" (M2): today a satellite token cannot call `/api/v1/tracker/*`.
- It needs a Co-Sy design first. Do not plan around the facing-role path.

## Open on the Co-Sy side

AC-12.3 in 084 `stories.md` says the owning org is Co-Sy's.
That contradicts 084-Q4. An amendment has been drafted for Marlow.

## Paperweek's own work at conversion

- Replace the `back/` JWT guard with `SatelliteGuardModule` / `@RequireRole`.
- Remove the BFF sign-in routes.
- Register the satellite.
- Keep the stale check off until the token-status route ships.
