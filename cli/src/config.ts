// Local persistence in ~/.share/config.json: stores the API url and the tokens
// of published documents (so delete/info work later).
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

// Neutral default for the open source project: points to a local Worker.
// Each user points to THEIR instance via `share config --api=https://...`
// or `export SHARE_API_URL=https://...`.
export const DEFAULT_API_URL = "http://localhost:8787";

export interface DocEntry {
  url: string;
  token: string;
  protected: boolean;
  createdAt: string;
  expiresAt: string;
  slug?: string;
  password?: string; // stored so you can re-share it; null/absent = public
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

/** Effective API url: flag > env > saved config > default. */
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
