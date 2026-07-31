import { selectNextMission, type AchievementProgress, type AuditResponse } from "./achievements.ts";
import { buildAuditEvidenceSources } from "./audit-sources.ts";
import { constellationExportFilename } from "./export-filename.ts";
import { compareProfiles } from "./profile-comparison.ts";

export type AuditReportOptions = {
  audit: AuditResponse;
  comparison?: AuditResponse | null;
  shareUrl: string;
};

const numberFormatter = new Intl.NumberFormat("pt-BR");

function escapeMarkdown(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/[\r\n]+/g, " ")
    .replace(/([|`*_\[\]<>])/g, "\\$1")
    .trim();
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
  if (Number.isNaN(date.getTime())) return escapeMarkdown(value);
  return `${date.toISOString().replace("T", " ").replace(".000Z", " UTC")}`;
}

function achievementStatus(achievement: AchievementProgress) {
  if (achievement.badgeStatus === "unavailable") return "fonte indisponível";
  if (achievement.earningStatus === "historical") {
    return achievement.unlocked ? "histórica · visível" : "histórica · evento encerrado";
  }
  if (achievement.unlocked) return `visível · nível ${achievement.tier}`;
  return "não visível no perfil";
}

function reportAchievement(achievement: AchievementProgress) {
  const details = [
    achievementStatus(achievement),
    escapeMarkdown(achievement.progressLabel),
    escapeMarkdown(achievement.confidenceLabel),
  ];
  const documentation = achievement.documentationUrl
    ? ` · [fonte oficial](${achievement.documentationUrl})`
    : "";
  return `- **${escapeMarkdown(achievement.name)}** — ${details.join(" · ")}${documentation}`;
}

function appendEvidenceTable(lines: string[], audit: AuditResponse, heading: string) {
  lines.push(
    "",
    heading,
    "",
    "| Fonte | Método | Estado | Resultado | Evidência |",
    "| --- | --- | --- | --- | --- |",
    ...buildAuditEvidenceSources(audit).map((source) => (
      `| ${escapeMarkdown(source.label)} | ${escapeMarkdown(source.method)} | ${source.status === "available" ? "disponível" : "indisponível"} | ${escapeMarkdown(source.result)} | [${escapeMarkdown(source.urlLabel)}](${source.url}) |`
    )),
  );
}

export function auditReportFilename(login: string, comparisonLogin?: string | null) {
  return constellationExportFilename(login, comparisonLogin, "md");
}

export function buildAuditMarkdown({ audit, comparison, shareUrl }: AuditReportOptions) {
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
  const lines = [
    `# Constellation — @${escapeMarkdown(profile.login)}`,
    "",
    `> Auditoria de sinais públicos gerada em ${formatGeneratedAt(audit.generatedAt)}. O histórico local do navegador não está incluído.`,
    "",
    `[Ver perfil no GitHub](${profile.htmlUrl}) · [Abrir auditoria no Constellation](${shareUrl})`,
    "",
    "## Sinais públicos",
    "",
    "| Sinal | Valor |",
    "| --- | ---: |",
    `| Conquistas visíveis | ${formatNumber(visibleAchievements)} |`,
    `| PRs públicos mesclados | ${formatNumber(mergedPullRequests)} |`,
    `| Estrelas no melhor projeto | ${formatNumber(topRepositoryStars)} |`,
    `| Repositórios públicos | ${formatNumber(profile.publicRepos)} |`,
    `| Seguidores | ${formatNumber(profile.followers)} |`,
    `| Seguindo | ${formatNumber(profile.following)} |`,
  ];

  if (sources.repositories === "available" && metrics.topRepository) {
    lines.push(
      "",
      "## Projeto com mais estrelas",
      "",
      `### [${escapeMarkdown(metrics.topRepository.name)}](${metrics.topRepository.url})`,
      "",
      `${numberFormatter.format(metrics.topRepository.stars)} estrelas · ${numberFormatter.format(metrics.topRepository.forks)} forks`,
    );
    if (metrics.topRepository.description) {
      lines.push("", escapeMarkdown(metrics.topRepository.description));
    }
  }

  appendEvidenceTable(lines, audit, "## Fontes e método");

  lines.push("", "## Conquistas", "");
  if (audit.achievements.length > 0) {
    lines.push(...audit.achievements.map(reportAchievement));
  } else if (sources.achievements === "unavailable") {
    lines.push("A fonte de conquistas estava indisponível nesta leitura.");
  } else {
    lines.push("Nenhuma conquista estava visível no perfil nesta leitura.");
  }

  lines.push("", "## Próxima missão", "");
  if (mission) {
    lines.push(
      `**${escapeMarkdown(mission.name)}** — ${escapeMarkdown(mission.progressLabel)}`,
      "",
      `Próximo marco: ${numberFormatter.format(mission.nextThreshold)}. ${escapeMarkdown(mission.nextAction)}`,
      "",
      `_Confiança da leitura: ${escapeMarkdown(mission.confidenceLabel)}._`,
    );
  } else {
    lines.push("Não há uma missão comparável baseada em sinais públicos disponíveis nesta leitura.");
  }

  if (comparison) {
    const comparisonResult = compareProfiles(audit, comparison);
    lines.push(
      "",
      `## Comparação com @${escapeMarkdown(comparison.profile.login)}`,
      "",
      `Delta calculado como @${escapeMarkdown(comparison.profile.login)} − @${escapeMarkdown(profile.login)}.`,
      "",
      `| Sinal | @${escapeMarkdown(profile.login)} | @${escapeMarkdown(comparison.profile.login)} | Delta |`,
      "| --- | ---: | ---: | ---: |",
      ...comparisonResult.metrics.map((metric) =>
        `| ${escapeMarkdown(metric.label)} | ${formatNumber(metric.primary)} | ${formatNumber(metric.secondary)} | ${formatDifference(metric.difference)} |`
      ),
      "",
      `Conquistas visíveis em comum: **${numberFormatter.format(comparisonResult.sharedUnlocked)}**. `
        + `Exclusivas de @${escapeMarkdown(profile.login)}: **${numberFormatter.format(comparisonResult.primaryOnlyUnlocked.length)}**. `
        + `Exclusivas de @${escapeMarkdown(comparison.profile.login)}: **${numberFormatter.format(comparisonResult.secondaryOnlyUnlocked.length)}**.`,
    );
    appendEvidenceTable(
      lines,
      comparison,
      `### Fontes de @${escapeMarkdown(comparison.profile.login)}`,
    );
  }

  if (warnings.length > 0) {
    lines.push(
      "",
      "## Limites desta leitura",
      "",
      ...warnings.map((warning) => `- ${escapeMarkdown(warning)}`),
    );
  }

  lines.push(
    "",
    "---",
    "",
    "O GitHub não oferece uma API oficial de conquistas. O Constellation usa somente dados e selos públicos, preserva lacunas como indisponíveis e não inclui a linha do tempo armazenada localmente no navegador.",
    "",
  );

  return lines.join("\n");
}
