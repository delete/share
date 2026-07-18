# Installation guide for AI agents

Runbook for an AI agent (Claude Code, etc.) to provision its own instance of
**Share** on Cloudflare, end to end. Written imperatively: follow it in order,
verify each step before moving on. Placeholders in `UPPERCASE`.

> Target audience: an agent with shell access (`bash`), `bun`, `wrangler` and (optionally)
> the Cloudflare dashboard via browser automation when the API lacks permission.

---

## 0. Project context

- **Stack**: TypeScript/Bun CLI (`cli/`) + Cloudflare Worker (`worker/`) with **KV**.
- **Storage**: KV with native TTL handles artifact expiration (`EXPIRY_DAYS`).
- **No database, no frontend build.** Deploy = `bunx wrangler deploy`.
- Deploy-specific config lives in `worker/wrangler.jsonc` (gitignored; copy it from
  `worker/wrangler.jsonc.example`). Secrets via `wrangler secret` (never in a file).

## 1. Prerequisites — check before anything else

```bash
bun --version                # must exist
bunx wrangler --version      # wrangler is a project dep (see step 2); run it via `bunx`
bunx wrangler whoami         # must be authenticated; note the Account ID
```

- `wrangler` is **not global** — it's installed by `bun install` (step 2) into the repo.
  Invoke it as **`bunx wrangler`** (used throughout this guide), or add it to your PATH
  with `bun add -g wrangler`.
- If `wrangler whoami` is not logged in: ask the user to run `bunx wrangler login`
  (it's interactive, opens the browser — the agent can't do it on its own).
- Note the **Account ID** returned; several commands need it.

## 2. Install dependencies and validate locally

```bash
bun install
cd worker
cp wrangler.jsonc.example wrangler.jsonc
cp .dev.vars.example .dev.vars
cd ..
# bring up the Worker locally (KV simulated by Miniflare) and test:
bun run dev &                       # http://localhost:8787
sleep 10                            # first run compiles — wait for it to be ready
bun run scripts/e2e.ts http://localhost:8787   # expect: 28/28
pkill -f "wrangler dev"
```

If all 28 checks pass, the code is healthy. Proceed to the deploy.

## 3. Create the KV namespace

```bash
cd worker
bunx wrangler kv namespace create DOCS
```

- Copy the returned `id` and paste it into `worker/wrangler.jsonc` → `kv_namespaces[0].id`
  (replace `YOUR_KV_NAMESPACE_ID`).

## 4. Set the session secret

```bash
echo "$(openssl rand -hex 32)" | bunx wrangler secret put SESSION_SECRET
```

