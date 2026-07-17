// Terminal output helpers (colors only when TTY).
const useColor = process.stdout.isTTY && process.env.NO_COLOR == null;
const wrap = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const c = {
  bold: wrap("1"),
  dim: wrap("2"),
  green: wrap("32"),
  red: wrap("31"),
  yellow: wrap("33"),
  cyan: wrap("36"),
  blue: wrap("34"),
};

export function info(msg: string): void {
  console.error(msg);
}
export function ok(msg: string): void {
  console.error(`${c.green("✓")} ${msg}`);
}
export function warn(msg: string): void {
  console.error(`${c.yellow("!")} ${msg}`);
}
export function die(msg: string): never {
  console.error(`${c.red("✗")} ${msg}`);
  process.exit(1);
}

/** Opens a URL in the OS default browser. */
export async function openInBrowser(url: string): Promise<void> {
  const cmd =
    process.platform === "darwin" ? ["open", url] : process.platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url];
  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  } catch {
    /* silent: opening the browser is best-effort */
  }
}

export function humanDuration(toISO: string): string {
  const ms = new Date(toISO).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}
