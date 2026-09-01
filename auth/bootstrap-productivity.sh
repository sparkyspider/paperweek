#!/usr/bin/env bash
#
# Config-as-code bootstrap for productivity-tools, against the SHARED local Zitadel instance
# that co-sy-v2/auth already runs (container zitadel-co-sy-v2-auth). Idempotent: search-then-
# create-or-update, safe to re-run — never duplicates, never errors on a second run.
#
# DOES NOT touch any instance-level setting (Login V2 / OTP format are already configured by
# co-sy-v2's own bootstrap and must not be changed here), and NEVER touches the existing
# "Co-Sy" org, its project, apps or machine users. Everything below is scoped to a brand new
# org, "Productivity".
#
# What it creates:
#   1. Org        "Productivity" — org-scoped login policy (forceMfa=false, allowRegister=
#                 false) + lockout policy (5 attempts).
#   2. Project    "Productivity Platform" (projectRoleAssertion=true).
#   3. Roles      admin, user, agent.
#   4. OIDC app   "Productivity Front (SPA)" — user-agent/PKCE/auth-method none, redirect
#                 http://localhost:3200/auth/callback, post-logout http://localhost:3200,
#                 grants authorization_code + refresh_token. clientId → back/.env.
#                 NOTE: ports 3100/3101 are taken by Mark's own launchd services
#                 (org.co-sy.board-web / org.co-sy.board-api) — never touch those. This app
#                 uses 3200 (front) / 3201 (back).
#   5. prod-back   machine user, instance role IAM_LOGIN_CLIENT (least-priv login-broker for
#                  the BFF) — PAT → .machinekey/prod-back-pat.txt AND back/.env.
#   6. prod-mgmt   machine user, ORG_OWNER on the Productivity org ONLY (not instance-wide) —
#                  used by add-user.sh for user/role management, never by the running app.
#                  PAT → .machinekey/prod-mgmt-pat.txt.
#   7. prod-agent  machine user WITH the project role `agent` granted, plus an OAuth2 client
#                  secret so it can obtain access tokens via the client_credentials grant
#                  (AGENTS.md documents the exact token request). Secret →
#                  .machinekey/prod-agent-secret.json.
#   8. (optional, GRANT_USER_EMAIL-driven) Zitadel's native cross-org mechanism: a project
#                  grant of "Productivity Platform" to another existing user's home org, plus a
#                  user grant for them on it — lets a user from any org on this shared instance
#                  (e.g. mark@flyh2.com in "FlyH2") log into this app without a duplicate
#                  account. See step 9 below for the exact env vars.
#
# Auth: the co-sy-v2 instance-owner bootstrap PAT (IAM_OWNER) at
# co-sy-v2/auth/.machinekey/pat.txt — read-only reference into that repo, never modified.
#
set -euo pipefail

BASE="${ZITADEL_BASE:-http://localhost:8080}"
AUTH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$AUTH_DIR/.." && pwd)"
BACK_ENV="$REPO_ROOT/back/.env"
AUTH_ENV="$AUTH_DIR/.env"
COSY_PAT_FILE="$REPO_ROOT/../co-sy-v2/auth/.machinekey/pat.txt"

ORG_NAME="Productivity"
PROJECT_NAME="Productivity Platform"
APP_NAME="Productivity Front (SPA)"

ROLES=(
  "admin|Admin|major"
  "user|User|major"
  "agent|Agent|major"
)

REDIRECT_URI="${BOOTSTRAP_REDIRECT_URI:-http://localhost:3200/auth/callback}"
POST_LOGOUT_URI="${BOOTSTRAP_POST_LOGOUT_URI:-http://localhost:3200}"

c_reset=$'\033[0m'; c_blue=$'\033[34m'; c_green=$'\033[32m'; c_red=$'\033[31m'; c_dim=$'\033[2m'
step() { printf "%s▶%s %s\n" "$c_blue" "$c_reset" "$*"; }
ok()   { printf "  %s✓%s %s\n" "$c_green" "$c_reset" "$*"; }
die()  { printf "%s✗ %s%s\n" "$c_red" "$*" "$c_reset" >&2; exit 1; }

