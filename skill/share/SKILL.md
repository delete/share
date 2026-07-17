---
name: share
description: Publica artefatos HTML e devolve um link ao vivo (share.fellipe.dev). Use sempre que gerar um artefato HTML — relatório, dashboard, mockup, gráfico, slide — e quiser compartilhar um link visualizável no navegador, opcionalmente protegido por senha e com slug customizado. Os links expiram em 15 dias.
---

# Share — compartilhar artefatos HTML

Sempre que você produzir um artefato HTML autossuficiente (um único arquivo, com CSS/JS
inline) e o usuário quiser **ver o resultado no navegador** ou **mandar um link pra alguém**,
publique-o com o CLI `share` e devolva o link.

## Quando usar

- "publica isso", "me dá um link", "compartilha", "quero ver no navegador"
- Depois de gerar dashboard, relatório, landing page, gráfico (Chart.js/D3/Plotly), slide, mockup
- Quando um resultado HTML fica melhor visto renderizado do que como código

Não use para arquivos que fazem parte do código do projeto — apenas para artefatos
que valem um link temporário.

## Setup (uma vez)

O CLI roda com Bun. Se `share` não estiver no PATH, chame direto:

```bash
bun /caminho/para/share/cli/bin/share.ts <comando>
```

Ou instale global uma vez:

```bash
bun link            # dentro de share/cli, expõe o binário `share`
```

A API padrão é `https://share.fellipe.dev` (já embutida). Para apontar para outra:
`share config --api=https://sua-url` ou `export SHARE_API_URL=...`.

## Uso

**Publicar um arquivo e mostrar o link:**

```bash
share publish relatorio.html
```

**Publicar direto de stdin** (útil quando você acabou de gerar o HTML):

```bash
cat > /tmp/artefato.html <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><title>Vendas</title></head>
<body><h1>Vendas Q3</h1><!-- ... --></body></html>
HTML
share publish /tmp/artefato.html
```

**Slug customizado** (URL amigável, precisa ser único, 3-40 chars a-z/0-9/hífen):

```bash
share publish dash.html --slug=vendas-q3
# → https://share.fellipe.dev/d/vendas-q3
```

**Proteger com senha** (a página pede a senha antes de mostrar o conteúdo):

```bash
share publish confidencial.html --slug=diretoria --password=segredo-forte
```

**Saída em JSON** (para capturar `url`/`id`/`token` programaticamente):

```bash
share publish dash.html --json
```

## Gerenciar

```bash
share list              # lista o que você publicou e quanto falta pra expirar
share info <id>         # metadados (tamanho, criação, expiração)
share open <id|url>     # abre no navegador
share delete <id>       # remove antes da expiração (usa o token guardado)
```

Os tokens de gerenciamento ficam em `~/.share/config.json` — não precisa guardá-los.

## Regras importantes

1. **Sempre devolva o link** (`url`) ao usuário depois de publicar — é o entregável.
2. O HTML deve ser **autossuficiente**: CSS e JS inline, imagens como data URI. Scripts
   inline são preservados (SPA, Chart.js, D3, Plotly funcionam).
3. Limite de **2 MB** por artefato.
4. Todo artefato **expira em 15 dias** — avise se for algo que precisa durar.
5. Para conteúdo sensível, use `--password`. Sem senha, qualquer um com o link vê.
6. Se um `--slug` já existir, o comando falha com "slug já em uso" — escolha outro.

## Exemplo de fluxo completo

```bash
# 1. Gere o artefato (você escreve o HTML)
#    ... cria /tmp/dashboard.html ...

# 2. Publique
share publish /tmp/dashboard.html --slug=dashboard-cliente --json

# 3. Devolva o link ao usuário:
#    "Pronto! Seu dashboard está em https://share.fellipe.dev/d/dashboard-cliente
#     (expira em 15 dias)."
```
