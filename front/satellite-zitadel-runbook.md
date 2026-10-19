# Zitadel runbook — Paperweek

Filled in and saved by `satellite-app-converter` on 2026-10-19 10:09:44 SAST. It is saved here, in the app,
because a terminal scrolls away and this list is the half of the conversion a machine
cannot do.

Everything below needs a person signed in to Zitadel at **http://localhost:8080** with rights to
create projects and applications. Do the steps in the order they are written. Step 4 is the
one that silently breaks everything if it is skipped.

Values this app was converted with:

| | |
|---|---|
| Slug | `paperweek` |
| Issuer | http://localhost:8080 |
| Client id | `395776530585747458` |
| Satellite project id | `395776530166317058` |
| Co-Sy project id (satellite-facing) | `392299905571356674` |
| Co-Sy API base | http://localhost:3051/api |
| Role that grants access | `PAPERWEEK_USER` |
| App origin | http://localhost:3212 |

The slug names the APP. The owner is the ORGANISATION.

`scopes` is not in this table — it defaults quietly, but if you set it, it must
be a list or absent, never a line of text. A string is not refused: it shatters
into single characters. Sign-in then succeeds with no roles, the same symptom
as step 4 below.

---

## 1 · Create the satellite's own Zitadel project

Create a project named after this app, in the satellite's own organisation.
Never Co-Sy's: Co-Sy grants it rights from the satellite-facing project instead.

Its id must be **`395776530166317058`** — that is the value the app was converted
with. If Zitadel gives you a different id, the project already existed or you made a second
one: fix the id in `nuxt.config.ts` under `cosySatellite.satelliteProjectId`, do not carry
on with two.

## 2 · Create its login application — PKCE, no secret

Inside that project, add an application:

- Type **User Agent** (a browser app), authentication method **PKCE**.
- **No client secret.** Zitadel must not offer you one; if it does, you picked the wrong
  type. A secret in a browser app is a secret published to the world.
- Client id: **`395776530585747458`**.
- Redirect URI: **http://localhost:3212/auth/callback**
- Post-logout redirect URI: **http://localhost:3212/**
- For local development only, allow development mode so `http://` redirects are accepted.

This project needs **two** such applications, not one: a **native** one for local
development and a **browser** one for production. A browser cannot mint tokens over plain
`http`, so `http://localhost` only works with the native application; the live https site
needs the browser one. Create the one you are working on now, then repeat this step for
the other environment and record its own client id.

The app creates no callback page of its own — `@co-sy/satellite-auth` registers
`http://localhost:3212/auth/callback` itself. Do not add one.

## 3 · Create the project's roles, including the one that grants access

In the satellite project, add its roles. One of them must be exactly:

**`PAPERWEEK_USER`**

That is the role the app's route middleware checks. Spelling is not negotiable — the
middleware compares the string.

## 4 · Switch "assert roles on authentication" OFF — on the satellite's own project

Satellite project → settings → turn **"Assert roles on authentication" OFF**.

**What breaks if you leave it on.** Zitadel silently drops every foreign-project role from
the token. The person signs in, the app sees its own roles and nothing from Co-Sy, and
every Co-Sy right disappears. There is no error, no log line and no warning anywhere — the
integration simply looks broken. This is the single most expensive step on this page, and
it is the easiest one to skip because nothing complains.

**Same symptom, a different cause:** `scopes` written as a string, not a list.
Zitadel does not refuse it; it shatters into single characters. Sign-in then
succeeds with no roles — check this too before assuming it is this switch.

**Same symptom, a third cause:** an audience scope built in zsh with `$VAR:a` expands `:a` as a path modifier, so the scope silently becomes a filesystem path and the token arrives with no roles — build scopes inside the script, never in the shell.

## 5 · Add the satellite-facing Co-Sy project's audience

The token has to carry Co-Sy's roles as well as this project's. The app already asks for
both audiences in its scopes:

