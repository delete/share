# Share

Compartilhamento instantâneo de artefatos HTML com integração para agentes de IA
(Claude Code em primeiro lugar). Publique um arquivo HTML e receba um **link ao vivo**
em segundos — opcionalmente protegido por senha e com slug customizado. Tudo expira
automaticamente em **15 dias**.

Stack mínima: **CLI em TypeScript/Bun** + **Cloudflare Workers** com **KV** (o TTL nativo
do KV cobre a expiração).

- 🌐 Ao vivo: **https://share.fellipe.dev** (fallback: `https://share.pinheiro-llip.workers.dev`)
- 🎬 Demo: **https://share.fellipe.dev/d/demo**

## Funcionalidades

| Recurso | Como |
| --- | --- |
| Compartilhar artefato HTML | `share publish arquivo.html` → link ao vivo |
| Visualização por link, sem conta | `GET /d/:id` serve o HTML |
| Visualização com senha, sem conta | `--password=...` → gate PBKDF2 + cookie assinado (HMAC) |
| Slug customizado | `--slug=meu-slug` |
| Expiração de 15 dias | TTL nativo do Cloudflare KV |
| Integração com Claude Code | skill em [`skill/share/SKILL.md`](skill/share/SKILL.md) |
| Gerenciar (deletar/inspecionar) | token por documento, guardado em `~/.share` |

## Estrutura

```
share/
├── worker/           # Cloudflare Worker (API + serving)
│   ├── src/index.ts  # roteador + handlers
│   ├── src/crypto.ts # PBKDF2 (senha), HMAC (cookie), ids
│   ├── src/views.ts  # landing, gate de senha, erros
│   └── wrangler.jsonc
├── cli/              # CLI `share` (Bun)
│   ├── bin/share.ts
│   └── src/{api,config,ui}.ts
├── skill/share/  # skill do Claude Code
└── scripts/e2e.ts    # teste end-to-end (28 checks)
```

## CLI

```bash
# instalar o binário `share` global (uma vez)
cd cli && bun link

share publish relatorio.html                       # publica e mostra o link
share publish dash.html --slug=vendas-q3 --open     # slug + abre no browser
share publish sigilo.html --password=segredo        # protegido por senha
cat pagina.html | share publish -                   # via stdin
share list                                          # seus documentos + expiração
share info <id>                                     # metadados
share delete <id>                                   # remove antes de expirar
share config --api=https://sua-url                  # troca a API url
```

Sem `bun link`, chame direto: `bun cli/bin/share.ts <comando>`.

## API

| Método | Rota | Descrição |
| --- | --- | --- |
| `POST` | `/api/v1/docs` | Publica. Body = HTML (`Content-Type: text/html`) ou JSON `{html,slug?,password?}`. Headers: `x-slug`, `x-password`, `x-agent-name`. |
| `GET` | `/d/:id` | Visualiza (serve o HTML, ou o gate de senha). |
| `POST` | `/d/:id/unlock` | Envia a senha (form) e recebe cookie de desbloqueio. |
| `GET` | `/api/v1/docs/:id` | Metadados (requer `Authorization: Bearer <token>`). |
| `DELETE` | `/api/v1/docs/:id` | Deleta (requer token). |

Limite de 2 MB por artefato. CORS liberado nos endpoints `/api`.

```bash
curl -X POST https://share.fellipe.dev/api/v1/docs \
  -H 'content-type: text/html' -H 'x-slug: meu-report' \
  --data-binary @report.html
```

## Desenvolvimento

```bash
bun install
bun run dev            # wrangler dev local (KV simulado), http://localhost:8787
bun run test:e2e       # e2e contra localhost:8787
# e2e contra produção:
bun run scripts/e2e.ts https://share.fellipe.dev
```

## Deploy (Cloudflare)

```bash
cd worker
wrangler kv namespace create DOCS          # já feito; id em wrangler.jsonc
echo "$(openssl rand -hex 32)" | wrangler secret put SESSION_SECRET
wrangler deploy
```

Config em `worker/wrangler.jsonc`. `worker/.dev.vars` sobrescreve vars só no dev local.

## Domínio `share.fellipe.dev` (ativo ✅)

O domínio já está configurado e servindo. O que foi feito:

1. **Zona `fellipe.dev` criada na Cloudflare** (plano Free) e ativada — nameservers
   `michelle.ns.cloudflare.com` / `nero.ns.cloudflare.com`.
2. **Nameservers trocados na GoDaddy** (de `ns09/ns10.domaincontrol.com` para os da
   Cloudflare). Isso desativou o forwarding `fellipe.dev → fellipe.me`.
3. **Redirect removido**: os 2 registros `A` de forwarding da GoDaddy foram deletados
   da zona. O TXT `_atproto` (handle do Bluesky) foi **preservado**.
4. **Custom domain no Worker**: `routes` com `custom_domain: true` em `wrangler.jsonc`
   + `wrangler deploy`. A Cloudflare criou o registro de `share.fellipe.dev` e emitiu o
   certificado TLS automaticamente.

O `workers.dev` segue ativo como fallback. Para redeploy: `cd worker && wrangler deploy`.

> Observação: o apex `fellipe.dev` (sem `share.`) deixou de redirecionar e ficou sem
> registro — aponte-o para onde quiser quando decidir.

## Notas de segurança

- Senhas: PBKDF2-SHA256 (100k iterações, salt aleatório). Nunca armazenadas em claro.
- Desbloqueio: cookie `HttpOnly`, `Secure` (em HTTPS), `SameSite=Lax`, com escopo de path
  no próprio documento, assinado por HMAC-SHA256 com `SESSION_SECRET`.
- Artefatos são HTML arbitrário com scripts inline — isolados por `no-store` e sem cookies
  de API acessíveis via JS. Para produção séria, sirva os artefatos num domínio separado.

## Nota sobre consistência (Cloudflare KV)

O KV é **eventualmente consistente**: uma leitura feita poucos segundos após a escrita,
a partir de um PoP diferente do que gravou, pode devolver 404 por até ~60s. Na prática
(publicar e abrir o link segundos depois, na mesma região) a leitura é consistente. É o
tradeoff aceito pela stack mais simples + TTL nativo para a expiração de 15 dias. Se algum
dia precisar de leitura forte imediata, troque o storage por Durable Objects ou D1.
