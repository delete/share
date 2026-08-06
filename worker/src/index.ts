import {
  randomId,
  randomToken,
  hashPassword,
  verifyPassword,
  signUnlock,
  verifyUnlock,
  type PasswordHash,
} from "./crypto";
import { passwordPage, errorPage, landingPage } from "./views";

export interface Env {
  DOCS: KVNamespace;
  PUBLIC_BASE_URL?: string;
  EXPIRY_DAYS: string;
  SESSION_SECRET?: string;
  MAX_UPLOAD_MB?: string;
}

interface DocRecord {
  html: string;
  token: string;
  createdAt: number;
  expiresAt: number;
  agentName?: string;
  password?: PasswordHash | null;
}

const DEFAULT_MAX_UPLOAD_MB = 2; // configurable via the MAX_UPLOAD_MB var
const RESERVED = new Set(["api", "d", "health", "favicon.ico", "robots.txt", "index.html", ""]);
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (method === "OPTIONS") return cors(new Response(null, { status: 204 }));

      if (path === "/" && method === "GET") {
        return html(landingPage(baseUrl(env, request), expiryDays(env)));
      }
      if (path === "/health") {
        return json({ ok: true, service: "share" });
      }
      if (path === "/robots.txt") {
        return new Response("User-agent: *\nDisallow: /d/\n", { headers: { "content-type": "text/plain" } });
      }

      // API: publish
      if (path === "/api/v1/docs" && method === "POST") {
        return cors(await publish(request, env));
      }
      // API: metadata / delete
      const apiMatch = path.match(/^\/api\/v1\/docs\/([^/]+)$/);
      if (apiMatch) {
        const id = decodeURIComponent(apiMatch[1]);
        if (method === "GET") return cors(await getMeta(id, request, env));
        if (method === "DELETE") return cors(await remove(id, request, env));
      }

      // Public view
      const viewMatch = path.match(/^\/d\/([^/]+)$/);
      if (viewMatch && method === "GET") {
        return noindex(await view(decodeURIComponent(viewMatch[1]), request, env));
      }
      const unlockMatch = path.match(/^\/d\/([^/]+)\/unlock$/);
      if (unlockMatch && method === "POST") {
        return noindex(await unlock(decodeURIComponent(unlockMatch[1]), request, env));
      }

      return html(errorPage(404, "Not found", "This page does not exist."), 404);
    } catch (err) {
      console.error("unhandled", err);
      return json({ error: "internal_error" }, 500);
    }
  },
};

// ---------- handlers ----------

async function publish(request: Request, env: Env): Promise<Response> {
  const ctype = request.headers.get("content-type") ?? "";
  let htmlBody: string;
  let slug: string | undefined;
  let password: string | undefined;
  let agentName: string | undefined;

  if (ctype.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.html !== "string") {
      return json({ error: "invalid_body", message: "Send { html, slug?, password?, agentName? }." }, 400);
    }
    htmlBody = body.html;
    slug = typeof body.slug === "string" ? body.slug : undefined;
    password = typeof body.password === "string" ? body.password : undefined;
    agentName = typeof body.agentName === "string" ? body.agentName : undefined;
  } else {
    htmlBody = await request.text();
    slug = request.headers.get("x-slug") ?? undefined;
    password = request.headers.get("x-password") ?? undefined;
    agentName = request.headers.get("x-agent-name") ?? undefined;
  }

  if (!htmlBody.trim()) {
    return json({ error: "empty", message: "The HTML is empty." }, 400);
  }
  const limit = maxBytes(env);
  if (new Blob([htmlBody]).size > limit) {
    return json({ error: "too_large", message: `Maximum ${limit / (1024 * 1024)} MB per artifact.` }, 413);
  }

  // Resolve the id (custom slug or random).
  let id: string;
  if (slug != null && slug !== "") {
    const norm = slug.trim().toLowerCase();
    if (!SLUG_RE.test(norm) || RESERVED.has(norm)) {
      return json({ error: "invalid_slug", message: "Slug must be 3-40 chars: a-z, 0-9, hyphen." }, 400);
    }
    if (await env.DOCS.get(key(norm))) {
      return json({ error: "slug_taken", message: `Slug "${norm}" is already taken.` }, 409);
    }
    id = norm;
  } else {
    id = await freshId(env);
  }

  const now = Date.now();
  const ttlSeconds = expiryDays(env) * 86400;
  const record: DocRecord = {
    html: htmlBody,
    token: randomToken(),
    createdAt: now,
    expiresAt: now + ttlSeconds * 1000,
    agentName,
    password: password ? await hashPassword(password) : null,
  };

  await env.DOCS.put(key(id), JSON.stringify(record), { expirationTtl: ttlSeconds });

  return json(
    {
      id,
      url: `${baseUrl(env, request)}/d/${id}`,
      token: record.token,
      protected: !!record.password,
      expiresAt: new Date(record.expiresAt).toISOString(),
      expiresInDays: expiryDays(env),
    },
    201,
  );
}