- This creates the Worker (if it doesn't exist) and injects the secret. Never write this value
  into any file in the repo. (Run this from `worker/` — you're already there from step 3.)

## 5. Adjust variables and deploy

In `worker/wrangler.jsonc`, set:

- `name`: the Worker name (e.g. `share`).
- `vars.EXPIRY_DAYS` (default 15) and `vars.MAX_UPLOAD_MB` (default 2), if you want to change them.
- `vars.PUBLIC_BASE_URL` is **optional** — leave it unset and links are derived from the
  request host, so the free `workers.dev` URL just works. Set it only to pin a canonical URL.

```bash
bunx wrangler deploy     # from worker/
```

- The output prints your free `workers.dev` URL (e.g. `share.YOUR-SUBDOMAIN.workers.dev`).
  **No custom domain is required** — this URL is fully functional on its own.

## 6. Verify, then wire up the CLI

Back to the repo root (steps 3–5 left you in `worker/`):

```bash
cd ..

BASE=https://YOUR-URL
curl -s $BASE/health           # {"ok":true,"service":"..."}
bun run scripts/e2e.ts $BASE   # expect: 28/28
```

Make the `share` CLI available **before** `share config` (that command IS the CLI), then
point it at your instance and install the skill so agents can publish and manage
(list/delete/info) in future sessions:

```bash
(cd cli && bun link)                    # puts the `share` binary on ~/.bun/bin
share config --api=$BASE                # or: export SHARE_API_URL=$BASE

# install the skill for your agent(s):
mkdir -p ~/.claude/skills && cp -r skill/share ~/.claude/skills/share      # Claude Code
mkdir -p ~/.codex/skills  && cp -r skill/share ~/.codex/skills/share       # Codex
mkdir -p ~/.pi/agent && cat skill/share/SKILL.md >> ~/.pi/agent/AGENTS.md  # pi
```

`bun link` needs bun's global bin (`~/.bun/bin`) on your PATH for the bare `share` command to
resolve — otherwise call it as `bun cli/bin/share.ts`. `share config` persists the API url in
`~/.share/config.json`, which is what makes `share list`/`delete` work.

**If you only want workers.dev, stop here — it's live.** The sections below are for a
custom domain (fully optional).

---

## 7. (Optional) Custom domain

Goal: serve at `share.YOUR-DOMAIN.com`. The domain's zone **must be in your
Cloudflare account**.

> The steps below use raw Cloudflare API calls. Authenticate them with a Cloudflare API
> token — portable across operating systems (no scraping of wrangler's config file, whose
> path differs per OS). Create one at **dash → My Profile → API Tokens** (Zone:Read +
> DNS:Edit for your zone), then export it once:
>
> ```bash
> export CLOUDFLARE_API_TOKEN=YOUR_CLOUDFLARE_API_TOKEN   # wrangler also reads this var
> ```

### 7a. Is the zone already on Cloudflare?

```bash
curl -s "https://api.cloudflare.com/client/v4/zones?name=YOUR-DOMAIN.com" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

- If it returns a zone with `"status":"active"`, skip to **7d**.
- If it doesn't exist, go to **7b**.

### 7b. Add the zone (create a site)

> ⚠️ The wrangler OAuth token usually **does NOT have permission to create a zone**
> (`com.cloudflare.api.account.zone.create`). In that case, creating via the API fails with
> "Authentication error" / "Requires permission". Do it through the **dashboard**:

1. Cloudflare dashboard → **Add a site** → type `YOUR-DOMAIN.com` → **Free** plan.
2. Cloudflare scans the DNS and gives you **2 nameservers** (e.g. `xxx.ns.cloudflare.com`).
   Note both of them.

(An agent with browser automation — e.g. the `playwriter` skill — can do this
flow in the dashboard: `Add a site` → type the domain → select Free → confirm →
copy the nameservers on the "nameserver-directions" screen.)

### 7c. Change the nameservers at the registrar

At the domain's registrar (GoDaddy, Namecheap, etc.), change the nameservers to the **2
from Cloudflare**. E.g. GoDaddy: DNS → Nameservers → "I'll use my own" → paste both → save.

> This also **disables** any forwarding/redirect at the registrar — DNS is now
> served by Cloudflare.

Wait for the zone to become `active` (seconds to ~1h). Poll:

```bash
ZONE=YOUR_ZONE_ID
for i in $(seq 1 120); do
  # force a re-check when the NS propagate
  curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$ZONE/activation_check" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -o /dev/null
  S=$(curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | grep -o '"status":"[a-z]*"' | head -1)
  echo "[$i] $S"; echo "$S" | grep -q active && break; sleep 60
done
```

### 7d. (Optional) Clean up inherited redirect records

If the apex had forwarding (`A` records pointing to registrar IPs), they may have been
imported. To stop the redirect, **delete only those `A` records**, preserving important
records (e.g. `TXT _atproto` for a Bluesky handle, `MX`, verifications).

> Deleting DNS via the API also requires a permission the OAuth token may not have
> (same "Authentication error"). In that case, do it through the dashboard: DNS → Records →
> select the forwarding `A` records → Delete.

### 7e. Attach the custom domain to the Worker

In `worker/wrangler.jsonc`, uncomment/edit:

```jsonc
"routes": [
  { "pattern": "share.YOUR-DOMAIN.com", "custom_domain": true }
],
```

And set `vars.PUBLIC_BASE_URL` to `https://share.YOUR-DOMAIN.com`. Then:

```bash
bunx wrangler deploy     # from worker/
```

- Cloudflare creates the subdomain's DNS record and **issues the TLS certificate**
  automatically (takes from seconds to a few minutes).

### 7f. Verify the custom domain

```bash
BASE=https://share.YOUR-DOMAIN.com
curl -s -o /dev/null -w "%{http_code}\n" $BASE/health   # expect 200 (after TLS)
bun run scripts/e2e.ts $BASE                            # expect 28/28
```

- If **local DNS** doesn't resolve (stale cache), test at the edge without relying on the resolver:
  ```bash
  EDGE=$(dig +short A share.YOUR-DOMAIN.com @1.1.1.1 | head -1)
  curl -s --resolve share.YOUR-DOMAIN.com:443:$EDGE https://share.YOUR-DOMAIN.com/health
  ```

---

## 8. Known pitfalls (learned in practice)

- **Token permissions**: the wrangler OAuth usually has workers/kv/routes, but **not**
  `zone.create` or `dns_records.edit`. Creating a zone and editing DNS → **dashboard** (or browser
  automation). Reading zone/DNS via the API works.
- **KV is eventually consistent**: a read a few seconds after the write, from a different
  PoP, can return 404 for up to ~60s. In normal use (publish → open later) it's consistent.
  Don't treat this as a bug in a test that reads immediately after publishing.
- **DNS cache (machine/router)**: it may hold onto the old NS delegation and return NXDOMAIN
  even with the zone active. Work around it by pointing the resolver at `1.1.1.1`, or testing via
  `curl --resolve` against the edge IP (see 7f). Don't confuse this with "the domain is down".
- **zsh vs bash**: in scripts with `--resolve`, zsh does **not** word-split an unquoted
  `$VAR`. Run these scripts with `bash`, or use explicit arrays/args.
- **Worker name**: renaming the Worker creates a new one and orphans the old one; the custom domain
  stays tied to the old one. To migrate: delete the old Worker (`bunx wrangler delete --name OLD`)
  and `bunx wrangler deploy` the new one (KV is independent and the data persists).

## 9. Final checklist

- [ ] `bunx wrangler whoami` authenticated
- [ ] KV `DOCS` created and `id` in `wrangler.jsonc`
- [ ] `SESSION_SECRET` set via `bunx wrangler secret put`
- [ ] `bunx wrangler deploy` with no errors (free workers.dev URL is enough)
- [ ] `curl /health` = 200 and `scripts/e2e.ts` = 28/28 on the final URL
- [ ] CLI pointed at the instance (`share config --api=...`)
- [ ] Agent instructions installed (Claude Code / Codex skill, or pi `AGENTS.md`)
- [ ] (optional) `PUBLIC_BASE_URL` set to pin a canonical URL
- [ ] (optional) custom domain active with TLS and e2e 28/28
