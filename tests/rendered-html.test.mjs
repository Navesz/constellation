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

test("serves the machine-readable audit schema with long-lived caching", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/audit/schema"),
    environment,
    executionContext,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/schema\+json\b/i);
  assert.equal(response.headers.get("x-constellation-schema-version"), "1");
  assert.equal(
    response.headers.get("cache-control"),
    "public, s-maxage=86400, stale-while-revalidate=604800",
  );
  const schema = await response.json();
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.equal(schema.additionalProperties, false);
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
  assert.equal(response.headers.get("x-constellation-schema-version"), "1");
  assert.equal(
    response.headers.get("link"),
    '</api/audit/schema>; rel="describedby"; type="application/schema+json"',
  );
  const audit = await response.json();
  assert.equal(audit.schemaVersion, 1);
  assert.deepEqual(audit.sources, {
    achievements: "unavailable",
    mergedPullRequests: "unavailable",
    repositories: "unavailable",
  });
  assert.deepEqual(audit.sourceDiagnostics, {
    achievements: { reason: "upstream-error", message: "GitHub respondeu com erro" },
    mergedPullRequests: { reason: "upstream-error", message: "GitHub respondeu com erro" },
    repositories: { reason: "upstream-error", message: "GitHub respondeu com erro" },
  });
  assert.equal(audit.visibleAchievementCount, null);
  assert.equal(audit.metrics.mergedPullRequests, null);
  assert.equal(audit.metrics.topRepository, null);
  assert.equal(audit.warnings.length, 3);
  assert.ok(audit.warnings.every((warning) => warning.includes("Motivo: GitHub respondeu com erro.")));

  const quickdraw = audit.achievements.find((item) => item.slug === "quickdraw");
  assert.equal(quickdraw.badgeStatus, "unavailable");
  assert.equal(quickdraw.progressLabel, "estado temporariamente indisponível");
});

test("keeps the public profile lookup as the required source", async (context) => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response("Not found", { status: 404 });
  };

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
  assert.equal(requestCount, 1);
});

test("reports a required-profile rate limit without starting secondary lookups", async (context) => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response("Rate limited", {
      status: 429,
      headers: { "x-ratelimit-reset": "2208988800" },
    });
  };

  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/audit?login=octocat"),
    environment,
    executionContext,
  );

  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), {
    error: "O GitHub limitou novas consultas. Tente novamente após 2040-01-01 00:00:00 UTC.",
    retryAt: "2040-01-01T00:00:00.000Z",
  });
  assert.equal(requestCount, 1);
});

test("returns visible achievements that are not yet in the internal catalog", async (context) => {
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
        bio: null,
        avatar_url: "https://avatars.githubusercontent.com/u/583231",
        html_url: "https://github.com/octocat",
        followers: 100,
        following: 2,
        public_repos: 8,
      });
    }
    if (url.startsWith("https://api.github.com/search/repositories")) {
      return Response.json({ items: [] });
    }
    if (url.startsWith("https://api.github.com/search/issues")) {
      return Response.json({ total_count: 0 });
    }
    if (url === "https://github.com/octocat") {
      return new Response(`
        <a href="/octocat?achievement=mars-2020-contributor&amp;tab=achievements">
          <img alt="Achievement: Mars 2020 Contributor">
        </a>`);
    }

    return new Response("Unexpected request", { status: 500 });
  };

  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/audit?login=octocat"),
    environment,
    executionContext,
  );

  assert.equal(response.status, 200);
  const audit = await response.json();
  assert.equal(audit.visibleAchievementCount, 1);
  const discovered = audit.achievements.find((item) => item.slug === "mars-2020-contributor");
  assert.equal(discovered.catalogStatus, "discovered");
  assert.equal(discovered.progressLabel, "selo público detectado");
});

test("selects the top repository from a star-sorted search across the full profile", async (context) => {
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    requestedUrls.push(url);

    if (url.startsWith("https://api.github.com/")) {
      assert.equal(init?.headers?.["X-GitHub-Api-Version"], "2026-03-10");
    }
    if (url === "https://api.github.com/users/prolific-user") {
      return Response.json({
        login: "prolific-user",
        name: "Prolific User",
        bio: null,
        avatar_url: "https://avatars.githubusercontent.com/u/1",
        html_url: "https://github.com/prolific-user",
        followers: 10,
        following: 2,
        public_repos: 240,
      });
    }
    if (url.startsWith("https://api.github.com/search/repositories")) {
      const search = new URL(url);
      assert.equal(search.searchParams.get("q"), "user:prolific-user fork:false");
      assert.equal(search.searchParams.get("sort"), "stars");
      assert.equal(search.searchParams.get("order"), "desc");
      assert.equal(search.searchParams.get("per_page"), "1");
      return Response.json({
        items: [{
          name: "older-breakout-project",
          description: "The strongest public project",
          stargazers_count: 987,
          forks_count: 42,
          html_url: "https://github.com/prolific-user/older-breakout-project",
        }],
      });
    }
    if (url.startsWith("https://api.github.com/search/issues")) {
      return Response.json({ total_count: 17 });
    }
    if (url === "https://github.com/prolific-user") return new Response("");

    return new Response("Unexpected request", { status: 500 });
  };

  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/audit?login=prolific-user"),
    environment,
    executionContext,
  );

  assert.equal(response.status, 200);
  const audit = await response.json();
  assert.deepEqual(audit.metrics.topRepository, {
    name: "older-breakout-project",
    description: "The strongest public project",
    stars: 987,
    forks: 42,
    url: "https://github.com/prolific-user/older-breakout-project",
  });
  assert.deepEqual(audit.sourceDiagnostics, {
    achievements: null,
    mergedPullRequests: null,
    repositories: null,
  });
  assert.equal(
    requestedUrls.some((url) => url.includes("/users/prolific-user/repos")),
    false,
  );
});