```
urn:zitadel:iam:org:project:id:395776530166317058:aud
urn:zitadel:iam:org:project:id:392299905571356674:aud
```

On the **Co-Sy satellite-facing project `392299905571356674`**, make sure this satellite's
application is allowed to ask for that audience — grant the project to the satellite's
organisation, or add the audience on the application, whichever your Zitadel version
offers. Without it the Co-Sy roles never reach the token.

Rights are read only from the keyed claims
`urn:zitadel:iam:org:project:395776530166317058:roles` and
`urn:zitadel:iam:org:project:392299905571356674:roles`. The generic
`urn:zitadel:iam:org:project:roles` is never read: it mixes every project's roles into one
bag, so a satellite could name a role `manager` and be believed.

## 6 · Grant a person the role

Give at least one real person the role **`PAPERWEEK_USER`** on project
`395776530166317058` — otherwise the app is correctly closed to everybody, including
you, and the first test looks like a bug.

---

## 7 · Register the satellite in Co-Sy's registry

Not a Zitadel step, and not something this skill can do: the registry lives in Co-Sy's
database and this skill has no credentials for it. A **Co-Sy platform administrator** runs
this, signed in to the Co-Sy organisation — the route refuses anybody else, including a
platform administrator who has switched into a client organisation.

```bash
curl -sS -X POST 'http://localhost:3051/api/api/v1/co-spaces' \
  -H 'Authorization: Bearer <PLATFORM_ADMIN_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Paperweek","slug":"paperweek","zitadelProjectId":"395776530166317058","clientId":"395776530585747458","allowedOrigins":["http://localhost:3212"],"owningOrgId":"395336402587353090","gated":true}'
```

- Allowed origins: http://localhost:3212
- Owning organisation: 395336402587353090

It goes through the API rather than straight into the table on purpose: the API validates
the slug and the origins, enforces the platform-organisation guard, and refreshes Co-Sy's
in-process registry cache before it answers. A row inserted with SQL is invisible to the
running server until it restarts.

---

## 8 · Name the host's port, and check the address before signing in

Start the app with its port named explicitly. A dev server that finds its own port busy
silently moves to the next free one, and the redirect then stops matching what Zitadel
holds for it.

Before the first sign-in, check the printed address equals the registered origin,
character for character. A trailing slash, or `127.0.0.1` where `localhost` is registered,
is the commonest first failure — and it presents as a Zitadel problem rather than a typing
one.

If a later step depends on this dev server, start it detached, through the tooling — never
as a background job of whatever is running the step, because it dies when that step ends.

Every step that depends on this port proves it at the moment of use, with `lsof` and one
real request. Never carry "it is up" forward from an earlier message. A dev server can go
away for reasons nobody has established, and the only way to know is to ask the port.

## When it is done

Sign in at http://localhost:3212 as the person you granted in step 6. You should reach the app.
Sign in as someone without `PAPERWEEK_USER` and you should be refused.

If the person with the role is refused, step 4 is the first thing to check.

## How Paperweek was actually set up (19 Oct 2026, local)

Co-Sy's own registration command did every Zitadel step above in one act, so none of them was
done by hand. From the 102-public-home Co-Sy back:
`npm run satellite:register -- --file <paperweek>/auth/co-space.json --org <Public org id> --app-user <test agent>=PAPERWEEK_USER`.
It made the project, the PAPERWEEK_USER role, the PKCE sign-in application, the service account
and its key, the grant of Co-Sy's satellite-facing project, and the registry row. The row was
then switched on under Your apps. Do not run the `curl` registry command above as well: the row
already exists.

Organisation setup used: the first of the two. Paperweek's project lives in its own owning
organisation, **Public**, and Co-Sy's satellite-facing project is granted to it across
organisations. Why: Mark ruled on 15 Oct 2026 (102-Q7) that Paperweek leaves Co-Sy and belongs to
Public, because many people outside Co-Sy may use it. The earlier "Productivity" setup (084-Q4)
is superseded.
