// Thin HTTP client for the Worker API.

export interface PublishResult {
  id: string;
  url: string;
  token: string;
  protected: boolean;
  expiresAt: string;
  expiresInDays: number;
}

export interface DocMeta {
  id: string;
  url: string;
  protected: boolean;
  agentName: string | null;
  createdAt: string;
  expiresAt: string;
  bytes: number;
}

export interface PublishOptions {
  slug?: string;
  password?: string;
  agentName?: string;
}

async function fail(res: Response): Promise<never> {
  let detail = "";
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    detail = body.message || body.error || "";
  } catch {
    detail = await res.text().catch(() => "");
  }
  throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`);
}

export async function publish(apiUrl: string, html: string, opts: PublishOptions): Promise<PublishResult> {
  const res = await fetch(`${apiUrl}/api/v1/docs`, {
    method: "POST",
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...(opts.slug ? { "x-slug": opts.slug } : {}),
      ...(opts.password ? { "x-password": opts.password } : {}),
      "x-agent-name": opts.agentName || "share-cli",
    },
    body: html,
  });
  if (!res.ok) await fail(res);
  return (await res.json()) as PublishResult;
}

export async function getMeta(apiUrl: string, id: string, token: string): Promise<DocMeta> {
  const res = await fetch(`${apiUrl}/api/v1/docs/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) await fail(res);
  return (await res.json()) as DocMeta;
}

export async function remove(apiUrl: string, id: string, token: string): Promise<void> {
  const res = await fetch(`${apiUrl}/api/v1/docs/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) await fail(res);
}