command -v curl    >/dev/null || die "curl not found."
command -v python3 >/dev/null || die "python3 not found (used to parse JSON)."

[ -s "$COSY_PAT_FILE" ] || die "co-sy-v2 IAM_OWNER PAT not found at $COSY_PAT_FILE"
PAT="$(tr -d '[:space:]' < "$COSY_PAT_FILE")"

if ! curl -sf -o /dev/null "$BASE/debug/healthz"; then
  die "Zitadel not reachable at $BASE — is the co-sy-v2 stack up? (never run 'docker compose down -v' there)"
fi

jget() {
  python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    print(""); sys.exit(0)
try:
    v = eval(sys.argv[1], {"d": d})
except Exception:
    v = ""
print("" if v is None else v)
' "$1"
}

ORG_HEADER=""
api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-s -X "$method" "$BASE$path"
    -H "Authorization: Bearer $PAT" -H "Content-Type: application/json")
  [ -n "$ORG_HEADER" ] && args+=(-H "x-zitadel-orgid: $ORG_HEADER")
  [ -n "$body" ] && args+=(-d "$body")
  curl "${args[@]}"
}

# upsert KEY=VALUE into a .env file, never printing the value.
env_set() {
  local file="$1" key="$2" val="$3"
  touch "$file"
  if grep -q "^${key}=" "$file"; then
    python3 - "$file" "$key" "$val" <<'PY'
import sys, re
path, key, val = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f: txt = f.read()
txt = re.sub(rf'^{re.escape(key)}=.*$', f'{key}={val}', txt, flags=re.M)
with open(path, 'w') as f: f.write(txt)
PY
  else
    printf '\n%s=%s\n' "$key" "$val" >> "$file"
  fi
}

# --- 1. organisation ----------------------------------------------------------
step "Organisation \"$ORG_NAME\""
ORG_ID="$(api POST /admin/v1/orgs/_search \
  "{\"queries\":[{\"nameQuery\":{\"name\":\"$ORG_NAME\",\"method\":\"TEXT_QUERY_METHOD_EQUALS\"}}]}" \
  | jget 'next((o["id"] for o in d.get("result",[]) if o["name"]=="'"$ORG_NAME"'"), "")')"
if [ -n "$ORG_ID" ]; then
  ok "exists ($ORG_ID)"
else
  ORG_ID="$(api POST /management/v1/orgs "{\"name\":\"$ORG_NAME\"}" | jget 'd.get("id","")')"
  [ -n "$ORG_ID" ] || die "failed to create org \"$ORG_NAME\""
  ok "created ($ORG_ID)"
fi
ORG_HEADER="$ORG_ID"
env_set "$AUTH_ENV" ZITADEL_ORG_ID "$ORG_ID"
env_set "$BACK_ENV" ZITADEL_ORG_ID "$ORG_ID"

# --- 2. project -----------------------------------------------------------------
step "Project \"$PROJECT_NAME\""
PROJECT_ID="$(api POST /management/v1/projects/_search \
  "{\"queries\":[{\"nameQuery\":{\"name\":\"$PROJECT_NAME\",\"method\":\"TEXT_QUERY_METHOD_EQUALS\"}}]}" \
  | jget 'next((p["id"] for p in d.get("result",[]) if p["name"]=="'"$PROJECT_NAME"'"), "")')"
if [ -n "$PROJECT_ID" ]; then
  ok "exists ($PROJECT_ID)"
else
  PROJECT_ID="$(api POST /management/v1/projects "{\"name\":\"$PROJECT_NAME\"}" | jget 'd.get("id","")')"
  [ -n "$PROJECT_ID" ] || die "failed to create project \"$PROJECT_NAME\""
  ok "created ($PROJECT_ID)"
fi
api PUT "/management/v1/projects/$PROJECT_ID" \
  "{\"name\":\"$PROJECT_NAME\",\"projectRoleAssertion\":true,\"projectRoleCheck\":false,\"hasProjectCheck\":false,\"privateLabelingSetting\":\"PRIVATE_LABELING_SETTING_UNSPECIFIED\"}" >/dev/null
ok "role assertion on"
env_set "$AUTH_ENV" ZITADEL_PROJECT_ID "$PROJECT_ID"
env_set "$BACK_ENV" ZITADEL_PROJECT_ID "$PROJECT_ID"

