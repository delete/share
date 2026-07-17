---
name: share
description: Publishes HTML artifacts and returns a live shareable link (reference instance share.fellipe.dev). Use whenever you generate an HTML artifact — report, dashboard, mockup, chart, slide — and want a browser-viewable link, optionally protected with a password and a custom slug. Links expire in 15 days.
---

# Share — share HTML artifacts

Whenever you produce a self-contained HTML artifact (a single file, with inline CSS/JS)
and the user wants to **see the result in the browser** or **send someone a link**,
publish it and return the link.

This skill ships helper scripts next to this file, in `scripts/`. **Call the scripts** —
don't hand-roll `curl`/CLI commands. Paths below are relative to this skill's directory;
use the absolute path if you invoke them from elsewhere.

## When to use

- "publish this", "give me a link", "share it", "I want to see it in the browser"
- After generating a dashboard, report, landing page, chart (Chart.js/D3/Plotly), slide, mockup
- When an HTML result is better viewed rendered than as code

Don't use it for files that are part of the project's codebase — only for artifacts
that are worth a temporary link.

## Setup (one time)

Point the scripts at the Share instance you want to publish to:

```bash
export SHARE_API_URL=https://your-instance
```

The reference instance is `https://share.fellipe.dev`. If unset, the scripts fall back to
`~/.share/config.json` (written by `share config --api=`) and then `http://localhost:8787`.

## Publish

`scripts/publish.sh` takes a file (or `-` for stdin) and prints the live URL:

```bash
scripts/publish.sh report.html                          # publish a file
cat page.html | scripts/publish.sh -                    # publish from stdin
scripts/publish.sh dash.html --slug sales-q3            # custom slug (a-z, 0-9, hyphen; 3-40)
scripts/publish.sh secret.html --password strong-secret # password-protected view
scripts/publish.sh dash.html --json                     # full JSON (url, id, token)
```

Return the printed `url` to the user — it's the deliverable.

## Delete (optional)

```bash
scripts/delete.sh <id> <token>    # id + token come from `publish.sh --json`
```

## Important rules

1. **Always return the link** (`url`) to the user after publishing — it's the deliverable.
2. The HTML must be **self-contained**: inline CSS and JS, images as data URIs. Inline
   scripts are preserved (SPA, Chart.js, D3, Plotly all work).
3. **2 MB** limit per artifact.
4. Every artifact **expires in 15 days** — warn the user if it needs to last longer.
5. For sensitive content, use `--password`. Without a password, anyone with the link can see it.
6. If a `--slug` already exists, publishing fails with "slug already taken" — pick another.

## Full flow example

```bash
# 1. Generate the artifact (you write the HTML to a file), e.g. /tmp/dashboard.html
# 2. Publish it:
scripts/publish.sh /tmp/dashboard.html --slug client-dashboard
# → prints: https://share.fellipe.dev/d/client-dashboard
# 3. Return that link to the user (mention it expires in 15 days).
```
