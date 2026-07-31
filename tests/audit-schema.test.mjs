import assert from "node:assert/strict";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { AUDIT_SCHEMA_VERSION } from "../lib/achievements.ts";
import {
  AUDIT_SCHEMA_LINK_HEADER,
  AUDIT_SCHEMA_PATH,
  auditResponseJsonSchema,
} from "../lib/audit-schema.ts";

test("publishes a discoverable draft 2020-12 schema for audit version 2", () => {
  assert.equal(auditResponseJsonSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(auditResponseJsonSchema.properties.schemaVersion.const, AUDIT_SCHEMA_VERSION);
  assert.equal(AUDIT_SCHEMA_PATH, "/api/audit/schema/2");
  assert.equal(
    AUDIT_SCHEMA_LINK_HEADER,
    '</api/audit/schema/2>; rel="describedby"; type="application/schema+json"',
  );
});

test("requires every top-level field consumed by the interface", () => {
  assert.deepEqual(auditResponseJsonSchema.required, [
    "schemaVersion",
    "profile",
    "metrics",
    "sources",
    "sourceDiagnostics",
    "visibleAchievementCount",
    "achievements",
    "warnings",
    "generatedAt",
  ]);
  assert.equal(auditResponseJsonSchema.additionalProperties, false);
  assert.equal(auditResponseJsonSchema.$defs.profile.additionalProperties, false);
  assert.equal(auditResponseJsonSchema.$defs.achievement.additionalProperties, false);
  assert.ok(auditResponseJsonSchema.$defs.achievement.required.includes("measurementKind"));
  assert.ok(auditResponseJsonSchema.$defs.achievement.required.includes("earningStatus"));
  assert.ok(auditResponseJsonSchema.$defs.achievement.required.includes("documentationUrl"));
});

test("compiles as JSON Schema and validates the public response shape", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(auditResponseJsonSchema);
  const response = {
    schemaVersion: 2,
    profile: {
      login: "octocat",
      name: "The Octocat",
      bio: null,
      avatarUrl: "https://avatars.githubusercontent.com/u/583231",
      htmlUrl: "https://github.com/octocat",
      followers: 18_400,
      following: 9,
      publicRepos: 8,
    },
    metrics: { mergedPullRequests: 12, topRepository: null },
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
    visibleAchievementCount: 0,
    achievements: [{
      name: "Mars 2020 Contributor",
      slug: "mars-2020-contributor",
      description: "Reconhecimento histórico.",
      nextAction: "Evento encerrado.",
      thresholds: [1],
      catalogStatus: "modeled",
      earningStatus: "historical",
      documentationUrl: "https://docs.github.com/en/account-and-profile/reference/profile-reference",
      unlocked: true,
      tier: 1,
      current: 1,
      nextThreshold: null,
      progressLabel: "reconhecimento histórico confirmado",
      badgeStatus: "visible",
      measurementKind: "confirmed-minimum",
      currentIsMinimum: true,
      confidenceLabel: "reconhecimento histórico confirmado pelo selo",
    }],
    warnings: [],
    generatedAt: "2026-07-31T12:00:00.000Z",
  };

  assert.equal(validate(response), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...response, schemaVersion: 1 }), false);
  assert.equal(validate({ ...response, schemaVersion: 3 }), false);
  assert.equal(validate({
    ...response,
    profile: { ...response.profile, followers: -1 },
  }), false);
  assert.equal(validate({ ...response, unexpected: true }), false);
  assert.equal(validate({
    ...response,
    achievements: [{ ...response.achievements[0], earningStatus: "retired" }],
  }), false);
  assert.equal(validate({
    ...response,
    achievements: [{ ...response.achievements[0], documentationUrl: "javascript:alert(1)" }],
  }), false);
});
