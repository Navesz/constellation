import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

const environment = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

test("server-renders the finished Constellation experience", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    environment,
    executionContext,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Constellation — GitHub Profile Observatory<\/title>/i);
  assert.match(html, /Transforme sinais do GitHub em uma rota clara\./);
  assert.match(html, /observatório de perfil/);
  assert.match(html, /Somente dados públicos/);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("rejects an invalid GitHub login before making an external request", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/audit?login=-invalid"),
    environment,
    executionContext,
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Informe um usuário válido do GitHub.",
  });
});
