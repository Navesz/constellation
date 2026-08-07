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

const publicApiLinkHeader =
  '</api/audit/schema/2>; rel="describedby"; type="application/schema+json", '
  + '</api/openapi.json>; rel="service-desc"; type="application/openapi+json", '
  + '</docs>; rel="service-doc"; type="text/html", '
  + '</api/status>; rel="status"; type="application/json"';

test("server-renders the finished Constellation experience", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    environment,
    executionContext,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("permissions-policy"), "camera=(), geolocation=(), microphone=()");
  assert.equal(
    response.headers.get("content-security-policy"),
    "base-uri 'self'; form-action 'self'; object-src 'none'",
  );

  const html = await response.text();
  assert.match(html, /<title>Constellation — GitHub Profile Observatory<\/title>/i);
  assert.match(html, /Transforme sinais do GitHub em uma rota clara\./);
  assert.match(html, /observatório de perfil/);
  assert.match(html, /Somente dados públicos/);
  assert.match(html, /href="\/docs"[^>]*>Guia da API/);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("does not reflect an untrusted forwarded host into social metadata", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: {
        accept: "text/html",
        "x-forwarded-host": "metadata-attacker.example",
        "x-forwarded-proto": "https",
      },
    }),
    environment,
    executionContext,
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /metadata-attacker\.example/);
  assert.match(
    html,
    /https:\/\/constellation-profile\.leonardonavesworking\.chatgpt\.site\/og\.png/,
  );
});

test("serves the machine-readable audit schema with long-lived caching", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/audit/schema/2"),
    environment,
    executionContext,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/schema\+json\b/i);
  assert.equal(response.headers.get("x-constellation-schema-version"), "2");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("link"), publicApiLinkHeader);
  assert.equal(
    response.headers.get("cache-control"),
    "public, s-maxage=86400, stale-while-revalidate=604800",
  );
  const schema = await response.json();
  assert.equal(schema.properties.schemaVersion.const, 2);
  assert.equal(schema.additionalProperties, false);
});

test("serves current and legacy export schemas with explicit versions", async () => {
  const worker = await loadWorker();

  for (const [path, version, selfDescribing] of [
    ["/api/export/schema", "2", true],
    ["/api/export/schema/2", "2", true],
    ["/api/export/schema/1", "1", false],
  ]) {
    const response = await worker.fetch(
      new Request(`http://localhost${path}`),
      environment,
      executionContext,
    );

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^application\/schema\+json\b/i);
    assert.equal(response.headers.get("x-constellation-export-version"), version);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.equal(
      response.headers.get("cache-control"),
      "public, s-maxage=86400, stale-while-revalidate=604800",
    );
    const schema = await response.json();
    assert.equal(schema.properties.version.const, Number(version));
    assert.equal(schema.required.includes("$schema"), selfDescribing);
    assert.equal(schema.additionalProperties, false);
  }
});

test("serves the OpenAPI entry document with long-lived caching", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/openapi.json"),
    environment,
    executionContext,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/openapi\+json\b/i);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("link"), publicApiLinkHeader);
  assert.equal(
    response.headers.get("cache-control"),
    "public, s-maxage=86400, stale-while-revalidate=604800",
  );
  const description = await response.json();
  assert.equal(description.openapi, "3.1.1");
  assert.equal(description.paths["/api/audit"].get.operationId, "getProfileAudit");
  assert.equal(
    description.paths["/api/audit"].get.responses["200"].content["application/json"].schema.$ref,
    "https://constellation-profile.leonardonavesworking.chatgpt.site/api/audit/schema/2",
  );
});

test("reports application health without contacting GitHub or caching the observation", async (context) => {
  const originalFetch = globalThis.fetch;
  let externalRequestCount = 0;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => {
    externalRequestCount += 1;
    return new Response("Unexpected request", { status: 500 });
  };

  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/status"),
    environment,
    executionContext,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("link"), publicApiLinkHeader);

  const status = await response.json();
  assert.equal(status.status, "ok");
  assert.equal(status.service, "constellation");
  assert.equal(status.auditSchemaVersion, 2);
  assert.equal(status.auditExportVersion, 2);
  assert.deepEqual(status.dependencies, { github: "not-checked" });
  assert.deepEqual(status.contracts, {
    auditSchema: "http://localhost/api/audit/schema/2",
    exportSchema: "http://localhost/api/export/schema/2",
    openApi: "http://localhost/api/openapi.json",
    documentation: "http://localhost/docs",
  });
  assert.equal(Number.isNaN(Date.parse(status.checkedAt)), false);
  assert.equal(externalRequestCount, 0);
});