async function view(id: string, request: Request, env: Env): Promise<Response> {
  const record = await load(env, id);
  if (!record) return html(errorPage(404, "Unavailable", "This document has expired or does not exist."), 404);

  if (record.password) {
    const cookies = parseCookies(request.headers.get("cookie"));
    const token = cookies[cookieName(id)];
    const ok = token && (await verifyUnlock(token, id, secret(env), Date.now()));
    if (!ok) return html(passwordPage(id), 200);
  }

  return serveArtifact(record.html);
}

async function unlock(id: string, request: Request, env: Env): Promise<Response> {
  const record = await load(env, id);
  if (!record) return html(errorPage(404, "Unavailable", "This document has expired or does not exist."), 404);
  if (!record.password) return redirect(`/d/${id}`);

  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  if (!(await verifyPassword(password, record.password))) {
    return html(passwordPage(id, { error: true }), 401);
  }

  const cookieVal = await signUnlock(id, record.expiresAt, secret(env));
  const maxAge = Math.max(60, Math.floor((record.expiresAt - Date.now()) / 1000));
  const secureFlag = isHttps(request) ? " Secure;" : "";
  const res = redirect(`/d/${id}`);
  res.headers.append(
    "set-cookie",
    `${cookieName(id)}=${cookieVal}; HttpOnly;${secureFlag} SameSite=Lax; Path=/d/${id}; Max-Age=${maxAge}`,
  );
  return res;
}

async function getMeta(id: string, request: Request, env: Env): Promise<Response> {
  const record = await load(env, id);
  if (!record) return json({ error: "not_found" }, 404);
  if (!authorized(request, record.token)) return json({ error: "unauthorized" }, 401);
  return json({
    id,
    url: `${baseUrl(env, request)}/d/${id}`,
    protected: !!record.password,
    agentName: record.agentName ?? null,
    createdAt: new Date(record.createdAt).toISOString(),
    expiresAt: new Date(record.expiresAt).toISOString(),
    bytes: new Blob([record.html]).size,
  });
}

async function remove(id: string, request: Request, env: Env): Promise<Response> {
  const record = await load(env, id);
  if (!record) return json({ error: "not_found" }, 404);
  if (!authorized(request, record.token)) return json({ error: "unauthorized" }, 401);
  await env.DOCS.delete(key(id));
  return json({ id, deleted: true });
}

// ---------- helpers ----------

const key = (id: string) => `doc:${id}`;
const cookieName = (id: string) => `hd_s_${id.replace(/[^a-z0-9]/gi, "")}`;

async function load(env: Env, id: string): Promise<DocRecord | null> {
  const raw = await env.DOCS.get(key(id));
  return raw ? (JSON.parse(raw) as DocRecord) : null;
}

async function freshId(env: Env): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const id = randomId(8);
    if (!RESERVED.has(id.toLowerCase()) && !(await env.DOCS.get(key(id)))) return id;
  }
  return randomId(12);
}

function authorized(request: Request, token: string): boolean {
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const header = request.headers.get("x-doc-token");
  return bearer === token || header === token;
}

function baseUrl(env: Env, request: Request): string {
  // PUBLIC_BASE_URL is optional: when unset, derive it from the incoming request
  // so the free workers.dev URL works with zero config (no custom domain needed).
  return (env.PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
}
function expiryDays(env: Env): number {
  const n = Number(env.EXPIRY_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 15;
}
function maxBytes(env: Env): number {
  const mb = Number(env.MAX_UPLOAD_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_UPLOAD_MB) * 1024 * 1024;
}
function secret(env: Env): string {
  return env.SESSION_SECRET || "dev-insecure-secret-change-me";
}
function isHttps(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

// ---------- responses ----------

function serveArtifact(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function noindex(res: Response): Response {
  res.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  return res;
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

function cors(res: Response): Response {
  res.headers.set("access-control-allow-origin", "*");
  res.headers.set("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  res.headers.set("access-control-allow-headers", "content-type, authorization, x-doc-token, x-slug, x-password, x-agent-name");
  return res;
}
