import { selectNextMission, type AchievementProgress, type AuditResponse } from "./achievements.ts";
import { buildAuditEvidenceSources } from "./audit-sources.ts";
import { constellationExportFilename } from "./export-filename.ts";
import { githubAchievementDetailUrl } from "./github-profile.ts";
import { compareProfiles } from "./profile-comparison.ts";
import type { AuditReportOptions } from "./audit-report.ts";

const numberFormatter = new Intl.NumberFormat("pt-BR");

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeWebUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? escapeHtml(url.toString())
      : null;
  } catch {
    return null;
  }
}

function link(label: string, url: string) {
  const safeUrl = safeWebUrl(url);
  return safeUrl
    ? `<a href="${safeUrl}" rel="noreferrer noopener">${escapeHtml(label)}</a>`
    : `<span>${escapeHtml(label)}</span>`;
}

function formatNumber(value: number | null) {
  return value === null ? "indisponível" : numberFormatter.format(value);
}

function formatDifference(value: number | null) {
  if (value === null) return "indisponível";
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${numberFormatter.format(Math.abs(value))}`;
}

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function achievementStatus(achievement: AchievementProgress) {
  if (achievement.badgeStatus === "unavailable") return "fonte indisponível";
  if (achievement.earningStatus === "historical") {
    return achievement.unlocked ? "histórica · visível" : "histórica · evento encerrado";
  }
  if (achievement.unlocked) return `visível · nível ${achievement.tier}`;
  return "não visível no perfil";
}

function renderMetric(label: string, value: number | null) {
  return `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatNumber(value))}</strong></article>`;
}

function renderEvidenceTable(audit: AuditResponse, heading: string) {
  const rows = buildAuditEvidenceSources(audit).map((source) => `
          <tr>
            <th scope="row">${escapeHtml(source.label)}</th>
            <td>${escapeHtml(source.method)}</td>
            <td><span class="status status-${source.status}">${source.status === "available" ? "disponível" : "indisponível"}</span></td>
            <td>${escapeHtml(source.result)}</td>
            <td>${link(source.urlLabel, source.url)}</td>
          </tr>`).join("");

  return `
      <section>
        <h2>${escapeHtml(heading)}</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Fonte</th><th>Método</th><th>Estado</th><th>Resultado</th><th>Evidência</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>`;
}

function renderAchievement(achievement: AchievementProgress, profileLogin: string) {
  const eventUrl = achievement.unlocked
    ? githubAchievementDetailUrl(profileLogin, achievement.slug)
    : null;
  const links = [
    eventUrl ? link("eventos no GitHub", eventUrl) : null,
    achievement.documentationUrl ? link("fonte oficial", achievement.documentationUrl) : null,
  ].filter(Boolean).join(" · ");

  return `
          <article class="achievement">
            <div class="achievement-heading">
              <h3>${escapeHtml(achievement.name)}</h3>
              <span>${escapeHtml(achievementStatus(achievement))}</span>
            </div>
            <p>${escapeHtml(achievement.description)}</p>
            <dl>
              <div><dt>Progresso</dt><dd>${escapeHtml(achievement.progressLabel)}</dd></div>
              <div><dt>Confiança</dt><dd>${escapeHtml(achievement.confidenceLabel)}</dd></div>
            </dl>
            ${links ? `<p class="links">${links}</p>` : ""}
          </article>`;
}

export function auditHtmlReportFilename(login: string, comparisonLogin?: string | null) {
  return constellationExportFilename(login, comparisonLogin, "html");
}

export function buildAuditHtml({ audit, comparison, shareUrl }: AuditReportOptions) {
  const { profile, sources, metrics } = audit;
  const mission = selectNextMission(audit.achievements);
  const visibleAchievements = sources.achievements === "available"
    ? audit.visibleAchievementCount
    : null;
  const mergedPullRequests = sources.mergedPullRequests === "available"
    ? metrics.mergedPullRequests
    : null;
  const topRepositoryStars = sources.repositories === "available"
    ? metrics.topRepository?.stars ?? 0
    : null;
  const warnings = [
    ...audit.warnings,
    ...(comparison?.warnings.map((warning) => `Comparação @${comparison.profile.login}: ${warning}`) ?? []),
  ];
  const achievements = audit.achievements.length > 0
    ? audit.achievements.map((achievement) => renderAchievement(achievement, profile.login)).join("")
    : `<p>${sources.achievements === "unavailable"
      ? "A fonte de conquistas estava indisponível nesta leitura."
      : "Nenhuma conquista estava visível no perfil nesta leitura."}</p>`;
  const profileName = profile.name
    ? `<p class="profile-name">${escapeHtml(profile.name)}</p>`
    : "";
  const profileBio = profile.bio
    ? `<p class="profile-bio">${escapeHtml(profile.bio)}</p>`
    : "";
  const repository = sources.repositories === "available" && metrics.topRepository
    ? `
      <section>
        <p class="eyebrow">projeto com mais estrelas</p>
        <h2>${link(metrics.topRepository.name, metrics.topRepository.url)}</h2>
        <p><strong>${escapeHtml(formatNumber(metrics.topRepository.stars))}</strong> estrelas · <strong>${escapeHtml(formatNumber(metrics.topRepository.forks))}</strong> forks</p>
        ${metrics.topRepository.description ? `<p>${escapeHtml(metrics.topRepository.description)}</p>` : ""}
      </section>`
    : "";
  const missionSection = mission
    ? `
        <article class="mission">
          <h3>${escapeHtml(mission.name)}</h3>
          <p><strong>${escapeHtml(mission.progressLabel)}</strong></p>
          <p>Próximo marco: ${escapeHtml(formatNumber(mission.nextThreshold))}. ${escapeHtml(mission.nextAction)}</p>
          <small>Confiança da leitura: ${escapeHtml(mission.confidenceLabel)}.</small>
        </article>`
    : "<p>Não há uma missão comparável baseada em sinais públicos disponíveis nesta leitura.</p>";
  let comparisonSection = "";

  if (comparison) {
    const result = compareProfiles(audit, comparison);
    const metricRows = result.metrics.map((metric) => `
            <tr>
              <th scope="row">${escapeHtml(metric.label)}</th>
              <td>${escapeHtml(formatNumber(metric.primary))}</td>
              <td>${escapeHtml(formatNumber(metric.secondary))}</td>
              <td>${escapeHtml(formatDifference(metric.difference))}</td>
            </tr>`).join("");
    comparisonSection = `
      <section>
        <p class="eyebrow">comparação</p>
        <h2>@${escapeHtml(profile.login)} × @${escapeHtml(comparison.profile.login)}</h2>
        <p>Delta calculado como @${escapeHtml(comparison.profile.login)} − @${escapeHtml(profile.login)}.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Sinal</th><th>@${escapeHtml(profile.login)}</th><th>@${escapeHtml(comparison.profile.login)}</th><th>Delta</th></tr></thead>
            <tbody>${metricRows}</tbody>
          </table>
        </div>
        <p>Conquistas visíveis em comum: <strong>${escapeHtml(formatNumber(result.sharedUnlocked))}</strong>. Exclusivas de @${escapeHtml(profile.login)}: <strong>${escapeHtml(formatNumber(result.primaryOnlyUnlocked.length))}</strong>. Exclusivas de @${escapeHtml(comparison.profile.login)}: <strong>${escapeHtml(formatNumber(result.secondaryOnlyUnlocked.length))}</strong>.</p>
      </section>
      ${renderEvidenceTable(comparison, `Fontes de @${comparison.profile.login}`)}`;
  }

  const warningsSection = warnings.length > 0
    ? `
      <section>
        <h2>Limites desta leitura</h2>
        <ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>
      </section>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Constellation — @${escapeHtml(profile.login)}</title>
  <style>
    :root { color-scheme: light; --ink: #17201d; --muted: #5f6c66; --line: #cbd5d0; --paper: #f5f3ea; --card: #fffef8; --accent: #32654b; --warn: #7f3f24; }
    * { box-sizing: border-box; }
    body { margin: 0; color: var(--ink); background: var(--paper); font: 16px/1.55 ui-sans-serif, system-ui, sans-serif; }
    main { width: min(1040px, calc(100% - 32px)); margin: 0 auto; padding: 64px 0; }
    header, section { padding: 28px 0; border-bottom: 1px solid var(--line); }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin-bottom: 4px; font-size: clamp(2.2rem, 7vw, 5rem); letter-spacing: -0.06em; line-height: .95; }
    h2 { margin-bottom: 18px; font-size: 1.55rem; }
    h3 { margin-bottom: 6px; }
    a { color: var(--accent); text-underline-offset: 3px; }
    .eyebrow, dt { color: var(--muted); font-size: .72rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    .profile-name { margin: 12px 0 0; font-size: 1.25rem; font-weight: 700; }
    .profile-bio { max-width: 680px; color: var(--muted); }
    .lead { max-width: 760px; color: var(--muted); }
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; overflow: hidden; border: 1px solid var(--line); background: var(--line); }
    .metric { min-height: 120px; padding: 18px; background: var(--card); }
    .metric span { display: block; min-height: 44px; color: var(--muted); }
    .metric strong { display: block; font-size: 1.8rem; }
    .achievements { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .achievement, .mission { break-inside: avoid; padding: 20px; border: 1px solid var(--line); background: var(--card); }
    .achievement-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    .achievement-heading span { color: var(--muted); font-size: .78rem; }
    dl { margin-bottom: 0; }
    dl div { display: grid; grid-template-columns: 110px 1fr; gap: 12px; margin-top: 7px; }
    dd { margin: 0; }
    .links { margin: 14px 0 0; font-size: .85rem; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    th, td { padding: 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    thead th { color: var(--muted); font-size: .7rem; letter-spacing: .08em; text-transform: uppercase; }
    .status { white-space: nowrap; }
    .status-unavailable { color: var(--warn); }
    footer { padding-top: 28px; color: var(--muted); font-size: .85rem; }
    @media (max-width: 720px) { .metrics, .achievements { grid-template-columns: 1fr; } .achievement-heading { display: block; } }
    @media print { body { background: white; font-size: 11pt; } main { width: 100%; padding: 0; } a { color: inherit; } .metrics { grid-template-columns: repeat(3, 1fr); } section { break-before: auto; } }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="eyebrow">auditoria de sinais públicos</p>
      <h1>@${escapeHtml(profile.login)}</h1>
      ${profileName}
      ${profileBio}
      <p class="lead">Gerada em ${escapeHtml(formatGeneratedAt(audit.generatedAt))}. O histórico local do navegador não está incluído.</p>
      <p>${link("Ver perfil no GitHub", profile.htmlUrl)} · ${link("Abrir auditoria no Constellation", shareUrl)}</p>
    </header>
    <section>
      <h2>Sinais públicos</h2>
      <div class="metrics">
        ${renderMetric("Conquistas visíveis", visibleAchievements)}
        ${renderMetric("PRs públicos mesclados", mergedPullRequests)}
        ${renderMetric("Estrelas no melhor projeto", topRepositoryStars)}
        ${renderMetric("Repositórios públicos", profile.publicRepos)}
        ${renderMetric("Seguidores", profile.followers)}
        ${renderMetric("Seguindo", profile.following)}
      </div>
    </section>
    ${repository}
    ${renderEvidenceTable(audit, "Fontes e método")}
    <section>
      <h2>Conquistas</h2>
      <div class="achievements">${achievements}</div>
    </section>
    <section>
      <h2>Próxima missão</h2>
      ${missionSection}
    </section>
    ${comparisonSection}
    ${warningsSection}
    <footer>O GitHub não oferece uma API oficial de conquistas. O Constellation usa somente dados e selos públicos, preserva lacunas como indisponíveis e não inclui a linha do tempo armazenada localmente no navegador. Este arquivo é autocontido: não executa scripts nem carrega recursos externos.</footer>
  </main>
</body>
</html>
`;
}
