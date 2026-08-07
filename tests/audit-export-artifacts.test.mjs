import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIT_EXPORT_SCHEMA_URL,
  AUDIT_EXPORT_VERSION,
  buildAuditDataExport,
} from "../lib/audit-export.ts";
import { buildAuditExportArtifacts } from "../lib/audit-export-artifacts.ts";

function audit(login = "octocat") {
  return {
    schemaVersion: 2,
    profile: {
      login,
      name: login === "octocat" ? "The Octocat" : "Hubot",
      bio: "GitHub profile",
      avatarUrl: `https://avatars.githubusercontent.com/${login}`,
      htmlUrl: `https://github.com/${login}`,
      followers: 42,
      following: 3,
      publicRepos: 8,
    },
    metrics: {
      mergedPullRequests: 12,
      topRepository: null,
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
    visibleAchievementCount: 0,
    achievements: [],
    warnings: [],
    generatedAt: "2026-07-31T12:00:00.000Z",
  };
}

function parsedExport(sourceVersion = 2) {
  return {
    sourceVersion,
    data: buildAuditDataExport({
      audit: audit(),
      comparison: audit("hubot"),
      shareUrl: "https://example.test/?login=octocat&compare=hubot",
      exportedAt: "2026-07-31T13:00:00.000Z",
    }),
  };
}

test("rebuilds portable Markdown, HTML and normalized JSON from a validated export", () => {
  const artifacts = buildAuditExportArtifacts(parsedExport());

  assert.deepEqual(
    artifacts.map(({ format, filename, mimeType }) => ({ format, filename, mimeType })),
    [
      {
        format: "markdown",
        filename: "constellation-octocat-vs-hubot.md",
        mimeType: "text/markdown;charset=utf-8",
      },
      {
        format: "html",
        filename: "constellation-octocat-vs-hubot.html",
        mimeType: "text/html;charset=utf-8",
      },
      {
        format: "json",
        filename: "constellation-octocat-vs-hubot.json",
        mimeType: "application/json;charset=utf-8",
      },
    ],
  );

  const markdown = artifacts.find((artifact) => artifact.format === "markdown")?.contents ?? "";
  assert.match(markdown, /^# Constellation — @octocat/m);
  assert.match(markdown, /## Comparação com @hubot/);

  const html = artifacts.find((artifact) => artifact.format === "html")?.contents ?? "";
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /@octocat/);
  assert.match(html, /@hubot/);
  assert.doesNotMatch(html, /<script\b/i);

  const jsonArtifact = artifacts.find((artifact) => artifact.format === "json");
  assert.equal(jsonArtifact?.label, "Baixar JSON validado");
  const normalized = JSON.parse(jsonArtifact?.contents ?? "null");
  assert.equal(normalized.version, AUDIT_EXPORT_VERSION);
  assert.equal(normalized.$schema, AUDIT_EXPORT_SCHEMA_URL);
  assert.equal(normalized.exportedAt, "2026-07-31T13:00:00.000Z");
  assert.equal(normalized.primary.profile.login, "octocat");
  assert.equal(normalized.comparison.profile.login, "hubot");
  assert.deepEqual(normalized.privacy, {
    publicDataOnly: true,
    includesLocalHistory: false,
  });
  assert.equal("history" in normalized, false);
});

test("offers a current-version replacement for a validated legacy export", () => {
  const artifacts = buildAuditExportArtifacts(parsedExport(1));
  const jsonArtifact = artifacts.find((artifact) => artifact.format === "json");

  assert.equal(jsonArtifact?.label, "Atualizar para JSON v2");
  assert.equal(JSON.parse(jsonArtifact?.contents ?? "null").version, 2);
});
