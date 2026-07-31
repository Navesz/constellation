import type { AuditResponse, AuditSourceAvailability } from "./achievements";
import { formatGitHubRetryAt } from "./github-request.ts";

export type AuditEvidenceSource = {
  id: "profile" | "achievements" | "mergedPullRequests" | "repositories";
  label: string;
  method: string;
  detail: string;
  status: AuditSourceAvailability;
  result: string;
  url: string;
  urlLabel: string;
};

function githubSearchUrl(path: "issues" | "repositories", parameters: Record<string, string>) {
  const url = new URL(`https://api.github.com/search/${path}`);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url.toString();
}

function countResult(value: number | null, singular: string, plural: string) {
  if (value === null) return "contagem não retornada";
  return `${value.toLocaleString("pt-BR")} ${value === 1 ? singular : plural}`;
}

function unavailableResult(
  audit: AuditResponse,
  source: "achievements" | "mergedPullRequests" | "repositories",
) {
  const diagnostic = audit.sourceDiagnostics?.[source];
  if (!diagnostic) return "leitura indisponível";

  const retryLabel = diagnostic.retryAt ? formatGitHubRetryAt(diagnostic.retryAt) : null;
  return `indisponível · ${diagnostic.message}${retryLabel ? ` · tente novamente após ${retryLabel}` : ""}`;
}

export function buildAuditEvidenceSources(audit: AuditResponse): AuditEvidenceSource[] {
  const login = audit.profile.login;
  const encodedLogin = encodeURIComponent(login);

  return [
    {
      id: "profile",
      label: "Perfil público",
      method: "API pública de usuários",
      detail: "Identidade, seguidores e total de repositórios públicos.",
      status: "available",
      result: `${audit.profile.followers.toLocaleString("pt-BR")} seguidores · ${audit.profile.publicRepos.toLocaleString("pt-BR")} repositórios`,
      url: `https://api.github.com/users/${encodedLogin}`,
      urlLabel: "abrir resposta JSON",
    },
    {
      id: "achievements",
      label: "Selos visíveis",
      method: "Perfil público renderizado",
      detail: "Somente conquistas que o titular decidiu exibir publicamente.",
      status: audit.sources.achievements,
      result: audit.sources.achievements === "available"
        ? countResult(audit.visibleAchievementCount, "selo visível", "selos visíveis")
        : unavailableResult(audit, "achievements"),
      url: `${audit.profile.htmlUrl}?tab=achievements`,
      urlLabel: "abrir aba de conquistas",
    },
    {
      id: "mergedPullRequests",
      label: "PRs mesclados",
      method: "Busca pública de issues e pull requests",
      detail: "Pull requests públicos do autor que estão marcados como mesclados.",
      status: audit.sources.mergedPullRequests,
      result: audit.sources.mergedPullRequests === "available"
        ? countResult(audit.metrics.mergedPullRequests, "PR mesclado", "PRs mesclados")
        : unavailableResult(audit, "mergedPullRequests"),
      url: githubSearchUrl("issues", {
        q: `is:pr author:${login} is:merged`,
      }),
      urlLabel: "abrir resposta JSON",
    },
    {
      id: "repositories",
      label: "Projeto principal",
      method: "Busca pública de repositórios por estrelas",
      detail: "Repositórios autorais, sem forks, ordenados por estrelas em todo o perfil.",
      status: audit.sources.repositories,
      result: audit.sources.repositories === "available"
        ? audit.metrics.topRepository
          ? `${audit.metrics.topRepository.name} · ${countResult(audit.metrics.topRepository.stars, "estrela", "estrelas")}`
          : "nenhum repositório autoral encontrado"
        : unavailableResult(audit, "repositories"),
      url: githubSearchUrl("repositories", {
        q: `user:${login} fork:false`,
        sort: "stars",
        order: "desc",
        per_page: "1",
      }),
      urlLabel: "abrir resposta JSON",
    },
  ];
}
