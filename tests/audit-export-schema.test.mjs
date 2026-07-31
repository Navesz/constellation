import assert from "node:assert/strict";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { auditResponseJsonSchema } from "../lib/audit-schema.ts";
import {
  AUDIT_EXPORT_SCHEMA_PATH,
  AUDIT_EXPORT_SCHEMA_URL,
  AUDIT_EXPORT_VERSION,
  LEGACY_AUDIT_EXPORT_SCHEMA_PATH,
  buildAuditDataExport,
} from "../lib/audit-export.ts";
import {
  AUDIT_EXPORT_SCHEMA_ALIAS_PATH,
  auditExportJsonSchema,
  legacyAuditExportJsonSchema,
} from "../lib/audit-export-schema.ts";

function audit(login = "octocat") {
  return {
    schemaVersion: 2,
    profile: {
      login,
      name: "The Octocat",
      bio: null,
      avatarUrl: "https://avatars.githubusercontent.com/u/583231",
      htmlUrl: `https://github.com/${login}`,
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
    achievements: [],
    warnings: [],
    generatedAt: "2026-07-31T12:00:00.000Z",
  };
}

function validator(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(auditResponseJsonSchema);
  return ajv.compile(schema);
}

test("publishes current and legacy export schemas at stable versioned paths", () => {
  assert.equal(AUDIT_EXPORT_VERSION, 2);
  assert.equal(AUDIT_EXPORT_SCHEMA_PATH, "/api/export/schema/2");
  assert.equal(LEGACY_AUDIT_EXPORT_SCHEMA_PATH, "/api/export/schema/1");
  assert.equal(AUDIT_EXPORT_SCHEMA_ALIAS_PATH, "/api/export/schema");
  assert.equal(auditExportJsonSchema.$id, AUDIT_EXPORT_SCHEMA_URL);
  assert.match(legacyAuditExportJsonSchema.$id, /\/api\/export\/schema\/1$/);
});

test("validates self-describing version 2 exports and rejects privacy drift", () => {
  const validate = validator(auditExportJsonSchema);
  const exported = buildAuditDataExport({
    audit: audit(),
    comparison: audit("hubot"),
    shareUrl: "https://example.test/?login=octocat&compare=hubot",
    exportedAt: "2026-07-31T13:00:00.000Z",
  });

  assert.equal(validate(exported), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...exported, version: 1 }), false);
  assert.equal(validate({ ...exported, $schema: "https://example.test/schema" }), false);
  assert.equal(validate({ ...exported, history: [] }), false);
  assert.equal(validate({
    ...exported,
    privacy: { ...exported.privacy, includesLocalHistory: true },
  }), false);
});

test("keeps files from export version 1 independently validatable", () => {
  const validate = validator(legacyAuditExportJsonSchema);
  const current = buildAuditDataExport({
    audit: audit(),
    shareUrl: "https://example.test/?login=octocat",
    exportedAt: "2026-07-31T13:00:00.000Z",
  });
  const legacy = { ...current };
  Reflect.deleteProperty(legacy, "$schema");
  legacy.version = 1;

  assert.equal(validate(legacy), true, JSON.stringify(validate.errors));
  assert.equal(validate(current), false);
});