# --- 3. roles ---------------------------------------------------------------
step "Roles"
EXISTING_ROLES="$(api POST "/management/v1/projects/$PROJECT_ID/roles/_search" '{}' \
  | jget '",".join(r["key"] for r in d.get("result",[]))')"
for spec in "${ROLES[@]}"; do
  IFS='|' read -r key disp grp <<< "$spec"
  if printf ",%s," "$EXISTING_ROLES" | grep -q ",$key,"; then
    api PUT "/management/v1/projects/$PROJECT_ID/roles/$key" \
      "{\"displayName\":\"$disp\",\"group\":\"$grp\"}" >/dev/null
    ok "$key — exists (synced)"
  else
    api POST "/management/v1/projects/$PROJECT_ID/roles" \
      "{\"roleKey\":\"$key\",\"displayName\":\"$disp\",\"group\":\"$grp\"}" >/dev/null
    ok "$key — created"
  fi
done

# --- 4. OIDC application (SPA / PKCE / auth-method none) ---------------------
step "OIDC application \"$APP_NAME\""
APP_ID="$(api POST "/management/v1/projects/$PROJECT_ID/apps/_search" \
  "{\"queries\":[{\"nameQuery\":{\"name\":\"$APP_NAME\",\"method\":\"TEXT_QUERY_METHOD_EQUALS\"}}]}" \
  | jget 'next((a["id"] for a in d.get("result",[]) if a.get("name")=="'"$APP_NAME"'"), "")')"

APP_BODY="$(cat <<JSON
{
  "name": "$APP_NAME",
  "redirectUris": ["$REDIRECT_URI"],
  "postLogoutRedirectUris": ["$POST_LOGOUT_URI"],
  "responseTypes": ["OIDC_RESPONSE_TYPE_CODE"],
  "grantTypes": ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE", "OIDC_GRANT_TYPE_REFRESH_TOKEN"],
  "appType": "OIDC_APP_TYPE_USER_AGENT",
  "authMethodType": "OIDC_AUTH_METHOD_TYPE_NONE",
  "accessTokenType": "OIDC_TOKEN_TYPE_JWT",
  "accessTokenRoleAssertion": true,
  "idTokenRoleAssertion": true,
  "idTokenUserinfoAssertion": true,
  "devMode": true
}
JSON
)"

if [ -n "$APP_ID" ]; then
  api PUT "/management/v1/projects/$PROJECT_ID/apps/$APP_ID/oidc_config" "$APP_BODY" >/dev/null
  CLIENT_ID="$(api GET "/management/v1/projects/$PROJECT_ID/apps/$APP_ID" \
    | jget 'd.get("app",{}).get("oidcConfig",{}).get("clientId","")')"
  ok "exists ($APP_ID) — config synced"
else
  RESP="$(api POST "/management/v1/projects/$PROJECT_ID/apps/oidc" "$APP_BODY")"
  APP_ID="$(printf '%s' "$RESP" | jget 'd.get("appId","")')"
  CLIENT_ID="$(printf '%s' "$RESP" | jget 'd.get("clientId","")')"
  [ -n "$CLIENT_ID" ] || die "failed to create OIDC app: $RESP"
  ok "created ($APP_ID)"
fi
[ -n "$CLIENT_ID" ] || die "could not resolve OIDC clientId for \"$APP_NAME\""
env_set "$BACK_ENV" ZITADEL_OIDC_CLIENT_ID "$CLIENT_ID"
env_set "$BACK_ENV" OIDC_REDIRECT_URI "$REDIRECT_URI"
env_set "$AUTH_ENV" ZITADEL_OIDC_CLIENT_ID "$CLIENT_ID"
ok "clientId → back/.env ZITADEL_OIDC_CLIENT_ID (value not shown)"

