#!/usr/bin/env bun
// share — publique artefatos HTML e receba um link ao vivo.
import { publish, getMeta, remove } from "../src/api";
import {
  loadConfig,
  saveConfig,
  resolveApiUrl,
  rememberDoc,
  forgetDoc,
  DEFAULT_API_URL,
} from "../src/config";
import { c, ok, warn, die, info, openInBrowser, humanDuration } from "../src/ui";

const VERSION = "0.1.0";

interface Parsed {
  _: string[];
  flags: Record<string, string | boolean>;
}

function parse(argv: string[]): Parsed {
  const _: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const name = a.slice(2);
        const next = argv[i + 1];
        // flags booleanas conhecidas não consomem o próximo argumento
        if (["open", "json", "help", "version"].includes(name) || next == null || next.startsWith("--")) {
          flags[name] = true;
        } else {
          flags[name] = next;
          i++;
        }
      }
    } else {
      _.push(a);
    }
  }
  return { _, flags };
}

const str = (v: string | boolean | undefined): string | undefined => (typeof v === "string" ? v : undefined);

async function main() {
  const { _, flags } = parse(process.argv.slice(2));
  const cmd = _[0];

  if (flags.version || cmd === "version") return console.log(VERSION);
  if (flags.help || cmd === "help" || cmd == null) return usage();

  switch (cmd) {
    case "publish":
    case "share":
      return cmdPublish(_.slice(1), flags);
    case "list":
    case "ls":
      return cmdList();
    case "delete":
    case "rm":
      return cmdDelete(_[1], flags);
    case "info":
      return cmdInfo(_[1], flags);
    case "open":
      return cmdOpen(_[1]);
    case "config":
      return cmdConfig(flags);
    default:
      die(`Comando desconhecido: ${cmd}\nRode "share help".`);
  }
}

async function cmdPublish(args: string[], flags: Parsed["flags"]) {
  const apiUrl = resolveApiUrl(str(flags.api));
  const file = args[0];

  let html: string;
  if (file && file !== "-") {
    const f = Bun.file(file);
    if (!(await f.exists())) die(`Arquivo não encontrado: ${file}`);
    html = await f.text();
  } else {
    if (process.stdin.isTTY) die("Passe um arquivo .html ou envie HTML via stdin.\nEx.: share publish pagina.html");
    html = await Bun.stdin.text();
  }
  if (!html.trim()) die("O HTML está vazio.");

  const password = str(flags.password);
  const slug = str(flags.slug);

  info(c.dim(`Publicando em ${apiUrl} ...`));
  let result;
  try {
    result = await publish(apiUrl, html, { slug, password, agentName: str(flags.agent) });
  } catch (e) {
    die((e as Error).message);
  }

  rememberDoc(result.id, {
    url: result.url,
    token: result.token,
    protected: result.protected,
    createdAt: new Date().toISOString(),
    expiresAt: result.expiresAt,
    slug,
  });

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    ok(`Publicado! Expira em ${humanDuration(result.expiresAt)}.`);
    console.log("\n  " + c.bold(c.cyan(result.url)) + "\n");
    if (result.protected) info(c.dim("  🔒 protegido por senha"));
    info(c.dim(`  id: ${result.id}   ·   token guardado em ~/.share/config.json`));
  }

  if (flags.open) await openInBrowser(result.url);
}

async function cmdList() {
  const cfg = loadConfig();
  const ids = Object.keys(cfg.docs);
  if (ids.length === 0) return info(c.dim("Nenhum documento publicado ainda."));

  info(c.bold("Seus documentos:\n"));
  for (const id of ids) {
    const d = cfg.docs[id];
    const left = humanDuration(d.expiresAt);
    const lock = d.protected ? c.yellow(" 🔒") : "";
    const status = left === "expirado" ? c.dim("(expirado)") : c.dim(`expira em ${left}`);
    console.log(`  ${c.cyan(d.url)}${lock}  ${status}`);
  }
}

async function cmdDelete(id: string | undefined, flags: Parsed["flags"]) {
  if (!id) die("Uso: share delete <id>");
  const apiUrl = resolveApiUrl(str(flags.api));
  const cfg = loadConfig();
  const token = str(flags.token) || cfg.docs[id]?.token;
  if (!token) die(`Sem token para "${id}". Passe --token=<token>.`);

  try {
    await remove(apiUrl, id, token);
  } catch (e) {
    die((e as Error).message);
  }
  forgetDoc(id);
  ok(`Documento "${id}" deletado.`);
}

async function cmdInfo(id: string | undefined, flags: Parsed["flags"]) {
  if (!id) die("Uso: share info <id>");
  const apiUrl = resolveApiUrl(str(flags.api));
  const cfg = loadConfig();
  const token = str(flags.token) || cfg.docs[id]?.token;
  if (!token) die(`Sem token para "${id}". Passe --token=<token>.`);

  let meta;
  try {
    meta = await getMeta(apiUrl, id, token);
  } catch (e) {
    die((e as Error).message);
  }
  console.log(JSON.stringify(meta, null, 2));
}

async function cmdOpen(idOrUrl: string | undefined) {
  if (!idOrUrl) die("Uso: share open <id|url>");
  const cfg = loadConfig();
  const url = idOrUrl.startsWith("http") ? idOrUrl : cfg.docs[idOrUrl]?.url || `${resolveApiUrl()}/d/${idOrUrl}`;
  await openInBrowser(url);
  ok(`Abrindo ${url}`);
}

async function cmdConfig(flags: Parsed["flags"]) {
  const cfg = loadConfig();
  const newApi = str(flags.api);
  if (newApi) {
    cfg.apiUrl = newApi.replace(/\/$/, "");
    saveConfig(cfg);
    ok(`API url definida: ${cfg.apiUrl}`);
    return;
  }
  console.log(JSON.stringify({ apiUrl: cfg.apiUrl, docs: Object.keys(cfg.docs).length }, null, 2));
  info(c.dim(`\nAltere com: share config --api=${DEFAULT_API_URL}`));
}

function usage() {
  console.log(`${c.bold("share")} ${c.dim("v" + VERSION)} — compartilhe artefatos HTML na hora.

${c.bold("USO")}
  share publish <arquivo.html> [opções]
  cat pagina.html | share publish -

${c.bold("COMANDOS")}
  publish <arquivo>   Publica um HTML e devolve o link ao vivo
  list                Lista os documentos que você publicou
  info <id>           Mostra metadados de um documento
  open <id|url>       Abre o documento no navegador
  delete <id>         Deleta um documento (usa o token guardado)
  config [--api=url]  Mostra ou define a API url

${c.bold("OPÇÕES de publish")}
  --slug=<slug>       Slug customizado (a-z, 0-9, hífen; 3-40 chars)
  --password=<senha>  Protege a visualização com senha
  --open              Abre no navegador após publicar
  --json              Saída em JSON
  --agent=<nome>      Rótulo do agente (default: share-cli)
  --api=<url>         Sobrescreve a API url

${c.bold("EXEMPLOS")}
  share publish relatorio.html --open
  share publish dash.html --slug=vendas-q3 --password=segredo
  echo '<h1>oi</h1>' | share publish -

${c.dim("Artefatos expiram automaticamente em 15 dias.")}`);
}

main().catch((e) => die((e as Error).message));
