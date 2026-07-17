// HTML pages served by the Worker (landing, password gate, errors).
// No dependencies: plain template strings.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SHELL_STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0b0d12; color: #e7e9ee; padding: 24px;
  }
  .card {
    width: 100%; max-width: 400px; background: #151922; border: 1px solid #232937;
    border-radius: 14px; padding: 32px; box-shadow: 0 20px 60px rgba(0,0,0,.4);
  }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p { color: #9aa3b2; margin: 0 0 20px; }
  label { display: block; font-size: 13px; color: #9aa3b2; margin-bottom: 6px; }
  input {
    width: 100%; padding: 11px 13px; border-radius: 9px; border: 1px solid #2b3242;
    background: #0e1117; color: #e7e9ee; font-size: 15px; margin-bottom: 16px;
  }
  input:focus { outline: none; border-color: #5b8cff; }
  button {
    width: 100%; padding: 11px; border: 0; border-radius: 9px; cursor: pointer;
    background: #5b8cff; color: #fff; font-size: 15px; font-weight: 600;
  }
  button:hover { background: #4a7bf0; }
  .err { color: #ff6b6b; font-size: 13px; margin: -8px 0 14px; }
  .brand { font-size: 12px; color: #5a6273; margin-top: 22px; text-align: center; }
  a { color: #5b8cff; text-decoration: none; }
`;

export function passwordPage(id: string, opts: { error?: boolean } = {}): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Password protected · Share</title>
<style>${SHELL_STYLE}</style>
</head><body>
<form class="card" method="post" action="/d/${encodeURIComponent(id)}/unlock">
  <h1>🔒 Protected document</h1>
  <p>This artifact requires a password to be viewed.</p>
  ${opts.error ? `<div class="err">Incorrect password. Please try again.</div>` : ""}
  <label for="p">Password</label>
  <input id="p" name="password" type="password" autofocus autocomplete="current-password" required>
  <button type="submit">Unlock</button>
  <div class="brand">Shared with <a href="/">Share</a></div>
</form>
</body></html>`;
}

export function errorPage(code: number, title: string, message: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${code} · Share</title>
<style>${SHELL_STYLE}</style>
</head><body>
<div class="card">
  <h1>${code} · ${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  <div class="brand"><a href="/">Share</a></div>
</div>
</body></html>`;
}

export function landingPage(baseUrl: string, expiryDays: number): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Share — share HTML artifacts instantly</title>
<style>${SHELL_STYLE}
  body { place-items: start center; padding-top: 8vh; }
  .card { max-width: 560px; }
  pre { background: #0e1117; border: 1px solid #232937; border-radius: 9px; padding: 14px;
        overflow-x: auto; font-size: 13px; color: #b9c2d0; }
  ul { color: #9aa3b2; padding-left: 18px; }
  li { margin: 6px 0; }
</style>
</head><body>
<div class="card">
  <h1>📄 Share</h1>
  <p>Publish any HTML artifact and get a live link in seconds.</p>
  <ul>
    <li>Public link view — no account</li>
    <li>Password protection and custom slug</li>
    <li>Automatic expiration in ${expiryDays} days</li>
    <li>Works with Claude Code, Codex &amp; pi via CLI</li>
  </ul>
  <pre>bunx @share/cli publish ./report.html
# → ${baseUrl}/d/aB3xY9kQ</pre>
  <div class="brand">Built for AI agents and humans.</div>
</div>
</body></html>`;
}
