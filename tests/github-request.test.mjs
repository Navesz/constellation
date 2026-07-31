import assert from "node:assert/strict";
import test from "node:test";
import {
  GitHubRequestError,
  fetchGitHubWithTimeout,
  formatGitHubRetryAt,
  githubFailureDiagnostic,
  githubFailureFromResponse,
  githubFailureFromStatus,
  githubRateLimitRetryAt,
} from "../lib/github-request.ts";

test("aborts a GitHub request when its deadline expires", async () => {
  await assert.rejects(
    fetchGitHubWithTimeout(
      "https://api.github.com/users/octocat",
      {},
      5,
      async (_input, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      }),
    ),
    (error) => error instanceof GitHubRequestError && error.reason === "timeout",
  );
});

test("distinguishes network failures from timeout failures", async () => {
  await assert.rejects(
    fetchGitHubWithTimeout(
      "https://api.github.com/users/octocat",
      {},
      100,
      async () => { throw new TypeError("connection reset"); },
    ),
    (error) => error instanceof GitHubRequestError && error.reason === "network",
  );

  assert.deepEqual(githubFailureDiagnostic(new GitHubRequestError("network")), {
    reason: "network",
    message: "falha de rede ao consultar o GitHub",
  });
});

test("classifies GitHub response statuses without losing the status code", () => {
  assert.equal(githubFailureFromStatus(404).reason, "not-found");
  assert.equal(githubFailureFromStatus(429).reason, "rate-limit");
  const upstream = githubFailureFromStatus(503);
  assert.equal(upstream.reason, "upstream-error");
  assert.equal(upstream.status, 503);
});

test("derives an exact retry time from rate-limit response headers", () => {
  const now = Date.parse("2026-07-31T12:00:00.000Z");
  const retryAfterHeaders = new Headers({ "retry-after": "120" });
  const resetHeaders = new Headers({ "x-ratelimit-reset": "1785502800" });

  assert.equal(
    githubRateLimitRetryAt(retryAfterHeaders, now),
    "2026-07-31T12:02:00.000Z",
  );
  assert.equal(
    githubRateLimitRetryAt(resetHeaders, now),
    "2026-07-31T13:00:00.000Z",
  );
  assert.equal(formatGitHubRetryAt("2026-07-31T12:02:00.000Z"), "2026-07-31 12:02:00 UTC");
  assert.equal(
    githubRateLimitRetryAt(new Headers({ "retry-after": "9e99" }), now),
    null,
  );
  assert.equal(
    githubRateLimitRetryAt(new Headers({
      "retry-after": "9e99",
      "x-ratelimit-reset": "1785502800",
    }), now),
    "2026-07-31T13:00:00.000Z",
  );
  assert.equal(formatGitHubRetryAt("not-a-date"), null);
});

test("propagates retry guidance only for rate-limit responses", () => {
  const now = Date.parse("2026-07-31T12:00:00.000Z");
  const rateLimit = githubFailureFromResponse(
    new Response("limited", { status: 429, headers: { "retry-after": "90" } }),
    now,
  );
  const upstream = githubFailureFromResponse(
    new Response("failed", { status: 503, headers: { "retry-after": "90" } }),
    now,
  );

  assert.deepEqual(githubFailureDiagnostic(rateLimit), {
    reason: "rate-limit",
    message: "limite temporário de consultas do GitHub",
    retryAt: "2026-07-31T12:01:30.000Z",
  });
  assert.equal(upstream.retryAt, null);
  assert.equal("retryAt" in githubFailureDiagnostic(upstream), false);
});