# --- 5. login policy (org level) — forceMfa=false, allowRegister=false -------
step "Login policy (forceMfa=false, allowRegister=false)"
POLICY="$(api GET /management/v1/policies/login)"
IS_DEFAULT="$(printf '%s' "$POLICY" | jget 'str(d.get("policy",{}).get("isDefault", d.get("isDefault", False))).lower()')"
POLICY_BODY='{
  "allowUsernamePassword": true,
  "allowRegister": false,
  "allowExternalIdp": false,
  "forceMfa": false,
  "forceMfaLocalOnly": false,
  "passwordlessType": "PASSWORDLESS_TYPE_ALLOWED",
  "hidePasswordReset": false,
  "ignoreUnknownUsernames": false,
  "allowDomainDiscovery": false,
  "disableLoginWithEmail": false,
  "disableLoginWithPhone": false
}'
if [ "$IS_DEFAULT" = "true" ]; then
  api POST /management/v1/policies/login "$POLICY_BODY" >/dev/null
  ok "custom org login policy created"
else
  api PUT /management/v1/policies/login "$POLICY_BODY" >/dev/null
  ok "updated"
fi

# --- 5b. lockout policy (org level) — 5 attempts -----------------------------
step "Lockout policy (5 attempts)"
LOCKOUT="$(api GET /management/v1/policies/lockout)"
LO_DEFAULT="$(printf '%s' "$LOCKOUT" | jget 'str(d.get("policy",{}).get("isDefault", d.get("isDefault", False))).lower()')"
LOCKOUT_BODY='{"maxPasswordAttempts": 5, "maxOtpAttempts": 5}'
if [ "$LO_DEFAULT" = "true" ]; then
  api POST /management/v1/policies/lockout "$LOCKOUT_BODY" >/dev/null
  ok "custom org lockout policy created"
else
  api PUT /management/v1/policies/lockout "$LOCKOUT_BODY" >/dev/null
  ok "updated"
fi

# --- 6. prod-back — least-priv login-broker for the BFF ----------------------
step "prod-back (IAM_LOGIN_CLIENT · login-broker)"
BACK_USER="prod-back"
BACK_PAT_FILE="$AUTH_DIR/.machinekey/prod-back-pat.txt"
BACK_UID="$(api POST /management/v1/users/_search \
  "{\"queries\":[{\"userNameQuery\":{\"userName\":\"$BACK_USER\",\"method\":\"TEXT_QUERY_METHOD_EQUALS\"}}]}" \
  | jget 'next((u["id"] for u in d.get("result",[]) if u.get("userName")=="'"$BACK_USER"'"), "")')"
if [ -n "$BACK_UID" ]; then
  ok "user exists ($BACK_UID)"
else
  BACK_UID="$(api POST /management/v1/users/machine \
    "{\"userName\":\"$BACK_USER\",\"name\":\"Productivity Backend (BFF)\",\"description\":\"Least-priv login-broker for back/\",\"accessTokenType\":\"ACCESS_TOKEN_TYPE_BEARER\"}" \
    | jget 'd.get("userId","")')"
  [ -n "$BACK_UID" ] || die "failed to create machine user $BACK_USER"
  ok "user created ($BACK_UID)"
fi
api POST /admin/v1/members "{\"userId\":\"$BACK_UID\",\"roles\":[\"IAM_LOGIN_CLIENT\"]}" >/dev/null 2>&1 || true
api PUT  "/admin/v1/members/$BACK_UID" '{"roles":["IAM_LOGIN_CLIENT"]}' >/dev/null 2>&1 || true
ok "IAM_LOGIN_CLIENT granted (instance)"
if [ -s "$BACK_PAT_FILE" ]; then
  ok "PAT present ($BACK_PAT_FILE) — not re-minted"
else
  BACK_PAT="$(api POST "/management/v1/users/$BACK_UID/pats" '{}' | jget 'd.get("token","")')"
  [ -n "$BACK_PAT" ] || die "failed to mint PAT for $BACK_USER"
  mkdir -p "$(dirname "$BACK_PAT_FILE")"; printf '%s' "$BACK_PAT" > "$BACK_PAT_FILE"; chmod 600 "$BACK_PAT_FILE"
  ok "PAT minted → $BACK_PAT_FILE (value not shown)"
fi
# Self-healing: back/.env always ends up with the PAT that's on disk, even on a re-run.
env_set "$BACK_ENV" ZITADEL_BACK_PAT "$(tr -d '[:space:]' < "$BACK_PAT_FILE")"