test("server-renders a human integration guide next to the machine contracts", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/docs", { headers: { accept: "text/html" } }),
    environment,
    executionContext,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Guia da API — Constellation<\/title>/i);
  assert.match(html, /Integre o observatório sem adivinhar o contrato\./);
  assert.match(html, /\/api\/audit\?login=octocat/);
  assert.match(html, /\/api\/audit\/schema\/2/);
  assert.match(html, /\/api\/export\/schema\/2/);
  assert.match(html, /Confirme o arquivo antes de confiar nele\./);
  assert.match(html, /Escolher exportação \.json/);
  assert.match(html, /Leitura local · sem upload/);
  assert.match(html, /somente a origem oficial se torna um link direto/);
  assert.match(html, /\/api\/openapi\.json/);
  assert.match(html, /\/api\/status/);
  assert.match(html, /Saúde sem gastar uma consulta externa\./);
  assert.match(html, /Retry-After/);
  assert.match(html, /Origem canônica/);
  assert.match(html, /Navegação defensiva/);
  assert.match(html, /Sem spam/);
});

test("answers CORS preflight consistently for the public API routes", async () => {
  const worker = await loadWorker();

  for (const path of [
    "/api/audit",
    "/api/audit/schema",
    "/api/audit/schema/2",
    "/api/export/schema",
    "/api/export/schema/1",
    "/api/export/schema/2",
    "/api/openapi.json",
    "/api/status",
  ]) {
    const response = await worker.fetch(
      new Request(`http://localhost${path}`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://integration.example",
          "Access-Control-Request-Method": "GET",
        },
      }),
      environment,
      executionContext,
    );

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.equal(response.headers.get("access-control-allow-methods"), "GET, OPTIONS");
    assert.equal(response.headers.get("access-control-allow-headers"), "Accept, Content-Type");
    assert.equal(response.headers.get("access-control-max-age"), "86400");
    assert.equal(response.headers.get("allow"), "GET, OPTIONS");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(await response.text(), "");
  }
});

test("rejects an invalid GitHub login before making an external request", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/audit?login=-invalid"),
    environment,
    executionContext,
  );

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("link"), publicApiLinkHeader);
  assert.deepEqual(await response.json(), {
    error: "Informe um usuário válido do GitHub.",
  });
});

test("rejects unbounded cache keys before making an external request", async (context) => {
  const originalFetch = globalThis.fetch;
  let externalRequestCount = 0;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => {
    externalRequestCount += 1;
    return new Response("Unexpected request", { status: 500 });
  };

  const worker = await loadWorker();
  const rejectedUrls = [
    "http://localhost/api/audit?login=octocat&refresh=invalid/token",
    "http://localhost/api/audit?login=octocat&nonce=random",
    "http://localhost/api/audit?login=octocat&login=hubot",
  ];

  for (const url of rejectedUrls) {
    const response = await worker.fetch(
      new Request(url),
      environment,
      executionContext,
    );

    assert.equal(response.status, 400);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  }

  assert.equal(externalRequestCount, 0);
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
  assert.equal(response.headers.get("x-constellation-schema-version"), "2");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(
    response.headers.get("access-control-expose-headers"),
    "Link, Retry-After, X-Constellation-Export-Version, X-Constellation-Schema-Version",
  );
  assert.equal(
    response.headers.get("link"),
    publicApiLinkHeader,
  );
  const audit = await response.json();
  assert.equal(audit.schemaVersion, 2);
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
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("retry-after"), "Sun, 01 Jan 2040 00:00:00 GMT");
  assert.deepEqual(await response.json(), {
    error: "O GitHub limitou novas consultas. Tente novamente após 2040-01-01 00:00:00 UTC.",
    retryAt: "2040-01-01T00:00:00.000Z",
  });
  assert.equal(requestCount, 1);
});

test("returns official context for a visible historical achievement", async (context) => {
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
        </a>
        <a href="/hubot?achievement=pull-shark&amp;tab=achievements">
          <img alt="Achievement: Pull Shark">
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
  const historical = audit.achievements.find((item) => item.slug === "mars-2020-contributor");
  assert.equal(historical.catalogStatus, "modeled");
  assert.equal(historical.earningStatus, "historical");
  assert.equal(historical.nextThreshold, null);
  assert.equal(historical.progressLabel, "reconhecimento histórico confirmado");
  assert.match(historical.documentationUrl, /^https:\/\/docs\.github\.com\//);
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
