import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIT_EXPORT_FORMAT,
  AUDIT_EXPORT_SCHEMA_URL,
  AUDIT_EXPORT_VERSION,
  INVALID_AUDIT_EXPORT_MESSAGE,
  auditDataFilename,
  buildAuditDataExport,
  buildAuditShareUrl,
  isOfficialAuditShareUrl,
  parseAuditDataExport,
  readAuditDataExport,
  serializeAuditDataExport,
} from "../lib/audit-export.ts";

function audit(login = "octocat") {
  return {
    schemaVersion: 2,
    profile: {
      login,
      name: "The Octocat",
      bio: "GitHub mascot",
      avatarUrl: "https://avatars.githubusercontent.com/u/583231",
      htmlUrl: `https://github.com/${login}`,
      followers: 18_400,
      following: 9,
      publicRepos: 8,
    },
    metrics: {
      mergedPullRequests: null,
      topRepository: null,
    },
    sources: {
      achievements: "available",
      mergedPullRequests: "unavailable",
      repositories: "available",
    },
    sourceDiagnostics: {
      achievements: null,
      mergedPullRequests: {
        reason: "timeout",
        message: "A consulta excedeu o prazo de 8 segundos.",
      },
      repositories: null,
    },
    visibleAchievementCount: 0,
    achievements: [],
    warnings: ["A busca de PRs excedeu o prazo."],
    generatedAt: "2026-07-31T12:00:00.000Z",
  };
}

test("builds a versioned public-data envelope without local history", () => {
  const exportedAt = "2026-07-31T12:34:56.000Z";
  const primary = audit();
  const payload = buildAuditDataExport({
    audit: primary,
    shareUrl: "https://example.test/?login=octocat",
    exportedAt,
  });

  assert.equal(payload.format, AUDIT_EXPORT_FORMAT);
  assert.equal(payload.$schema, AUDIT_EXPORT_SCHEMA_URL);
  assert.equal(payload.version, AUDIT_EXPORT_VERSION);
  assert.equal(payload.exportedAt, exportedAt);
  assert.equal(payload.shareUrl, "https://example.test/?login=octocat");
  assert.deepEqual(payload.privacy, {
    publicDataOnly: true,
    includesLocalHistory: false,
  });
  assert.deepEqual(payload.primary, primary);
  assert.equal(payload.comparison, null);
  assert.equal("history" in payload, false);
  assert.equal("timeline" in payload, false);
});

test("preserves comparison, source diagnostics and null measurements", () => {
  const primary = audit();
  const comparison = audit("hubot");
  const serialized = serializeAuditDataExport({
    audit: primary,
    comparison,
    shareUrl: "https://example.test/?login=octocat&compare=hubot",
    exportedAt: "2026-07-31T13:00:00.000Z",
  });
  const payload = JSON.parse(serialized);

  assert.equal(serialized.endsWith("\n"), true);
  assert.deepEqual(payload.primary.sourceDiagnostics, primary.sourceDiagnostics);
  assert.equal(payload.primary.metrics.mergedPullRequests, null);
  assert.deepEqual(payload.comparison, comparison);
});

test("creates stable, sanitized JSON filenames", () => {
  assert.equal(auditDataFilename("Octo_Cat", "Hub Bot"), "constellation-octo-cat-vs-hub-bot.json");
  assert.equal(auditDataFilename("***"), "constellation-perfil.json");
});

test("builds canonical share routes without inherited path, query or fragment", () => {
  assert.equal(
    buildAuditShareUrl(
      "https://example.test/docs?utm_source=old#section",
      "OctoCat",
      "Hubot",
    ),
    "https://example.test/?login=OctoCat&compare=Hubot",
  );
  assert.equal(
    buildAuditShareUrl("http://localhost:3000/anything", "octocat"),
    "http://localhost:3000/?login=octocat",
  );
  assert.throws(() => buildAuditShareUrl("javascript:alert(1)", "octocat"));
  assert.throws(() => buildAuditShareUrl("https://example.test", "-invalid"));
  assert.throws(() => buildAuditDataExport({
    audit: audit(),
    shareUrl: "https://example.test/?login=someone-else",
  }));
});