# --- 7. prod-mgmt — org manager on Productivity ONLY (org-scoped, not instance) ----
step "prod-mgmt (ORG_OWNER on Productivity org only)"
MGMT_USER="prod-mgmt"
MGMT_PAT_FILE="$AUTH_DIR/.machinekey/prod-mgmt-pat.txt"
MGMT_UID="$(api POST /management/v1/users/_search \
  "{\"queries\":[{\"userNameQuery\":{\"userName\":\"$MGMT_USER\",\"method\":\"TEXT_QUERY_METHOD_EQUALS\"}}]}" \
  | jget 'next((u["id"] for u in d.get("result",[]) if u.get("userName")=="'"$MGMT_USER"'"), "")')"
if [ -n "$MGMT_UID" ]; then
  ok "user exists ($MGMT_UID)"
else
  MGMT_UID="$(api POST /management/v1/users/machine \
    "{\"userName\":\"$MGMT_USER\",\"name\":\"Productivity Backend (org management)\",\"description\":\"Org manager for the Productivity org only — used by auth/add-user.sh\",\"accessTokenType\":\"ACCESS_TOKEN_TYPE_BEARER\"}" \
    | jget 'd.get("userId","")')"
  [ -n "$MGMT_UID" ] || die "failed to create machine user $MGMT_USER"
  ok "user created ($MGMT_UID)"
fi
# org-scoped membership (NOT /admin/v1/members — that would be instance-wide). x-zitadel-orgid
# is already ORG_ID here, so /orgs/me addresses the Productivity org.
api POST /management/v1/orgs/me/members "{\"userId\":\"$MGMT_UID\",\"roles\":[\"ORG_OWNER\"]}" >/dev/null 2>&1 || true
api PUT  "/management/v1/orgs/me/members/$MGMT_UID" '{"roles":["ORG_OWNER"]}' >/dev/null 2>&1 || true
ok "ORG_OWNER granted on org $ORG_ID only"
if [ -s "$MGMT_PAT_FILE" ]; then
  ok "PAT present ($MGMT_PAT_FILE) — not re-minted"
else
  MGMT_PAT="$(api POST "/management/v1/users/$MGMT_UID/pats" '{}' | jget 'd.get("token","")')"
  [ -n "$MGMT_PAT" ] || die "failed to mint PAT for $MGMT_USER"
  mkdir -p "$(dirname "$MGMT_PAT_FILE")"; printf '%s' "$MGMT_PAT" > "$MGMT_PAT_FILE"; chmod 600 "$MGMT_PAT_FILE"
  ok "PAT minted → $MGMT_PAT_FILE (value not shown)"
fi

# --- 8. prod-agent — API caller, granted the `agent` project role -----------
step "prod-agent (agent role · client_credentials)"
AGENT_USER="prod-agent"
AGENT_SECRET_FILE="$AUTH_DIR/.machinekey/prod-agent-secret.json"
AGENT_UID="$(api POST /management/v1/users/_search \
  "{\"queries\":[{\"userNameQuery\":{\"userName\":\"$AGENT_USER\",\"method\":\"TEXT_QUERY_METHOD_EQUALS\"}}]}" \
  | jget 'next((u["id"] for u in d.get("result",[]) if u.get("userName")=="'"$AGENT_USER"'"), "")')"
# accessTokenType MUST be JWT: back/'s JwtAuthGuard verifies via Zitadel's public JWKS only
# (no introspection call) — an opaque ACCESS_TOKEN_TYPE_BEARER token cannot be checked there.
if [ -n "$AGENT_UID" ]; then
  ok "user exists ($AGENT_UID)"
else
  AGENT_UID="$(api POST /management/v1/users/machine \
    "{\"userName\":\"$AGENT_USER\",\"name\":\"Productivity Agent\",\"description\":\"AI agents calling the API directly (see AGENTS.md)\",\"accessTokenType\":\"ACCESS_TOKEN_TYPE_JWT\"}" \
    | jget 'd.get("userId","")')"
  [ -n "$AGENT_UID" ] || die "failed to create machine user $AGENT_USER"
  ok "user created ($AGENT_UID)"
