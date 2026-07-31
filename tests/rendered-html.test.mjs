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

test("returns an honest partial audit when secondary GitHub sources fail", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input.url;

    if (url === "https://api.github.com/users/octocat") {
      return Response.json({
        login: "octocat",
        name: "The Octocat",
        bio: "A test profile",
        avatar_url: "https://avatars.githubusercontent.com/u/583231",
        html_url: "https://github.com/octocat",
        followers: 100,
        following: 2,
        public_repos: 8,
      });
    }

    return new Response("Temporarily unavailable", { status: 503 });
  };

  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/audit?login=octocat"),
    environment,
    executionContext,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, s-maxage=30, stale-while-revalidate=60");
  const audit = await response.json();
  assert.deepEqual(audit.sources, {
    achievements: "unavailable",
    mergedPullRequests: "unavailable",
    repositories: "unavailable",
  });
  assert.equal(audit.visibleAchievementCount, null);
  assert.equal(audit.metrics.mergedPullRequests, null);
  assert.equal(audit.metrics.topRepository, null);
  assert.equal(audit.warnings.length, 3);

  const quickdraw = audit.achievements.find((item) => item.slug === "quickdraw");
  assert.equal(quickdraw.badgeStatus, "unavailable");
  assert.equal(quickdraw.progressLabel, "estado temporariamente indisponível");
});

test("keeps the public profile lookup as the required source", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response("Not found", { status: 404 });

  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/audit?login=missing-user"),
    environment,
    executionContext,
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: "Perfil não encontrado no GitHub.",
  });
});
