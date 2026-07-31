import assert from "node:assert/strict";
import test from "node:test";
import {
  GitHubRequestError,
  fetchGitHubWithTimeout,
  githubFailureDiagnostic,
  githubFailureFromStatus,
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