fi
# Idempotent sync — also repairs an existing user created before this was JWT (self-healing).
api PUT "/management/v1/users/$AGENT_UID/machine" \
  "{\"name\":\"Productivity Agent\",\"description\":\"AI agents calling the API directly (see AGENTS.md)\",\"accessTokenType\":\"ACCESS_TOKEN_TYPE_JWT\"}" >/dev/null
ok "accessTokenType=JWT ensured"
# Project role grant (search-then-create-or-update).
AGENT_GRANT_ID="$(api POST /management/v1/users/grants/_search \
  "{\"queries\":[{\"userIdQuery\":{\"userId\":\"$AGENT_UID\"}},{\"projectIdQuery\":{\"projectId\":\"$PROJECT_ID\"}}]}" \
  | jget 'next((g["id"] for g in d.get("result",[])), "")')"
if [ -n "$AGENT_GRANT_ID" ]; then
  api PUT "/management/v1/users/$AGENT_UID/grants/$AGENT_GRANT_ID" '{"roleKeys":["agent"]}' >/dev/null
  ok "agent role ensured (updated)"
else
  api POST "/management/v1/users/$AGENT_UID/grants" "{\"projectId\":\"$PROJECT_ID\",\"roleKeys\":[\"agent\"]}" >/dev/null
  ok "agent role granted"
fi
if [ -s "$AGENT_SECRET_FILE" ]; then
  ok "client secret present ($AGENT_SECRET_FILE) — not re-minted"
else
  SECRET_RESP="$(api PUT "/management/v1/users/$AGENT_UID/secret" '{}')"
  AGENT_CLIENT_ID="$(printf '%s' "$SECRET_RESP" | jget 'd.get("clientId","")')"
  AGENT_CLIENT_SECRET="$(printf '%s' "$SECRET_RESP" | jget 'd.get("clientSecret","")')"
  [ -n "$AGENT_CLIENT_ID" ] && [ -n "$AGENT_CLIENT_SECRET" ] || die "failed to mint client secret for $AGENT_USER: $SECRET_RESP"
  mkdir -p "$(dirname "$AGENT_SECRET_FILE")"
  printf '{"userId":"%s","clientId":"%s","clientSecret":"%s"}\n' "$AGENT_UID" "$AGENT_CLIENT_ID" "$AGENT_CLIENT_SECRET" > "$AGENT_SECRET_FILE"
  chmod 600 "$AGENT_SECRET_FILE"
  ok "client secret minted → $AGENT_SECRET_FILE (value not shown)"
fi

