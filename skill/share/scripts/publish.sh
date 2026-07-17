#!/usr/bin/env bash
# Publish an HTML artifact to a Share instance and print the live link.
#
# Usage:
#   publish.sh <file.html>                 # publish a file
#   cat page.html | publish.sh -           # publish from stdin
#   publish.sh dash.html --slug sales-q3   # custom slug (a-z, 0-9, hyphen; 3-40 chars)
#   publish.sh secret.html --password pw   # password-protected view
#   publish.sh dash.html --json            # print the full JSON (url, token, ...)
#
# The instance URL is resolved from (in order): $SHARE_API_URL,
# ~/.share/config.json (written by `share config --api=`), then http://localhost:8787.
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

file="" slug="" password="" json=0
while [ $# -gt 0 ]; do
  case "$1" in
    --slug) slug="${2:-}"; shift 2 ;;
    --slug=*) slug="${1#*=}"; shift ;;
    --password) password="${2:-}"; shift 2 ;;
    --password=*) password="${1#*=}"; shift ;;
    --json) json=1; shift ;;
    -) file="-"; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) file="$1"; shift ;;
  esac
done

if [ -z "$file" ]; then
  echo "usage: publish.sh <file.html|-> [--slug S] [--password P] [--json]" >&2
  exit 2
fi
if [ "$file" = "-" ]; then
  body="$(cat)"
elif [ -f "$file" ]; then
  body="$(cat "$file")"
else
  echo "publish.sh: file not found: $file" >&2
  exit 2
fi

api="$(resolve_api)"
api="${api%/}"

headers=(-H "content-type: text/html; charset=utf-8" -H "x-agent-name: share-skill")
[ -n "$slug" ] && headers+=(-H "x-slug: $slug")
[ -n "$password" ] && headers+=(-H "x-password: $password")

resp="$(printf '%s' "$body" | curl -fsS -X POST "$api/api/v1/docs" "${headers[@]}" --data-binary @- 2>/dev/null)" || {
  echo "publish.sh: request to $api failed" >&2
  exit 1
}

if [ "$json" = "1" ]; then
  printf '%s\n' "$resp"
  exit 0
fi

url="$(printf '%s' "$resp" | grep -o '"url"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
if [ -n "$url" ]; then
  printf '%s\n' "$url"
else
  printf '%s\n' "$resp" >&2
  exit 1
fi
