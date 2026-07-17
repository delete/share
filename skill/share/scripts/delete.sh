#!/usr/bin/env bash
# Delete a published artifact before it expires.
#
# Usage:
#   delete.sh <id> <token>     # token is the "token" from publish.sh --json
#
# The instance URL is resolved from $SHARE_API_URL, ~/.share/config.json, or localhost.
set -euo pipefail

resolve_api() {
  if [ -n "${SHARE_API_URL:-}" ]; then printf '%s' "$SHARE_API_URL"; return; fi
  local cfg="$HOME/.share/config.json"
  if [ -f "$cfg" ]; then
    local u
    u="$(grep -o '"apiUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$cfg" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
    if [ -n "$u" ]; then printf '%s' "$u"; return; fi
  fi
  printf '%s' "http://localhost:8787"
}

id="${1:-}" token="${2:-}"
if [ -z "$id" ] || [ -z "$token" ]; then
  echo "usage: delete.sh <id> <token>" >&2
  exit 2
fi

api="$(resolve_api)"; api="${api%/}"
curl -fsS -X DELETE "$api/api/v1/docs/$id" -H "authorization: Bearer $token" >/dev/null \
  && echo "deleted $id" \
  || { echo "delete.sh: failed to delete $id" >&2; exit 1; }
