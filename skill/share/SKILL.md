---
name: share
description: Publishes HTML artifacts and returns a live shareable link (reference instance share.fellipe.dev). Use whenever you generate an HTML artifact — report, dashboard, mockup, chart, slide — and want a browser-viewable link, optionally protected with a password and a custom slug. Links expire in 15 days.
---

# Share — share HTML artifacts

Whenever you produce a self-contained HTML artifact (a single file, with inline CSS/JS)
and the user wants to **see the result in the browser** or **send someone a link**,
publish it with the `share` CLI and return the link.

## When to use

- "publish this", "give me a link", "share it", "I want to see it in the browser"
- After generating a dashboard, report, landing page, chart (Chart.js/D3/Plotly), slide, mockup
- When an HTML result is better viewed rendered than as code

Don't use it for files that are part of the project's codebase — only for artifacts
that are worth a temporary link.

## Setup (one time)

The CLI runs on Bun. If `share` isn't on your PATH, call it directly:

```bash
bun /path/to/share/cli/bin/share.ts <command>
```

Or install it globally once:

```bash
bun link            # inside share/cli, exposes the `share` binary
```

Point the CLI at your instance once: `share config --api=https://your-instance` (or
`export SHARE_API_URL=https://your-instance`). The public reference instance is
`https://share.fellipe.dev`.

## Usage

**Publish a file and show the link:**

```bash
share publish report.html
```

**Publish straight from stdin** (handy right after you generate the HTML):

```bash
cat > /tmp/artifact.html <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><title>Sales</title></head>
<body><h1>Q3 Sales</h1><!-- ... --></body></html>
HTML
share publish /tmp/artifact.html
```

**Custom slug** (friendly URL, must be unique, 3-40 chars a-z/0-9/hyphen):

```bash
share publish dash.html --slug=sales-q3
# → https://share.fellipe.dev/d/sales-q3
```

**Protect with a password** (the page asks for the password before showing the content):

```bash
share publish confidential.html --slug=board --password=strong-secret
```

**JSON output** (to capture `url`/`id`/`token` programmatically):

```bash
share publish dash.html --json
```

## Manage

```bash
share list              # lists what you've published and how long until it expires
share info <id>         # metadata (size, creation, expiration)
share open <id|url>     # opens in the browser
share delete <id>       # removes it before expiration (uses the stored token)
```

Management tokens are kept in `~/.share/config.json` — you don't need to hold onto them.

## Important rules

1. **Always return the link** (`url`) to the user after publishing — it's the deliverable.
2. The HTML must be **self-contained**: inline CSS and JS, images as data URIs. Inline
   scripts are preserved (SPA, Chart.js, D3, Plotly all work).
3. **2 MB** limit per artifact.
4. Every artifact **expires in 15 days** — warn the user if it needs to last longer.
5. For sensitive content, use `--password`. Without a password, anyone with the link can see it.
6. If a `--slug` already exists, the command fails with "slug already in use" — pick another.

## Full flow example

```bash
# 1. Generate the artifact (you write the HTML)
#    ... creates /tmp/dashboard.html ...

# 2. Publish it
share publish /tmp/dashboard.html --slug=client-dashboard --json

# 3. Return the link to the user:
#    "Done! Your dashboard is at https://share.fellipe.dev/d/client-dashboard
#     (expires in 15 days)."
```
