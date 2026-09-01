# auth/ — Zitadel provisioning for Productivity Tools

**There is no docker-compose here.** Zitadel is shared from `co-sy-v2/auth` — that repo owns
the container (`zitadel-co-sy-v2-auth`), the database, and the instance-level configuration
(Login V2, 6-digit OTP format). This directory only provisions a NEW org ("Productivity")
inside that shared instance and never touches anything belonging to `co-sy-v2`'s own "Co-Sy"
org.

**Never run `docker compose down -v` in `co-sy-v2/auth/`** — that would tear down the shared
instance for every project depending on it, not just this one.

## Scripts

- **`bootstrap-productivity.sh`** — idempotent (search-then-create-or-update). Creates the
  "Productivity" org, its "Productivity Platform" project (roles `admin`/`user`/`agent`), the
  "Productivity Front (SPA)" OIDC app (redirect `http://localhost:3200/auth/callback`,
  post-logout `http://localhost:3200`), and three machine users:
  - `prod-back` — instance role `IAM_LOGIN_CLIENT`, PAT → `.machinekey/prod-back-pat.txt` and
    `back/.env` `ZITADEL_BACK_PAT`. The BFF's only Zitadel credential.
  - `prod-mgmt` — org-scoped `ORG_OWNER` on the Productivity org **only** (not instance-wide),
    PAT → `.machinekey/prod-mgmt-pat.txt`. Used solely by `add-user.sh`, never by the running
    app.
  - `prod-agent` — granted the `agent` project role, `accessTokenType=JWT` (required so its
    client-credentials tokens are verifiable via Zitadel's JWKS, not an opaque bearer token),
    client secret → `.machinekey/prod-agent-secret.json`. See root `AGENTS.md` for the exact
    token request.

  Run it again any time — it's safe. It also (re-)writes the org id / project id / OIDC
  client id / back PAT into `back/.env` and `auth/.env`, never printing values.

- **`add-user.sh <email> "<Full Name>" <role1,role2,...>`** — adds (or reconciles the role
  grant of) a human user in the Productivity org, using `prod-mgmt`'s PAT. Generates an
  initial password on first creation (`.machinekey/<local-part>-initial-password.txt`,
  git-ignored, `changeRequired: true`); leaves an existing user's password untouched on a
  re-run.

  ```bash
  ./add-user.sh mark@flyh2.com "Mark van Wyk" admin,user
  ```

  Use this for a person who should live **in** the Productivity org. For someone who already
  has a Zitadel account in a different org, use the cross-org grant below instead — it never
  creates a duplicate account.

- **Cross-org grant (`bootstrap-productivity.sh` step, `GRANT_USER_EMAIL`-driven)** — Zitadel's
  **native** mechanism for letting a user whose home org is elsewhere log into this app without
  a second account: a **project grant** (this project → their home org) plus a **user grant**
  (their user → that project grant's roles). Optional and idempotent — skipped unless
  `GRANT_USER_EMAIL` is set; safe to re-run, never resets an existing password, never touches
  the target org's own settings/policies/IdPs/members.

  ```bash
  GRANT_USER_EMAIL=mark@flyh2.com ./bootstrap-productivity.sh   # GRANT_ORG_ID auto-discovered
  # optional: GRANT_ROLES=admin,user (default), GRANT_ORG_ID=<explicit org id>
  ```

## Known state (2026-09-01)

`mark@flyh2.com` is a Zitadel human user whose home org is **"FlyH2"**
(`387435674619346946`) — a live tenant org of the separate `co-sy-v2` application (Mark also
logs into `co-sy-v2` as this same account), not a leftover or something this project owns.
Zitadel usernames are unique instance-wide, so `add-user.sh` correctly refuses to duplicate
him into "Productivity". Instead, this project's only footprint on the FlyH2 org is two
**additive** grants created by `bootstrap-productivity.sh`'s cross-org step:

- a **project grant** of "Productivity Platform" (`388809441820016642`) to org
  `387435674619346946` (grant id `388813512794701826`), roles `admin,user`
- a **user grant** for `mark@flyh2.com` (user id `387437754994130946`) on that project grant
  (grant id `388813551164194818`), roles `admin,user`

His password was set (`changeRequired=false` — it's his own machine, and the password file at
`.machinekey/mark-initial-password.txt` is his to read) since the account had none yet.
Verified live 2026-09-01: `POST /auth/login {email, password}` → 201 with an access token;
`GET /auth/me` with that token → `roles: ["admin","user"]`; `GET /api/themes` → 200, his 7
existing themes. See `docs/decisions-auth.md` D-auth-058 for the reasoning (users are
instance-wide with one home org; apps grant their project to the user's home org rather than
duplicating users).

## Ports

This app: back **3201**, front **3200**. Zitadel itself: **8080** (shared). **Never** 3100/3101
— those are Mark's own `org.co-sy.board-web` / `org.co-sy.board-api` launchd services.

## .machinekey/ (git-ignored)

```
prod-back-pat.txt
prod-mgmt-pat.txt
prod-agent-secret.json          {userId, clientId, clientSecret}
mark-initial-password.txt       (written once, by the cross-org grant step)
```

(`add-user.sh` would write `<local-part>-initial-password.txt` for any user it creates in
Productivity directly; the cross-org grant step uses the same naming convention for a user
whose home org is elsewhere — same file, `mark-initial-password.txt`, either way.)

Never commit this directory, print its contents, or hand its values to anything outside this
machine.
