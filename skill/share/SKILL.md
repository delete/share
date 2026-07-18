---
name: share
description: Publishes HTML artifacts and returns a live shareable link (reference instance share.fellipe.dev). Use whenever you generate an HTML artifact — report, dashboard, mockup, chart, slide — and want a browser-viewable link, optionally protected with a password and a custom slug. Also lists, inspects, and deletes what you've published. Links expire in 15 days.
---

# Share — publish & manage HTML artifacts

Whenever you produce a self-contained HTML artifact (a single file, with inline CSS/JS)
and the user wants to **see it in the browser** or **send someone a link**, publish it with
the `share` CLI and return the link. Use the same CLI to **manage** what you publish —
list, inspect, and delete (it keeps a local record of your docs and their tokens, so you
don't juggle tokens by hand).

## When to use

- "publish this", "give me a link", "share it", "I want to see it in the browser"
- After generating a dashboard, report, landing page, chart (Chart.js/D3/Plotly), slide, mockup
- To manage what you've shared: "list my links", "delete that one", "is it still up?"

Don't use it for files that are part of the project's codebase — only for artifacts worth a
temporary link.

## Setup (once)

The CLI is `share` (Bun). If it isn't on your PATH, run `bun link` inside `share/cli`, or call
it directly as `bun /path/to/share/cli/bin/share.ts <command>`.

Point it at the instance to publish to (persists in `~/.share/config.json`):

```bash
share config --api=https://your-instance   # or: export SHARE_API_URL=https://your-instance
```

The public reference instance is `https://share.fellipe.dev`.

## Publish

```bash
share publish report.html                        # publish a file → prints the live link
cat page.html | share publish -                  # publish from stdin
share publish dash.html --slug sales-q3          # custom slug (a-z, 0-9, hyphen; 3-40 chars)
share publish secret.html --password strong-secret  # password-protected view
share publish dash.html --json                   # JSON output (url, id, token)
```

Return the printed `url` to the user — it's the deliverable.

## Manage

```bash
share list           # everything you've published + time left before it expires
share info <id>      # metadata (size, created, expiry)
share open <id|url>  # open it in the browser
share delete <id>    # delete before expiry (uses the token it stored at publish time)
```

`list`/`delete` work because the CLI records each doc's id + token in `~/.share/config.json`
when you publish — the API has no accounts, so this local record is what makes management
possible. Publish through the CLI (not raw HTTP) so those docs stay manageable.

## Rules

1. **Always return the link** (`url`) to the user after publishing — it's the deliverable.
2. The HTML must be **self-contained**: inline CSS/JS, images as data URIs. Inline scripts
   are preserved (SPA, Chart.js, D3, Plotly all work).
3. **2 MB** limit per artifact.
4. Every artifact **expires in 15 days** — warn the user if it needs to last longer.
5. For sensitive content use `--password`. Without one, anyone with the link can view it.
6. If a `--slug` already exists, publishing fails with "slug already taken" — pick another.
