#!/usr/bin/env bash
#
# Add (or update the roles of) a human user in the "Productivity" Zitadel org. Idempotent:
# an existing user is left as-is (password never reset on a re-run) and only has its role
# grant reconciled. Uses the prod-mgmt machine user's PAT (org-scoped ORG_OWNER on
# Productivity only — minted by bootstrap-productivity.sh), never the co-sy-v2 IAM_OWNER PAT.
#
# Usage: auth/add-user.sh <email> "<Full Name>" <role1,role2,...>
#   auth/add-user.sh mark@flyh2.com "Mark van Wyk" admin,user
#
set -euo pipefail

BASE="${ZITADEL_BASE:-http://localhost:8080}"
AUTH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MGMT_PAT_FILE="$AUTH_DIR/.machinekey/prod-mgmt-pat.txt"
AUTH_ENV="$AUTH_DIR/.env"

EMAIL="${1:?usage: add-user.sh <email> \"<Full Name>\" <role1,role2,...>}"
FULL_NAME="${2:?usage: add-user.sh <email> \"<Full Name>\" <role1,role2,...>}"
ROLES_CSV="${3:?usage: add-user.sh <email> \"<Full Name>\" <role1,role2,...>}"

c_reset=$'\033[0m'; c_blue=$'\033[34m'; c_green=$'\033[32m'; c_red=$'\033[31m'
step() { printf "%s▶%s %s\n" "$c_blue" "$c_reset" "$*"; }
ok()   { printf "  %s✓%s %s\n" "$c_green" "$c_reset" "$*"; }
die()  { printf "%s✗ %s%s\n" "$c_red" "$*" "$c_reset" >&2; exit 1; }

command -v curl    >/dev/null || die "curl not found."
command -v python3 >/dev/null || die "python3 not found."

[ -s "$MGMT_PAT_FILE" ] || die "prod-mgmt PAT not found at $MGMT_PAT_FILE — run bootstrap-productivity.sh first"
[ -s "$AUTH_ENV" ] || die "$AUTH_ENV not found — run bootstrap-productivity.sh first"
PAT="$(tr -d '[:space:]' < "$MGMT_PAT_FILE")"
ORG_ID="$(grep -E '^ZITADEL_ORG_ID=' "$AUTH_ENV" | cut -d= -f2-)"
PROJECT_ID="$(grep -E '^ZITADEL_PROJECT_ID=' "$AUTH_ENV" | cut -d= -f2-)"
[ -n "$ORG_ID" ] && [ -n "$PROJECT_ID" ] || die "ZITADEL_ORG_ID / ZITADEL_PROJECT_ID missing from $AUTH_ENV"

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

api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-s -X "$method" "$BASE$path"
    -H "Authorization: Bearer $PAT" -H "Content-Type: application/json"
    -H "x-zitadel-orgid: $ORG_ID")
  [ -n "$body" ] && args+=(-d "$body")
  curl "${args[@]}"
}

GIVEN="$(printf '%s' "$FULL_NAME" | awk '{print $1}')"
FAMILY="$(printf '%s' "$FULL_NAME" | cut -d' ' -f2- )"
[ -n "$FAMILY" ] || FAMILY="$GIVEN"
LOCAL_PART="${EMAIL%@*}"
PASSWORD_FILE="$AUTH_DIR/.machinekey/${LOCAL_PART}-initial-password.txt"

step "User $EMAIL"
UID_="$(api POST /management/v1/users/_search \
  "{\"queries\":[{\"emailQuery\":{\"emailAddress\":\"$EMAIL\",\"method\":\"TEXT_QUERY_METHOD_EQUALS_IGNORE_CASE\"}}]}" \
  | jget 'next((u["id"] for u in d.get("result",[])), "")')"

if [ -n "$UID_" ]; then
  ok "exists ($UID_) — password left as-is"
else
  if [ -s "$PASSWORD_FILE" ]; then
    PASSWORD="$(cat "$PASSWORD_FILE")"
  else
    PASSWORD="$(openssl rand -base64 18 | tr -d '\n')Aa1!"
    mkdir -p "$(dirname "$PASSWORD_FILE")"
    printf '%s' "$PASSWORD" > "$PASSWORD_FILE"
    chmod 600 "$PASSWORD_FILE"
  fi
  # changeRequired=true — Zitadel supports it on human creation; the person changes it via
  # Zitadel's own login UI (or an admin-issued password_reset code) before first BFF login.
  BODY="$(cat <<JSON
{"username":"$EMAIL","organization":{"orgId":"$ORG_ID"},"profile":{"givenName":"$GIVEN","familyName":"$FAMILY","displayName":"$FULL_NAME"},"email":{"email":"$EMAIL","isVerified":true},"password":{"password":"$PASSWORD","changeRequired":true}}
JSON
)"
  RESP="$(api POST /v2/users/human "$BODY")"
  UID_="$(printf '%s' "$RESP" | jget 'd.get("userId","")')"
  [ -n "$UID_" ] || die "failed to create user $EMAIL: $RESP"
  ok "created ($UID_) — initial password → $PASSWORD_FILE (git-ignored, not shown)"
fi

ROLE_JSON="$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1].split(",")))' "$ROLES_CSV")"
GRANT_ID="$(api POST /management/v1/users/grants/_search \
  "{\"queries\":[{\"userIdQuery\":{\"userId\":\"$UID_\"}},{\"projectIdQuery\":{\"projectId\":\"$PROJECT_ID\"}}]}" \
  | jget 'next((g["id"] for g in d.get("result",[])), "")')"
if [ -n "$GRANT_ID" ]; then
  api PUT "/management/v1/users/$UID_/grants/$GRANT_ID" "{\"roleKeys\":$ROLE_JSON}" >/dev/null
  ok "roles ensured: $ROLES_CSV"
else
  api POST "/management/v1/users/$UID_/grants" "{\"projectId\":\"$PROJECT_ID\",\"roleKeys\":$ROLE_JSON}" >/dev/null
  ok "roles granted: $ROLES_CSV"
fi

printf "\n%s✓ %s ready — userId:%s\n" "$c_green" "$EMAIL" "$c_reset"
printf "  %s\n" "$UID_"
