#!/usr/bin/env bun
// share — publish HTML artifacts and get a live link.
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
        // known boolean flags don't consume the next argument
        if (["open", "json", "help", "version", "public", "no-password"].includes(name) || next == null || next.startsWith("--")) {
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

/** Random, readable password (no ambiguous chars). Grouped for easy typing. */
function generatePassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789"; // no l, o, 0, 1
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s.slice(0, 4) + "-" + s.slice(4, 8);
}

async function main() {
  const { _, flags } = parse(process.argv.slice(2));
  const cmd = _[0];

  if (flags.version || cmd === "version") return console.log(VERSION);
  if (flags.help || cmd === "help" || cmd == null) return usage();

  switch (cmd) {
    case "publish":
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
      die(`Unknown command: ${cmd}\nRun "share help".`);
  }
}

async function cmdPublish(args: string[], flags: Parsed["flags"]) {
  const apiUrl = resolveApiUrl(str(flags.api));
  const file = args[0];

  let html: string;
  if (file && file !== "-") {
    const f = Bun.file(file);
    if (!(await f.exists())) die(`File not found: ${file}`);
    html = await f.text();
  } else {
    if (process.stdin.isTTY) die("Pass a .html file or send HTML via stdin.\nEx.: share publish page.html");
    html = await Bun.stdin.text();
  }
  if (!html.trim()) die("The HTML is empty.");

  const slug = str(flags.slug);
  // Protected by a random password by default. `--password X` chooses one;
  // `--public` (or `--no-password`) opts out to a link-only public doc.
  const isPublic = flags.public === true || flags["no-password"] === true;
  let password = str(flags.password);
  if (!isPublic && !password) password = generatePassword();

  info(c.dim(`Publishing to ${apiUrl} ...`));
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
    password,
  });

  if (flags.json) {
    console.log(JSON.stringify({ ...result, password: password ?? null }, null, 2));
  } else {
    ok(`Published! Expires in ${humanDuration(result.expiresAt)}.`);
    console.log("\n  " + c.bold(c.cyan(result.url)) + "\n");
    if (password) {
      info("  🔑 password: " + c.bold(password) + c.dim("  (share it with the link)"));
    } else {
      info(c.dim("  🌐 public — anyone with the link can view"));
    }
    info(c.dim(`  id: ${result.id}   ·   token saved in ~/.share/config.json`));
  }

  if (flags.open) await openInBrowser(result.url);
}

async function cmdList() {
  const cfg = loadConfig();
  const ids = Object.keys(cfg.docs);
  if (ids.length === 0) return info(c.dim("No documents published yet."));

  info(c.bold("Your documents:\n"));
  for (const id of ids) {
    const d = cfg.docs[id];
    const left = humanDuration(d.expiresAt);
    const lock = d.protected ? c.yellow(" 🔒") : "";
    const status = left === "expired" ? c.dim("(expired)") : c.dim(`expires in ${left}`);
    console.log(`  ${c.cyan(d.url)}${lock}  ${status}`);
  }
}

async function cmdDelete(id: string | undefined, flags: Parsed["flags"]) {
  if (!id) die("Usage: share delete <id>");
  const apiUrl = resolveApiUrl(str(flags.api));
  const cfg = loadConfig();
  const token = str(flags.token) || cfg.docs[id]?.token;
  if (!token) die(`No token for "${id}". Pass --token=<token>.`);

  try {
    await remove(apiUrl, id, token);
  } catch (e) {
    die((e as Error).message);
  }
  forgetDoc(id);
  ok(`Document "${id}" deleted.`);
}

async function cmdInfo(id: string | undefined, flags: Parsed["flags"]) {
  if (!id) die("Usage: share info <id>");
  const apiUrl = resolveApiUrl(str(flags.api));
  const cfg = loadConfig();
  const token = str(flags.token) || cfg.docs[id]?.token;
  if (!token) die(`No token for "${id}". Pass --token=<token>.`);

  let meta;
  try {
    meta = await getMeta(apiUrl, id, token);
  } catch (e) {
    die((e as Error).message);
  }
  console.log(JSON.stringify(meta, null, 2));
}

async function cmdOpen(idOrUrl: string | undefined) {
  if (!idOrUrl) die("Usage: share open <id|url>");
  const cfg = loadConfig();
  const url = idOrUrl.startsWith("http") ? idOrUrl : cfg.docs[idOrUrl]?.url || `${resolveApiUrl()}/d/${idOrUrl}`;
  await openInBrowser(url);
  ok(`Opening ${url}`);
}

async function cmdConfig(flags: Parsed["flags"]) {
  const cfg = loadConfig();
  const newApi = str(flags.api);
  if (newApi) {
    cfg.apiUrl = newApi.replace(/\/$/, "");
    saveConfig(cfg);
    ok(`API url set: ${cfg.apiUrl}`);
    return;
  }
  console.log(JSON.stringify({ apiUrl: cfg.apiUrl, docs: Object.keys(cfg.docs).length }, null, 2));
  info(c.dim(`\nChange it with: share config --api=${DEFAULT_API_URL}`));
}

function usage() {
  console.log(`${c.bold("share")} ${c.dim("v" + VERSION)} — share HTML artifacts instantly.

${c.bold("USAGE")}
  share publish <file.html> [options]
  cat page.html | share publish -

${c.bold("COMMANDS")}
  publish <file>      Publish an HTML file and return the live link
  list                List the documents you've published
  info <id>           Show metadata for a document
  open <id|url>       Open the document in the browser
  delete <id>         Delete a document (uses the stored token)
  config [--api=url]  Show or set the API url

${c.bold("publish OPTIONS")}
  --password=<pass>   Choose the password (default: a random one is generated)
  --public            Publish without a password (anyone with the link can view)
  --slug=<slug>       Custom slug (a-z, 0-9, hyphen; 3-40 chars)
  --open              Open in the browser after publishing
  --json              JSON output
  --agent=<name>      Agent label (default: share-cli)
  --api=<url>         Override the API url

${c.bold("EXAMPLES")}
  share publish report.html                     # random password (printed)
  share publish report.html --public            # no password, link-only
  share publish dash.html --slug=sales-q3 --password=secret
  echo '<h1>hi</h1>' | share publish -

${c.dim("Protected by a random password by default; artifacts expire after 15 days.")}`);
}

main().catch((e) => die((e as Error).message));
