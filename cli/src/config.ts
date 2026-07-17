// Persistência local em ~/.share/config.json: guarda a API url e os tokens
// dos documentos publicados (para permitir delete/info depois).
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

// Custom domain de produção. Fallback: https://share.pinheiro-llip.workers.dev
export const DEFAULT_API_URL = "https://share.fellipe.dev";

export interface DocEntry {
  url: string;
  token: string;
  protected: boolean;
  createdAt: string;
  expiresAt: string;
  slug?: string;
}

export interface Config {
  apiUrl: string;
  docs: Record<string, DocEntry>;
}

const DIR = join(homedir(), ".share");
const FILE = join(DIR, "config.json");

export function loadConfig(): Config {
  if (!existsSync(FILE)) return { apiUrl: DEFAULT_API_URL, docs: {} };
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as Partial<Config>;
    return { apiUrl: parsed.apiUrl || DEFAULT_API_URL, docs: parsed.docs || {} };
  } catch {
    return { apiUrl: DEFAULT_API_URL, docs: {} };
  }
}

export function saveConfig(cfg: Config): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}

/** API url efetiva: flag > env > config salva > default. */
export function resolveApiUrl(flag?: string): string {
  const raw = flag || process.env.SHARE_API_URL || loadConfig().apiUrl || DEFAULT_API_URL;
  return raw.replace(/\/$/, "");
}

export function rememberDoc(id: string, entry: DocEntry): void {
  const cfg = loadConfig();
  cfg.docs[id] = entry;
  saveConfig(cfg);
}

export function forgetDoc(id: string): void {
  const cfg = loadConfig();
  delete cfg.docs[id];
  saveConfig(cfg);
}
