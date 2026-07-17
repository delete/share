# Share

Instant HTML artifact sharing with integration for AI agents
(Claude Code first). Publish an HTML file and get a **live link**
in seconds — optionally password-protected and with a custom slug. Everything expires
automatically after **15 days**.

Minimal stack: **TypeScript/Bun CLI** + **Cloudflare Workers** with **KV** (KV's native TTL
handles expiration).

**Open source (MIT)** — run **your own** instance in minutes: see [Deploy your own](#deploy-your-own).

- 🌐 Reference instance: **https://share.fellipe.dev** · 🎬 Demo: **https://share.fellipe.dev/d/demo**

## Features

| Feature | How |
| --- | --- |
| Share an HTML artifact | `share publish file.html` → live link |
| View by link, no account | `GET /d/:id` serves the HTML |
| Password-protected view, no account | `--password=...` → PBKDF2 gate + signed cookie (HMAC) |
| Custom slug | `--slug=my-slug` |
| 15-day expiration | Cloudflare KV native TTL |
| Claude Code integration | skill at [`skill/share/SKILL.md`](skill/share/SKILL.md) |
| Manage (delete/inspect) | per-document token, stored in `~/.share` |

## Structure

```
share/
├── worker/           # Cloudflare Worker (API + serving)
│   ├── src/index.ts  # router + handlers
│   ├── src/crypto.ts # PBKDF2 (password), HMAC (cookie), ids
│   ├── src/views.ts  # landing, password gate, errors
│   └── wrangler.jsonc.example  # copy to wrangler.jsonc and fill in
├── cli/              # `share` CLI (Bun)
│   ├── bin/share.ts
│   └── src/{api,config,ui}.ts
├── skill/share/      # Claude Code skill
├── scripts/e2e.ts    # end-to-end test (28 checks)
├── AGENT_INSTALL_GUIDE.md  # runbook for an AI agent to provision everything
└── LICENSE           # MIT
```

## CLI

```bash
# install the global `share` binary (once)
cd cli && bun link

share publish report.html                        # publishes and shows the link
share publish dash.html --slug=sales-q3 --open   # slug + opens in the browser
share publish secret.html --password=my-secret   # password-protected
cat page.html | share publish -                  # via stdin
share list                                       # your documents + expiration
share info <id>                                  # metadata
share delete <id>                                # remove before expiration
share config --api=https://your-url              # change the API url
```

Without `bun link`, call it directly: `bun cli/bin/share.ts <command>`.

## Install the Claude Code skill

The skill teaches Claude Code (and compatible agents) to publish artifacts with the `share`
CLI and hand back the link. Install it globally:

```bash
mkdir -p ~/.claude/skills/share
cp skill/share/SKILL.md ~/.claude/skills/share/SKILL.md
```

Then point the CLI at your instance once (`share config --api=https://your-instance`); the
agent picks up the skill on the next Claude Code start.

## API

| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/api/v1/docs` | Publish. Body = HTML (`Content-Type: text/html`) or JSON `{html,slug?,password?}`. Headers: `x-slug`, `x-password`, `x-agent-name`. |
| `GET` | `/d/:id` | View (serves the HTML, or the password gate). |
| `POST` | `/d/:id/unlock` | Submit the password (form) and receive an unlock cookie. |
| `GET` | `/api/v1/docs/:id` | Metadata (requires `Authorization: Bearer <token>`). |
| `DELETE` | `/api/v1/docs/:id` | Delete (requires token). |

Configurable size limit (default 2 MB, via `MAX_UPLOAD_MB`). CORS enabled on the `/api` endpoints.

```bash
curl -X POST https://share.fellipe.dev/api/v1/docs \
  -H 'content-type: text/html' -H 'x-slug: my-report' \
  --data-binary @report.html
```

## For AI agents

Want an AI agent (Claude Code, etc.) to bring up **your own** instance on its own? Point it
to **[`AGENT_INSTALL_GUIDE.md`](AGENT_INSTALL_GUIDE.md)** — an imperative, step-by-step
runbook with the exact commands to provision everything on Cloudflare (KV, secret, deploy,
custom domain, nameserver migration, redirect removal) and the known pitfalls
(token permissions, KV consistency, DNS cache). The skill at
[`skill/share/`](skill/share/SKILL.md) teaches the agent to **use** the CLI once installed.

## Deploy your own

You need a Cloudflare account (the Free plan covers everything) and
[`wrangler`](https://developers.cloudflare.com/workers/wrangler/) authenticated.
**No custom domain needed** — Cloudflare gives you a free `*.workers.dev` URL out of the box.
Prefer to have an agent do it? See [For AI agents](#for-ai-agents).

```bash
git clone <this-repo> && cd share
bun install

cd worker
cp wrangler.jsonc.example wrangler.jsonc

# 1. Create the KV and paste the id into wrangler.jsonc (kv_namespaces[0].id):
wrangler kv namespace create DOCS

# 2. Set the cookie-signing secret (stays out of the repo):
echo "$(openssl rand -hex 32)" | wrangler secret put SESSION_SECRET

# 3. Deploy — prints your free URL: share.<your-subdomain>.workers.dev
wrangler deploy
```

That's it — the deployed URL works immediately. Point the CLI at it:

```bash
share config --api=https://share.<your-subdomain>.workers.dev
# or: export SHARE_API_URL=https://share.<your-subdomain>.workers.dev
```

Links are built from the request host by default, so the workers.dev URL needs no extra
config. `PUBLIC_BASE_URL` is optional — set it only to pin a canonical URL (e.g. a custom domain).

### Configuration (variables)

| Variable | Where | Default | What |
| --- | --- | --- | --- |
| `PUBLIC_BASE_URL` | worker `vars` | request host | Optional. Pins a canonical public URL for the links |
| `EXPIRY_DAYS` | worker `vars` | `15` | Artifact expiration window |
| `MAX_UPLOAD_MB` | worker `vars` | `2` | Maximum size per artifact (MB) |
| `SESSION_SECRET` | worker **secret** | (dev fallback) | HMAC for the unlock cookies |
| `SHARE_API_URL` | CLI env | `DEFAULT_API_URL` | API url used by the CLI |

Deploy-specific (not env vars — they live in your `wrangler.jsonc`): the worker `name`,
`kv_namespaces[].id`, and the custom domain `routes`.

### Custom domain (optional)

Skip this unless you own a domain and want a branded URL — the free workers.dev URL works
fine on its own. To serve on your own domain, the zone must be in your Cloudflare account
(nameservers pointing to Cloudflare). Then uncomment the `routes` block in
`wrangler.jsonc` with your hostname and run `wrangler deploy` — Cloudflare creates the
record and issues the TLS certificate automatically.

## Development

```bash
bun install
cd worker && cp wrangler.jsonc.example wrangler.jsonc && cp .dev.vars.example .dev.vars && cd ..
bun run dev            # local wrangler dev (simulated KV), http://localhost:8787
bun run test:e2e       # e2e against localhost:8787
# e2e against another instance:
bun run scripts/e2e.ts https://your-instance
```

## Security notes

- Passwords: PBKDF2-SHA256 (100k iterations, random salt). Never stored in plaintext.
- Unlock: `HttpOnly` cookie, `Secure` (over HTTPS), `SameSite=Lax`, scoped to the path
  of the document itself, signed with HMAC-SHA256 using `SESSION_SECRET`.
- Artifacts are arbitrary HTML with inline scripts — isolated via `no-store` and with no API
  cookies accessible via JS. For serious production use, serve artifacts on a separate domain.

## Consistency note (Cloudflare KV)

KV is **eventually consistent**: a read done a few seconds after the write,
from a PoP different from the one that wrote it, may return 404 for up to ~60s. In practice
(publishing and opening the link seconds later, in the same region) the read is consistent. It's the
tradeoff accepted for the simplest stack + native TTL for the 15-day expiration. If you ever
need immediate strong reads, swap the storage for Durable Objects or D1.

## License

[MIT](LICENSE) © Fellipe Pinheiro
