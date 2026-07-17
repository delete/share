#!/usr/bin/env bun
// Teste end-to-end contra um Worker rodando (default: http://localhost:8787).
// Uso: bun run scripts/e2e.ts [baseUrl]
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
  console.log(`\nE2E contra ${BASE}\n`);

  // health
  const health = await fetch(`${BASE}/health`);
  check("health responde 200", health.status === 200);

  // ---- 1. publicar por link (sem senha) ----
  const htmlA = "<!doctype html><h1 id=marker>Olá link</h1>";
  const pubA = await fetch(`${BASE}/api/v1/docs`, {
    method: "POST",
    headers: { "content-type": "text/html" },
    body: htmlA,
  });
  check("publish retorna 201", pubA.status === 201, `status=${pubA.status}`);
  const docA = (await pubA.json()) as any;
  check("publish devolve url", typeof docA.url === "string" && docA.url.includes("/d/"));
  check("publish devolve token", typeof docA.token === "string" && docA.token.length > 10);
  check("publish diz que expira em 15 dias", docA.expiresInDays === 15, `got ${docA.expiresInDays}`);
  const daysLeft = (new Date(docA.expiresAt).getTime() - Date.now()) / 86400000;
  check("expiresAt ~15 dias no futuro", daysLeft > 14.9 && daysLeft < 15.1, `${daysLeft.toFixed(2)}d`);

  // visualizar por link
  const viewA = await fetch(`${BASE}/d/${docA.id}`);
  const viewABody = await viewA.text();
  check("view por link retorna 200", viewA.status === 200);
  check("view por link serve o HTML original", viewABody.includes('id=marker'));
  check("view tem content-type html", (viewA.headers.get("content-type") || "").includes("text/html"));

  // ---- 2. slug customizado + senha ----
  const slug = "teste-" + docA.id.toLowerCase();
  const htmlB = "<!doctype html><h1 id=secret>conteúdo secreto</h1>";
  const pubB = await fetch(`${BASE}/api/v1/docs`, {
    method: "POST",
    headers: { "content-type": "text/html", "x-slug": slug, "x-password": "abre-gergelim" },
    body: htmlB,
  });
  check("publish com slug+senha retorna 201", pubB.status === 201, `status=${pubB.status}`);
  const docB = (await pubB.json()) as any;
  check("id === slug customizado", docB.id === slug, `${docB.id}`);
  check("marcado como protegido", docB.protected === true);

  // slug tomado -> 409
  const dup = await fetch(`${BASE}/api/v1/docs`, {
    method: "POST",
    headers: { "content-type": "text/html", "x-slug": slug },
    body: "<h1>dup</h1>",
  });
  check("slug duplicado retorna 409", dup.status === 409, `status=${dup.status}`);

  // slug inválido -> 400
  const bad = await fetch(`${BASE}/api/v1/docs`, {
    method: "POST",
    headers: { "content-type": "text/html", "x-slug": "Slug Inválido!" },
    body: "<h1>x</h1>",
  });
  check("slug inválido retorna 400", bad.status === 400, `status=${bad.status}`);

  // view protegido sem senha -> mostra gate, NÃO o conteúdo
  const gate = await fetch(`${BASE}/d/${slug}`, { redirect: "manual" });
  const gateBody = await gate.text();
  check("view protegido retorna 200 (gate)", gate.status === 200);
  check("gate NÃO vaza o conteúdo secreto", !gateBody.includes("conteúdo secreto"));
  check("gate mostra formulário de senha", gateBody.includes("Documento protegido"));

  // senha errada -> 401
  const wrong = await fetch(`${BASE}/d/${slug}/unlock`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: "errada" }),
    redirect: "manual",
  });
  check("senha errada retorna 401", wrong.status === 401, `status=${wrong.status}`);

  // senha certa -> 302 + set-cookie
  const right = await fetch(`${BASE}/d/${slug}/unlock`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: "abre-gergelim" }),
    redirect: "manual",
  });
  check("senha certa retorna 302", right.status === 302, `status=${right.status}`);
  const setCookie = right.headers.get("set-cookie") || "";
  check("desbloqueio envia set-cookie", setCookie.includes("hd_s_"));
  check("cookie é HttpOnly", /httponly/i.test(setCookie));

  // usar cookie -> conteúdo liberado
  const cookie = setCookie.split(";")[0];
  const unlocked = await fetch(`${BASE}/d/${slug}`, { headers: { cookie } });
  const unlockedBody = await unlocked.text();
  check("com cookie válido serve o conteúdo secreto", unlockedBody.includes("conteúdo secreto"));

  // cookie forjado -> continua bloqueado
  const forged = await fetch(`${BASE}/d/${slug}`, { headers: { cookie: `hd_s_${slug.replace(/-/g, "")}=forjado.123.abc` } });
  const forgedBody = await forged.text();
  check("cookie forjado NÃO libera o conteúdo", !forgedBody.includes("conteúdo secreto"));

  // ---- 3. auth de gerenciamento ----
  const noAuth = await fetch(`${BASE}/api/v1/docs/${docA.id}`, { method: "DELETE" });
  check("delete sem token retorna 401", noAuth.status === 401, `status=${noAuth.status}`);

  const meta = await fetch(`${BASE}/api/v1/docs/${docA.id}`, { headers: { authorization: `Bearer ${docA.token}` } });
  check("info com token retorna 200", meta.status === 200);

  const del = await fetch(`${BASE}/api/v1/docs/${docA.id}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${docA.token}` },
  });
  check("delete com token retorna 200", del.status === 200);

  const gone = await fetch(`${BASE}/d/${docA.id}`);
  check("documento deletado retorna 404", gone.status === 404, `status=${gone.status}`);

  // 404 de doc inexistente
  const missing = await fetch(`${BASE}/d/nao-existe-mesmo`);
  check("doc inexistente retorna 404", missing.status === 404);

  // limpeza
  await fetch(`${BASE}/api/v1/docs/${slug}`, { method: "DELETE", headers: { authorization: `Bearer ${docB.token}` } });

  console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passaram, ${failed} falharam\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("erro fatal:", e);
  process.exit(1);
});
