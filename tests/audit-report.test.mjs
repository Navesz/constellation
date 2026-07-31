import assert from "node:assert/strict";
import test from "node:test";
import { auditReportFilename, buildAuditMarkdown } from "../lib/audit-report.ts";

function achievement(overrides = {}) {
  return {
    name: "Pull Shark",
    slug: "pull-shark",
    description: "Mescle pull requests.",
    nextAction: "Continue colaborando em mudanças reais.",
    thresholds: [2, 16],
    catalogStatus: "modeled",
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
        description: "A repository | with a table-breaking description",
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
    visibleAchievementCount: 2,
    achievements: [achievement()],
    warnings: [],
    generatedAt: "2026-07-30T12:34:56.000Z",
    ...overrides,
  };
}

test("builds a portable report with public signals, repository, achievements and mission", () => {
  const markdown = buildAuditMarkdown({
    audit: audit(),
    shareUrl: "https://example.test/?login=octocat",
  });

  assert.match(markdown, /^# Constellation — @octocat/m);
  assert.match(markdown, /\| PRs públicos mesclados \| 12 \|/);
  assert.match(markdown, /\| Estrelas no melhor projeto \| 2\.700 \|/);
  assert.match(markdown, /### \[hello-world\]\(https:\/\/github\.com\/octocat\/Hello-World\)/);
  assert.match(markdown, /A repository \\\| with a table-breaking description/);
  assert.match(markdown, /\*\*Pull Shark\*\* — visível · nível 1 · 4 medidos/);
  assert.match(markdown, /Próximo marco: 16\./);
  assert.match(markdown, /histórico local do navegador não está incluído/);
  assert.match(markdown, /\[Abrir auditoria no Constellation\]\(https:\/\/example\.test\/\?login=octocat\)/);
  assert.match(markdown, /## Fontes e método/);
  assert.match(markdown, /\| Perfil público \| API pública de usuários \| disponível \|/);
});

test("preserves unavailable and private progress instead of inventing zeroes", () => {
  const markdown = buildAuditMarkdown({
    audit: audit({
      metrics: { mergedPullRequests: null, topRepository: null },
      sources: {
        achievements: "unavailable",
        mergedPullRequests: "unavailable",
        repositories: "unavailable",
      },
      visibleAchievementCount: null,
      achievements: [achievement({
        unlocked: false,
        tier: 0,
        current: null,
        nextThreshold: null,
        progressLabel: "progresso não público",
        badgeStatus: "unavailable",
        measurementKind: "unavailable",
        confidenceLabel: "fonte indisponível",
      })],
      warnings: ["A busca de PRs | falhou temporariamente."],
    }),
    shareUrl: "https://example.test/?login=octocat",
  });

  assert.match(markdown, /\| Conquistas visíveis \| indisponível \|/);
  assert.match(markdown, /\| PRs públicos mesclados \| indisponível \|/);
  assert.match(markdown, /\| Estrelas no melhor projeto \| indisponível \|/);
  assert.doesNotMatch(markdown, /PRs públicos mesclados \| 0/);
  assert.match(markdown, /fonte indisponível · progresso não público/);
  assert.match(markdown, /Não há uma missão comparável/);
  assert.match(markdown, /A busca de PRs \\\| falhou temporariamente\./);
});

test("includes an honest comparison and omits deltas for unavailable signals", () => {
  const markdown = buildAuditMarkdown({
    audit: audit(),
    comparison: audit({
      profile: { ...audit().profile, login: "hubot", publicRepos: 11 },
      metrics: { mergedPullRequests: null, topRepository: { ...audit().metrics.topRepository, stars: 3_000 } },
      sources: { ...audit().sources, mergedPullRequests: "unavailable" },
      visibleAchievementCount: 3,
      achievements: [achievement(), achievement({ name: "Quickdraw", slug: "quickdraw" })],
      warnings: ["A busca de PRs falhou."],
    }),
    shareUrl: "https://example.test/?login=octocat&compare=hubot",
  });

  assert.match(markdown, /## Comparação com @hubot/);
  assert.match(markdown, /Delta calculado como @hubot − @octocat/);
  assert.match(markdown, /\| conquistas visíveis \| 2 \| 3 \| \+1 \|/);
  assert.match(markdown, /\| PRs públicos mesclados \| 12 \| indisponível \| indisponível \|/);
  assert.match(markdown, /\| repositórios públicos \| 8 \| 11 \| \+3 \|/);
  assert.match(markdown, /Conquistas visíveis em comum: \*\*1\*\*/);
  assert.match(markdown, /Exclusivas de @hubot: \*\*1\*\*/);
  assert.match(markdown, /Comparação @hubot: A busca de PRs falhou\./);
  assert.match(markdown, /### Fontes de @hubot/);
  assert.match(markdown, /\| PRs mesclados \| Busca pública de issues e pull requests \| indisponível \|/);
});

test("creates stable, sanitized report filenames", () => {
  assert.equal(auditReportFilename("Octo_Cat", "Hub Bot"), "constellation-octo-cat-vs-hub-bot.md");
  assert.equal(auditReportFilename("***"), "constellation-perfil.md");
});
