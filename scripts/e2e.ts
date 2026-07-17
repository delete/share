#!/usr/bin/env bun
// End-to-end test against a running Worker (default: http://localhost:8787).
// Usage: bun run scripts/e2e.ts [baseUrl]
const BASE = (process.argv[2] || process.env.SHARE_API_URL || "http://localhost:8787").replace(/\/$/, "");

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

async function main() {
  console.log(`\nE2E against ${BASE}\n`);

  // health
  const health = await fetch(`${BASE}/health`);
  check("health responds 200", health.status === 200);

  // ---- 1. publish by link (no password) ----
  const htmlA = "<!doctype html><h1 id=marker>Hello link</h1>";
  const pubA = await fetch(`${BASE}/api/v1/docs`, {
    method: "POST",
    headers: { "content-type": "text/html" },
    body: htmlA,
  });
  check("publish returns 201", pubA.status === 201, `status=${pubA.status}`);
  const docA = (await pubA.json()) as any;
  check("publish returns url", typeof docA.url === "string" && docA.url.includes("/d/"));
  check("publish returns token", typeof docA.token === "string" && docA.token.length > 10);
  check("publish says it expires in 15 days", docA.expiresInDays === 15, `got ${docA.expiresInDays}`);
  const daysLeft = (new Date(docA.expiresAt).getTime() - Date.now()) / 86400000;
  check("expiresAt ~15 days in the future", daysLeft > 14.9 && daysLeft < 15.1, `${daysLeft.toFixed(2)}d`);

  // view by link
  const viewA = await fetch(`${BASE}/d/${docA.id}`);
  const viewABody = await viewA.text();
  check("view by link returns 200", viewA.status === 200);
  check("view by link serves the original HTML", viewABody.includes('id=marker'));
  check("view has content-type html", (viewA.headers.get("content-type") || "").includes("text/html"));

  // ---- 2. custom slug + password ----
  const slug = "test-" + docA.id.toLowerCase();
  const htmlB = "<!doctype html><h1 id=secret>secret content</h1>";
  const pubB = await fetch(`${BASE}/api/v1/docs`, {
    method: "POST",
    headers: { "content-type": "text/html", "x-slug": slug, "x-password": "open-sesame" },
    body: htmlB,
  });
  check("publish with slug+password returns 201", pubB.status === 201, `status=${pubB.status}`);
  const docB = (await pubB.json()) as any;
  check("id === custom slug", docB.id === slug, `${docB.id}`);
  check("marked as protected", docB.protected === true);

  // slug taken -> 409
  const dup = await fetch(`${BASE}/api/v1/docs`, {
    method: "POST",
    headers: { "content-type": "text/html", "x-slug": slug },
    body: "<h1>dup</h1>",
  });
  check("duplicate slug returns 409", dup.status === 409, `status=${dup.status}`);

  // invalid slug -> 400
  const bad = await fetch(`${BASE}/api/v1/docs`, {
    method: "POST",
    headers: { "content-type": "text/html", "x-slug": "Invalid Slug!" },
    body: "<h1>x</h1>",
  });
  check("invalid slug returns 400", bad.status === 400, `status=${bad.status}`);

  // protected view without password -> shows gate, NOT the content
  const gate = await fetch(`${BASE}/d/${slug}`, { redirect: "manual" });
  const gateBody = await gate.text();
  check("protected view returns 200 (gate)", gate.status === 200);
  check("gate does NOT leak the secret content", !gateBody.includes("secret content"));
  check("gate shows the password form", gateBody.includes("Protected document"));

  // wrong password -> 401
  const wrong = await fetch(`${BASE}/d/${slug}/unlock`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: "wrong" }),
    redirect: "manual",
  });
  check("wrong password returns 401", wrong.status === 401, `status=${wrong.status}`);

  // correct password -> 302 + set-cookie
  const right = await fetch(`${BASE}/d/${slug}/unlock`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: "open-sesame" }),
    redirect: "manual",
  });
  check("correct password returns 302", right.status === 302, `status=${right.status}`);
  const setCookie = right.headers.get("set-cookie") || "";
  check("unlock sends set-cookie", setCookie.includes("hd_s_"));
  check("cookie is HttpOnly", /httponly/i.test(setCookie));

  // use cookie -> content unlocked
  const cookie = setCookie.split(";")[0];
  const unlocked = await fetch(`${BASE}/d/${slug}`, { headers: { cookie } });
  const unlockedBody = await unlocked.text();
  check("with a valid cookie serves the secret content", unlockedBody.includes("secret content"));

  // forged cookie -> still blocked
  const forged = await fetch(`${BASE}/d/${slug}`, { headers: { cookie: `hd_s_${slug.replace(/-/g, "")}=forged.123.abc` } });
  const forgedBody = await forged.text();
  check("forged cookie does NOT unlock the content", !forgedBody.includes("secret content"));

  // ---- 3. management auth ----
  const noAuth = await fetch(`${BASE}/api/v1/docs/${docA.id}`, { method: "DELETE" });
  check("delete without token returns 401", noAuth.status === 401, `status=${noAuth.status}`);

  const meta = await fetch(`${BASE}/api/v1/docs/${docA.id}`, { headers: { authorization: `Bearer ${docA.token}` } });
  check("info with token returns 200", meta.status === 200);

  const del = await fetch(`${BASE}/api/v1/docs/${docA.id}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${docA.token}` },
  });
  check("delete with token returns 200", del.status === 200);

  const gone = await fetch(`${BASE}/d/${docA.id}`);
  check("deleted document returns 404", gone.status === 404, `status=${gone.status}`);

  // 404 for a non-existent doc
  const missing = await fetch(`${BASE}/d/does-not-exist-really`);
  check("non-existent doc returns 404", missing.status === 404);

  // cleanup
  await fetch(`${BASE}/api/v1/docs/${slug}`, { method: "DELETE", headers: { authorization: `Bearer ${docB.token}` } });

  console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("fatal error:", e);
  process.exit(1);
});