# --- 9. Cross-org grant — Zitadel's NATIVE cross-org mechanism (optional) ---------------
# Skipped unless GRANT_USER_EMAIL is set. Gives an EXISTING user who lives in a DIFFERENT
# home org (any org on this shared instance — e.g. "FlyH2") access to this project WITHOUT
# duplicating their account into "Productivity". This is Zitadel's own mechanism for exactly
# that: a ProjectGrant (this project -> their home org) plus a UserGrant (their user -> that
# ProjectGrant's roles). NEVER creates a user — refuses if the email isn't found anywhere on
# the instance. NEVER touches the target org's own settings/policies/IdPs/members — the only
# writes there are the additive UserGrant (and, if the account has no password yet, setting
# one — see below).
#
#   GRANT_USER_EMAIL   email of an existing Zitadel user, in ANY org on this instance.
#   GRANT_ORG_ID        (optional) their home org id — auto-discovered from the user's
#                        resourceOwner via Zitadel's org-agnostic v2 user search if omitted.
#   GRANT_ROLES         (optional) comma-separated role keys, default "admin,user". Never
#                        include "agent" here — that role is for this app's own machine user,
#                        not for humans.
#
# Example: GRANT_USER_EMAIL=mark@flyh2.com ./bootstrap-productivity.sh
if [ -n "${GRANT_USER_EMAIL:-}" ]; then
  step "Cross-org grant for $GRANT_USER_EMAIL"
  GRANT_ROLES="${GRANT_ROLES:-admin,user}"
  GRANT_ROLE_JSON="$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1].split(",")))' "$GRANT_ROLES")"

  # v2 user search is org-agnostic (no x-zitadel-orgid needed) — the one lookup that must work
  # without already knowing which org the person lives in.
  V2_FOUND="$(curl -s -X POST "$BASE/v2/users" \
    -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
    -d "{\"queries\":[{\"emailQuery\":{\"emailAddress\":\"$GRANT_USER_EMAIL\",\"method\":\"TEXT_QUERY_METHOD_EQUALS_IGNORE_CASE\"}}]}")"
  GRANT_USER_ID="$(printf '%s' "$V2_FOUND" | jget 'next((u["userId"] for u in d.get("result",[])), "")')"
  [ -n "$GRANT_USER_ID" ] || die "GRANT_USER_EMAIL=$GRANT_USER_EMAIL not found on this Zitadel instance — this script never creates users, refusing"
  DISCOVERED_ORG_ID="$(printf '%s' "$V2_FOUND" | jget 'next((u["details"]["resourceOwner"] for u in d.get("result",[])), "")')"
  GRANT_ORG_ID="${GRANT_ORG_ID:-$DISCOVERED_ORG_ID}"
  [ -n "$GRANT_ORG_ID" ] || die "could not discover a home org for $GRANT_USER_EMAIL — set GRANT_ORG_ID explicitly"
  ok "found $GRANT_USER_EMAIL — user $GRANT_USER_ID, home org $GRANT_ORG_ID"

  if [ "$GRANT_ORG_ID" = "$ORG_ID" ]; then
    ok "already a member of Productivity — use add-user.sh instead, skipping cross-org grant"
  else
    # Password: NEVER reset an existing one (mirrors add-user.sh's "leave as-is on a re-run")
    # — only set if the account currently has none set at all.
    HAS_PW="$(printf '%s' "$V2_FOUND" | jget 'bool(next((u.get("human",{}).get("passwordChanged") for u in d.get("result",[])), ""))')"
    PW_FILE="$AUTH_DIR/.machinekey/${GRANT_USER_EMAIL%%@*}-initial-password.txt"
    if [ "$HAS_PW" = "True" ]; then
      ok "password already set on that account — left as-is"
    else
      if [ -s "$PW_FILE" ]; then
        GRANT_PASSWORD="$(cat "$PW_FILE")"
      else
        GRANT_PASSWORD="$(openssl rand -base64 18 | tr -d '\n')Aa1!"
        mkdir -p "$(dirname "$PW_FILE")"; printf '%s' "$GRANT_PASSWORD" > "$PW_FILE"; chmod 600 "$PW_FILE"
      fi
      # changeRequired=false: it's the person's own machine and the password file is theirs
      # to read — no separate "first login" ceremony needed for a local dev instance.
      curl -s -X POST "$BASE/v2/users/$GRANT_USER_ID/password" \
        -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
        -d "{\"newPassword\":{\"password\":\"$GRANT_PASSWORD\",\"changeRequired\":false}}" >/dev/null
      unset GRANT_PASSWORD
      ok "password set (changeRequired=false) → $PW_FILE (not shown)"
    fi

    # Project grant: this project -> their home org. Search+filter client-side — Zitadel's
    # ProjectGrantQuery has no grantedOrgId filter (only name/roleKey queries are accepted;
    # verified live against this instance). Context = Productivity (the project-owning org) —
    # `api()` already sends x-zitadel-orgid: $ORG_HEADER, which is the Productivity org id set
    # in step 1.
    PG_SEARCH="$(api POST "/management/v1/projects/$PROJECT_ID/grants/_search" '{}')"
    PG_ID="$(printf '%s' "$PG_SEARCH" | jget 'next((g["grantId"] for g in d.get("result",[]) if g.get("grantedOrgId")=="'"$GRANT_ORG_ID"'"), "")')"
    if [ -n "$PG_ID" ]; then
      api PUT "/management/v1/projects/$PROJECT_ID/grants/$PG_ID" "{\"roleKeys\":$GRANT_ROLE_JSON}" >/dev/null 2>&1 || true
      ok "project grant to org $GRANT_ORG_ID exists ($PG_ID) — roles synced"
    else
      PG_RESP="$(api POST "/management/v1/projects/$PROJECT_ID/grants" "{\"grantedOrgId\":\"$GRANT_ORG_ID\",\"roleKeys\":$GRANT_ROLE_JSON}")"
      PG_ID="$(printf '%s' "$PG_RESP" | jget 'd.get("grantId","")')"
      [ -n "$PG_ID" ] || die "failed to create project grant to org $GRANT_ORG_ID: $PG_RESP"
      ok "project grant created ($PG_ID)"
    fi

    # User grant: their user -> this project, addressed in THEIR org's context (not
    # Productivity's) — Zitadel resolves it against the ProjectGrant above automatically.
    UG_SEARCH="$(curl -s -X POST "$BASE/management/v1/users/grants/_search" \
      -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
      -H "x-zitadel-orgid: $GRANT_ORG_ID" \
      -d "{\"queries\":[{\"userIdQuery\":{\"userId\":\"$GRANT_USER_ID\"}},{\"projectIdQuery\":{\"projectId\":\"$PROJECT_ID\"}}]}")"
    UG_ID="$(printf '%s' "$UG_SEARCH" | jget 'next((g["id"] for g in d.get("result",[])), "")')"
    if [ -n "$UG_ID" ]; then
      curl -s -X PUT "$BASE/management/v1/users/$GRANT_USER_ID/grants/$UG_ID" \
        -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
        -H "x-zitadel-orgid: $GRANT_ORG_ID" \
        -d "{\"roleKeys\":$GRANT_ROLE_JSON}" >/dev/null 2>&1 || true
      ok "user grant exists ($UG_ID) — roles synced: $GRANT_ROLES"
    else
      UG_RESP="$(curl -s -X POST "$BASE/management/v1/users/$GRANT_USER_ID/grants" \
        -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
        -H "x-zitadel-orgid: $GRANT_ORG_ID" \
        -d "{\"projectId\":\"$PROJECT_ID\",\"roleKeys\":$GRANT_ROLE_JSON}")"
      UG_ID="$(printf '%s' "$UG_RESP" | jget 'd.get("userGrantId","")')"
      [ -n "$UG_ID" ] || die "failed to create user grant for $GRANT_USER_EMAIL: $UG_RESP"
      ok "user grant created ($UG_ID) — roles: $GRANT_ROLES"
    fi
    ok "$GRANT_USER_EMAIL ($GRANT_USER_ID) can now log into this app via org $GRANT_ORG_ID, roles: $GRANT_ROLES"
  fi