test("identifies only the deployed Constellation origin as official", () => {
  assert.equal(isOfficialAuditShareUrl(AUDIT_EXPORT_SCHEMA_URL.replace("/api/export/schema/2", "/?login=octocat")), true);
  assert.equal(isOfficialAuditShareUrl("http://localhost:3000/?login=octocat"), false);
  assert.equal(isOfficialAuditShareUrl("https://example.test/?login=octocat"), false);
  assert.equal(isOfficialAuditShareUrl("not a URL"), false);
});

test("reads and normalizes self-describing version 2 exports", () => {
  const primary = audit();
  const comparison = audit("hubot");
  const exported = buildAuditDataExport({
    audit: primary,
    comparison,
    shareUrl: "https://example.test/?login=octocat&compare=hubot",
    exportedAt: "2026-07-31T13:00:00.000Z",
  });
  const parsed = parseAuditDataExport(exported);

  assert.equal(parsed?.sourceVersion, 2);
  assert.deepEqual(parsed?.data, exported);
  assert.deepEqual(
    readAuditDataExport(`\uFEFF${JSON.stringify(exported)}`),
    parsed,
  );
});

test("requires comparison routes to match both embedded profiles", () => {
  const exported = buildAuditDataExport({
    audit: audit(),
    comparison: audit("hubot"),
    shareUrl: "https://example.test/?login=octocat&compare=hubot",
    exportedAt: "2026-07-31T13:00:00.000Z",
  });

  assert.notEqual(parseAuditDataExport(exported), null);
  assert.equal(parseAuditDataExport({
    ...exported,
    shareUrl: "https://example.test/?login=octocat",
  }), null);
  assert.equal(parseAuditDataExport({
    ...exported,
    shareUrl: "https://example.test/?login=octocat&compare=wrong-user",
  }), null);
});

test("reads legacy version 1 files and normalizes them to the current contract", () => {
  const current = buildAuditDataExport({
    audit: audit(),
    shareUrl: "https://example.test/?login=octocat",
    exportedAt: "2026-07-31T13:00:00.000Z",
  });
  const legacy = { ...current, version: 1 };
  Reflect.deleteProperty(legacy, "$schema");
  const parsed = parseAuditDataExport(legacy);

  assert.equal(parsed?.sourceVersion, 1);
  assert.equal(parsed?.data.version, AUDIT_EXPORT_VERSION);
  assert.equal(parsed?.data.$schema, AUDIT_EXPORT_SCHEMA_URL);
  assert.deepEqual(parsed?.data.primary, current.primary);
});

test("rejects malformed, private or extended export envelopes", () => {
  const current = buildAuditDataExport({
    audit: audit(),
    shareUrl: "https://example.test/?login=octocat",
    exportedAt: "2026-07-31T13:00:00.000Z",
  });

  assert.equal(parseAuditDataExport({ ...current, history: [] }), null);
  assert.equal(parseAuditDataExport({ ...current, $schema: "https://example.test/schema" }), null);
  assert.equal(parseAuditDataExport({ ...current, shareUrl: "javascript:alert(1)" }), null);
  assert.equal(parseAuditDataExport({ ...current, shareUrl: "https://example.test/?login=hubot" }), null);
  assert.equal(parseAuditDataExport({ ...current, shareUrl: "https://example.test/docs?login=octocat" }), null);
  assert.equal(parseAuditDataExport({ ...current, shareUrl: "https://example.test/?login=octocat&next=phishing" }), null);
  assert.equal(parseAuditDataExport({ ...current, shareUrl: "https://example.test/?login=octocat#redirect" }), null);
  assert.equal(parseAuditDataExport({ ...current, shareUrl: "https://user:secret@example.test/?login=octocat" }), null);
  assert.equal(parseAuditDataExport({ ...current, shareUrl: "https://example.test/?login=octocat&login=octocat" }), null);
  assert.equal(parseAuditDataExport({
    ...current,
    privacy: { publicDataOnly: true, includesLocalHistory: true },
  }), null);
  assert.equal(parseAuditDataExport({
    ...current,
    primary: { ...current.primary, privateEmail: "hidden@example.test" },
  }), null);
  assert.throws(
    () => readAuditDataExport("{not-json"),
    new Error(INVALID_AUDIT_EXPORT_MESSAGE),
  );
});
