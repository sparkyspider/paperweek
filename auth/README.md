# auth/ — Zitadel provisioning for Productivity Tools

**There is no docker-compose here.** Zitadel is shared from `co-sy-v2/auth` — that repo owns
the container (`zitadel-co-sy-v2-auth`), the database, and the instance-level configuration
(Login V2, 6-digit OTP format). This directory only provisions a NEW org ("Productivity")
inside that shared instance and never touches anything belonging to `co-sy-v2`'s own "Co-Sy"
org.

**Never run `docker compose down -v` in `co-sy-v2/auth/`** — that would tear down the shared
instance for every project depending on it, not just this one.

## Scripts

None. `bootstrap-productivity.sh` and `add-user.sh` were removed on 2026-10-19: they minted the old
`prod-agent` client secret and PATs, and Paperweek now signs in through the Co-Sy satellite guard.
The only file here is `co-space.json`.

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
