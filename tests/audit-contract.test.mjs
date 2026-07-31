import assert from "node:assert/strict";
import test from "node:test";
import {
  INCOMPATIBLE_AUDIT_RESPONSE_MESSAGE,
  isAuditResponse,
  parseAuditErrorResponse,
  readAuditApiResponse,
} from "../lib/audit-contract.ts";

function audit(overrides = {}) {
  return {
    schemaVersion: 2,
    profile: {
      login: "octocat",
      name: "The Octocat",
      bio: "GitHub mascot",
      avatarUrl: "https://avatars.githubusercontent.com/u/583231",
      htmlUrl: "https://github.com/octocat",
      followers: 18_400,
      following: 9,
      publicRepos: 8,
    },
    metrics: {
      mergedPullRequests: 12,
      topRepository: {
        name: "hello-world",
        description: "A public project",
        stars: 2_700,
        forks: 3_100,
        url: "https://github.com/octocat/hello-world",
      },
    },
    sources: {
      achievements: "available",
      mergedPullRequests: "available",
      repositories: "available",
    },
    sourceDiagnostics: {
      achievements: null,
      mergedPullRequests: null,
      repositories: null,
    },
    visibleAchievementCount: 1,
    achievements: [{
      name: "Pull Shark",
      slug: "pull-shark",
      description: "Mescle pull requests.",
      nextAction: "Continue colaborando.",
      thresholds: [2, 16],
      catalogStatus: "modeled",
      earningStatus: "active",
      documentationUrl: null,
      unlocked: true,
      tier: 1,
      current: 12,
      nextThreshold: 16,
      progressLabel: "12 medidos",
      badgeStatus: "visible",
      measurementKind: "measured",
      currentIsMinimum: false,
      confidenceLabel: "contagem pública medida",
    }],
    warnings: [],
    generatedAt: "2026-07-31T12:00:00.000Z",
    ...overrides,
  };
}

test("accepts and reads a complete schema version 2 response", async () => {
  const payload = audit();

  assert.equal(isAuditResponse(payload), true);
  assert.deepEqual(await readAuditApiResponse(Response.json(payload), "fallback"), payload);
});

test("rejects incompatible versions and malformed nested values", () => {
  const payload = audit();

  assert.equal(isAuditResponse({ ...payload, schemaVersion: 1 }), false);
  assert.equal(isAuditResponse({ ...payload, schemaVersion: 3 }), false);
  assert.equal(isAuditResponse({
    ...payload,
    profile: { ...payload.profile, followers: -1 },
  }), false);
  assert.equal(isAuditResponse({
    ...payload,
    sourceDiagnostics: {
      ...payload.sourceDiagnostics,
      mergedPullRequests: { reason: "rate-limit", message: "limited", retryAt: "invalid" },
    },
  }), false);
  assert.equal(isAuditResponse({
    ...payload,
    achievements: [{ ...payload.achievements[0], badgeStatus: "invented" }],
  }), false);
  assert.equal(isAuditResponse({
    ...payload,
    achievements: [{ ...payload.achievements[0], earningStatus: "retired" }],
  }), false);
  assert.equal(isAuditResponse({
    ...payload,
    achievements: [{ ...payload.achievements[0], documentationUrl: "javascript:alert(1)" }],
  }), false);
});

test("keeps runtime validation aligned with schemas that reject unknown fields", () => {
  const payload = audit();

  assert.equal(isAuditResponse({ ...payload, history: [] }), false);
  assert.equal(isAuditResponse({
    ...payload,
    profile: { ...payload.profile, privateEmail: "hidden@example.test" },
  }), false);
  assert.equal(isAuditResponse({
    ...payload,
    metrics: {
      ...payload.metrics,
      topRepository: { ...payload.metrics.topRepository, private: true },
    },
  }), false);
  assert.equal(isAuditResponse({
    ...payload,
    achievements: [{ ...payload.achievements[0], inventedCounter: 99 }],
  }), false);
  assert.equal(isAuditResponse({
    ...payload,
    achievements: [{ ...payload.achievements[0], metric: "privateCounter" }],
  }), false);
  assert.equal(isAuditResponse({ ...payload, generatedAt: "2026" }), false);
  assert.equal(isAuditResponse({ ...payload, warnings: Array(51).fill("too many") }), false);
});

test("uses a validated API error and falls back for malformed error bodies", async () => {
  assert.deepEqual(parseAuditErrorResponse({
    error: "Tente novamente mais tarde.",
    retryAt: "2026-07-31T13:00:00.000Z",
  }), {
    error: "Tente novamente mais tarde.",
    retryAt: "2026-07-31T13:00:00.000Z",
  });
  assert.equal(parseAuditErrorResponse({ error: "", retryAt: "invalid" }), null);

  await assert.rejects(
    readAuditApiResponse(
      Response.json({ error: "Perfil não encontrado." }, { status: 404 }),
      "fallback",
    ),
    /Perfil não encontrado\./,
  );
  await assert.rejects(
    readAuditApiResponse(Response.json({ detail: "failed" }, { status: 502 }), "fallback"),
    /fallback/,
  );
});

test("turns malformed success payloads into a stable user-facing failure", async () => {
  await assert.rejects(
    readAuditApiResponse(Response.json({ schemaVersion: 2 }), "fallback"),
    new Error(INCOMPATIBLE_AUDIT_RESPONSE_MESSAGE),
  );
  await assert.rejects(
    readAuditApiResponse(new Response("not-json", { status: 200 }), "fallback"),
    new Error(INCOMPATIBLE_AUDIT_RESPONSE_MESSAGE),
  );
});