fi

# --- summary ------------------------------------------------------------------
printf "\n%s─── bootstrap summary ───%s\n" "$c_dim" "$c_reset"
printf "  org        %s  (%s)\n" "$ORG_NAME" "$ORG_ID"
printf "  project    %s  (%s)\n" "$PROJECT_NAME" "$PROJECT_ID"
printf "  roles      admin, user, agent\n"
printf "  oidc app   %s  (%s) — clientId → back/.env (not shown)\n" "$APP_NAME" "$APP_ID"
printf "  login policy  forceMfa=false, allowRegister=false on org %s\n" "$ORG_NAME"
printf "  lockout       maxPasswordAttempts=5, maxOtpAttempts=5\n"
printf "  prod-back   %s — PAT → .machinekey/prod-back-pat.txt + back/.env\n" "$BACK_UID"
printf "  prod-mgmt   %s — PAT → .machinekey/prod-mgmt-pat.txt (org-scoped ORG_OWNER)\n" "$MGMT_UID"
printf "  prod-agent  %s — role 'agent', secret → .machinekey/prod-agent-secret.json\n" "$AGENT_UID"
if [ -n "${GRANT_USER_EMAIL:-}" ] && [ -n "${GRANT_USER_ID:-}" ] && [ "${GRANT_ORG_ID:-}" != "$ORG_ID" ]; then
  printf "  cross-org   %s (%s) — org %s, roles %s (grant %s)\n" "$GRANT_USER_EMAIL" "$GRANT_USER_ID" "$GRANT_ORG_ID" "$GRANT_ROLES" "${UG_ID:-existing}"
fi
printf "%s✓ bootstrap complete%s\n" "$c_green" "$c_reset"
printf "\nNext: %sauth/add-user.sh mark@flyh2.com \"Mark van Wyk\" admin,user%s\n" "$c_dim" "$c_reset"
