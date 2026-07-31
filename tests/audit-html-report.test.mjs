import assert from "node:assert/strict";
import test from "node:test";
import { auditHtmlReportFilename, buildAuditHtml } from "../lib/audit-html-report.ts";

function achievement(overrides = {}) {
  return {
    name: "Pull Shark",
    slug: "pull-shark",
    description: "Mescle pull requests.",
    nextAction: "Continue colaborando em mudanças reais.",
    thresholds: [2, 16],
    catalogStatus: "modeled",
    earningStatus: "active",
    documentationUrl: null,
    unlocked: true,
    tier: 1,
    current: 4,
    nextThreshold: 16,
    progressLabel: "4 medidos",
    badgeStatus: "visible",
    measurementKind: "measured",
    currentIsMinimum: false,
    confidenceLabel: "contagem pública medida",
    ...overrides,
  };
}

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
        description: "A portable project",
        stars: 2_700,
        forks: 3_100,
        url: "https://github.com/octocat/Hello-World",
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
    visibleAchievementCount: 2,
    achievements: [achievement()],
    warnings: [],
    generatedAt: "2026-07-30T12:34:56.000Z",
    ...overrides,
  };
}

test("builds a self-contained, printable HTML report", () => {
  const html = buildAuditHtml({
    audit: audit(),
    shareUrl: "https://example.test/?login=octocat",
  });

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /<title>Constellation — @octocat<\/title>/);
  assert.match(html, /The Octocat/);
  assert.match(html, /PRs públicos mesclados[\s\S]*12/);
  assert.match(html, /hello-world/);
  assert.match(html, /Pull Shark/);
  assert.match(html, /critério catalogado; recurso do GitHub em prévia pública/);
  assert.match(html, /Catálogo revisto em 2026-07-31/);
  assert.match(html, /Próximo marco: 16/);
  assert.match(html, /Fontes e método/);
  assert.match(html, /@media print/);
  assert.match(html, /histórico local do navegador não está incluído/);
  assert.match(html, /não executa scripts nem carrega recursos externos/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /<img\b/i);
});

test("includes comparisons while preserving unavailable values", () => {
  const html = buildAuditHtml({
    audit: audit(),
    comparison: audit({
      profile: { ...audit().profile, login: "hubot", followers: 19_000, publicRepos: 11 },
      metrics: { mergedPullRequests: null, topRepository: { ...audit().metrics.topRepository, stars: 3_000 } },
      sources: { ...audit().sources, mergedPullRequests: "unavailable" },
      visibleAchievementCount: 3,
      achievements: [achievement(), achievement({ name: "Quickdraw", slug: "quickdraw" })],
      warnings: ["A busca de PRs falhou."],
    }),
    shareUrl: "https://example.test/?login=octocat&compare=hubot",
  });

  assert.match(html, /@octocat × @hubot/);
  assert.match(html, /Delta calculado como @hubot − @octocat/);
  assert.match(html, /PRs públicos mesclados[\s\S]*indisponível/);
  assert.match(html, /\+600/);
  assert.match(html, /Exclusivas de @hubot: <strong>1<\/strong>/);
  assert.match(html, /Fontes de @hubot/);
  assert.match(html, /Comparação @hubot: A busca de PRs falhou\./);
});

test("escapes hostile content and rejects unsafe links", () => {
  const attack = "</style><script>alert('orbit')</script>";
  const html = buildAuditHtml({
    audit: audit({
      profile: {
        ...audit().profile,
        login: `octo${attack}`,
        name: attack,
        bio: `bio ${attack}`,
        htmlUrl: "javascript:alert(1)",
      },
      metrics: {
        ...audit().metrics,
        topRepository: {
          ...audit().metrics.topRepository,
          name: attack,
          description: attack,
          url: "data:text/html,unsafe",
        },
      },
      achievements: [achievement({
        name: attack,
        description: attack,
        documentationUrl: "javascript:alert(1)",
      })],
      warnings: [attack],
    }),
    shareUrl: "javascript:alert(1)",
  });

  assert.match(html, /&lt;script&gt;alert\(&#39;orbit&#39;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /data:text\/html/i);
});

test("creates stable, sanitized HTML report filenames", () => {
  assert.equal(auditHtmlReportFilename("Octo_Cat", "Hub Bot"), "constellation-octo-cat-vs-hub-bot.html");
  assert.equal(auditHtmlReportFilename("***"), "constellation-perfil.html");
});
