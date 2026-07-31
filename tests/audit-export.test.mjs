import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIT_EXPORT_FORMAT,
  AUDIT_EXPORT_VERSION,
  auditDataFilename,
  buildAuditDataExport,
  serializeAuditDataExport,
} from "../lib/audit-export.ts";

function audit(login = "octocat") {
  return {
    schemaVersion: 1,
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
