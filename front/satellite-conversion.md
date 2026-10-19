# Satellite conversion — Paperweek

Converted by `.claude/skills/satellite-app-converter` on 2026-10-19 10:09:44 SAST.

## What changed in this app

- `nuxt.config.ts` — modules gains '@co-sy/satellite-auth'; cosySatellite block written; snag switch written.
- `satellite-zitadel-runbook.md` — the Zitadel steps a person must do by hand.
- `satellite-conversion.md` — this file.
- `package.json` — @co-sy/satellite-auth installed from `/Users/sparkyspider/IdeaProjects/paperweek-sat1019/front/vendor/co-sy-satellite-auth-0.1.13.tgz` — filename `co-sy-satellite-auth-0.1.13.tgz`, version 0.1.13, sha256 33c184a0c0a47163bdf6b6044bb1b4e1cc045eb846763302a937bceb9bf5f936.

## What did NOT change

- No page was created. The module registers `/auth/callback` itself.
- No client secret was written, read or asked for. The login application is PKCE.
- No database was touched, nothing was pushed, nothing was deployed.
- `@co-sy/snag` is NOT installed here. The `snag` switch is written and inert until `npm i @co-sy/snag` names it in `modules`.

## Where a person without the role is refused

Access is gated on the role `PAPERWEEK_USER`. The refusal happens in the route
middleware `@co-sy/satellite-auth` registers — not in this app's own code. It reads the role ONLY
from the keyed claim `urn:zitadel:iam:org:project:395776530166317058:roles`, never
from the generic `urn:zitadel:iam:org:project:roles`, which mixes every project together.

## What a human must still do

Everything in [`satellite-zitadel-runbook.md`](satellite-zitadel-runbook.md) — the Zitadel project, the PKCE
application, the roles, the "assert roles on authentication" switch, the Co-Sy audience,
and the grant. Then the registry row, with this command, run by a Co-Sy platform
administrator:

```bash
curl -sS -X POST 'http://localhost:3051/api/api/v1/co-spaces' \
  -H 'Authorization: Bearer <PLATFORM_ADMIN_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Paperweek","slug":"paperweek","zitadelProjectId":"395776530166317058","clientId":"395776530585747458","allowedOrigins":["http://localhost:3212"],"owningOrgId":"395336402587353090","gated":true}'
```
