import assert from "node:assert/strict";
import test from "node:test";
import { buildAuditEvidenceSources } from "../lib/audit-sources.ts";

function audit(overrides = {}) {
  return {
    profile: {
      login: "octocat",
      htmlUrl: "https://github.com/octocat",
      followers: 18_400,
      publicRepos: 8,
    },
    metrics: {
      mergedPullRequests: 12,
      topRepository: {
        name: "hello-world",
        stars: 2_700,
      },
    },
    sources: {
      achievements: "available",
      mergedPullRequests: "available",
      repositories: "available",
    },
    visibleAchievementCount: 2,
    ...overrides,
  };
}

test("builds inspectable evidence for every source used by the audit", () => {
  const sources = buildAuditEvidenceSources(audit());

  assert.deepEqual(sources.map(({ id, status }) => ({ id, status })), [
    { id: "profile", status: "available" },
    { id: "achievements", status: "available" },
    { id: "mergedPullRequests", status: "available" },
    { id: "repositories", status: "available" },
  ]);
  assert.equal(sources[0].url, "https://api.github.com/users/octocat");
  assert.equal(sources[1].url, "https://github.com/octocat?tab=achievements");
  assert.equal(new URL(sources[2].url).searchParams.get("q"), "is:pr author:octocat is:merged");
  assert.equal(new URL(sources[3].url).searchParams.get("q"), "user:octocat fork:false");
  assert.equal(new URL(sources[3].url).searchParams.get("sort"), "stars");
  assert.match(sources[3].result, /hello-world · 2\.700 estrelas/);
});

test("keeps failed sources unavailable instead of describing zero results", () => {
  const sources = buildAuditEvidenceSources(audit({
    metrics: { mergedPullRequests: null, topRepository: null },
    sources: {
      achievements: "unavailable",
      mergedPullRequests: "unavailable",
      repositories: "unavailable",
    },
    visibleAchievementCount: null,
  }));

  for (const source of sources.slice(1)) {
    assert.equal(source.status, "unavailable");
    assert.equal(source.result, "leitura indisponível");
  }
  assert.doesNotMatch(sources.map((source) => source.result).join(" "), /0 (selos|PRs|estrelas)/);
});
