import {
  AUDIT_SCHEMA_VERSION,
  buildAchievementProgress,
  type AuditResponse,
} from "@/lib/achievements";
import { normalizeGitHubLogin, parseVisibleAchievements } from "@/lib/github-profile";
import {
  GitHubRequestError,
  fetchGitHubWithTimeout,
  formatGitHubRetryAt,
  githubFailureDiagnostic,
  githubFailureFromResponse,
} from "@/lib/github-request";

const githubHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "constellation-profile-observatory",
  "X-GitHub-Api-Version": "2026-03-10",
};

type GitHubUser = {
  login: string;
  name: string | null;
  bio: string | null;
  avatar_url: string;
  html_url: string;
  followers: number;
  following: number;
  public_repos: number;
};

type GitHubRepository = {
  name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  html_url: string;
};

type GitHubRepositorySearch = {
  items: GitHubRepository[];
};

async function githubJson<T>(url: string): Promise<T> {
  const response = await fetchGitHubWithTimeout(url, { headers: githubHeaders });
  if (!response.ok) throw githubFailureFromResponse(response);

  try {
    return await response.json() as T;
  } catch (error) {
    throw new GitHubRequestError("invalid-response", response.status, { cause: error });
  }
}

async function githubProfilePage(login: string): Promise<string> {
  const response = await fetchGitHubWithTimeout(`https://github.com/${login}`, {
    headers: { "User-Agent": githubHeaders["User-Agent"] },
  });

  if (!response.ok) throw githubFailureFromResponse(response);
  try {
    return await response.text();
  } catch (error) {
    throw new GitHubRequestError("invalid-response", response.status, { cause: error });
  }
}

function warningWithDiagnostic(message: string, diagnostic: ReturnType<typeof githubFailureDiagnostic>) {
  const retryLabel = "retryAt" in diagnostic ? formatGitHubRetryAt(diagnostic.retryAt) : null;
  return `${message} Motivo: ${diagnostic.message}.${retryLabel ? ` Tente novamente após ${retryLabel}.` : ""}`;
}

export async function GET(request: Request) {
  const login = normalizeGitHubLogin(new URL(request.url).searchParams.get("login"));

  if (!login) {
    return Response.json({ error: "Informe um usuário válido do GitHub." }, { status: 400 });
  }

  try {
    const encodedLogin = encodeURIComponent(login);
    const profile = await githubJson<GitHubUser>(`https://api.github.com/users/${encodedLogin}`);
    const [repositorySearchResult, mergedSearchResult, profilePageResult] = await Promise.allSettled([
      githubJson<GitHubRepositorySearch>(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(`user:${login} fork:false`)}&sort=stars&order=desc&per_page=1`,
      ),
      githubJson<{ total_count: number }>(
        `https://api.github.com/search/issues?q=${encodeURIComponent(`is:pr author:${login} is:merged`)}`,
      ),
      githubProfilePage(encodedLogin),
    ]);

    const repositorySearch =
      repositorySearchResult.status === "fulfilled" ? repositorySearchResult.value : null;
    const mergedSearch = mergedSearchResult.status === "fulfilled" ? mergedSearchResult.value : null;
    const profilePage = profilePageResult.status === "fulfilled" ? profilePageResult.value : null;
    const repositoryDiagnostic = repositorySearchResult.status === "rejected"
      ? githubFailureDiagnostic(repositorySearchResult.reason)
      : null;
    const mergedPullRequestDiagnostic = mergedSearchResult.status === "rejected"
      ? githubFailureDiagnostic(mergedSearchResult.reason)
      : null;
    const achievementDiagnostic = profilePageResult.status === "rejected"
      ? githubFailureDiagnostic(profilePageResult.reason)
      : null;
    const warnings: string[] = [];

    if (repositoryDiagnostic) {
      warnings.push(warningWithDiagnostic(
        "Os repositórios não responderam; estrelas e projeto principal ficaram indisponíveis.",
        repositoryDiagnostic,
      ));
    }
    if (mergedPullRequestDiagnostic) {
      warnings.push(warningWithDiagnostic(
        "A busca de pull requests não respondeu; esse contador ficou indisponível.",
        mergedPullRequestDiagnostic,
      ));
    }
    if (achievementDiagnostic) {
      warnings.push(warningWithDiagnostic(
        "Os selos públicos não responderam; o estado das conquistas pode estar incompleto.",
        achievementDiagnostic,
      ));
    }

    const visibleAchievements = profilePage === null ? [] : parseVisibleAchievements(profilePage);
    const topRepository = repositorySearch?.items[0] ?? null;

    const achievements = buildAchievementProgress(
      visibleAchievements,
      {
        mergedPullRequests: mergedSearch?.total_count,
        topRepositoryStars: repositorySearch === null ? undefined : topRepository?.stargazers_count ?? 0,
      },
      {
        achievementScanAvailable: profilePage !== null,
      },
    );

    const audit: AuditResponse = {
      schemaVersion: AUDIT_SCHEMA_VERSION,
      profile: {
        login: profile.login,
        name: profile.name,
        bio: profile.bio,
        avatarUrl: profile.avatar_url,
        htmlUrl: profile.html_url,
        followers: profile.followers,
        following: profile.following,
        publicRepos: profile.public_repos,
      },
      metrics: {
        mergedPullRequests: mergedSearch?.total_count ?? null,
        topRepository: topRepository
          ? {
              name: topRepository.name,
              description: topRepository.description,
              stars: topRepository.stargazers_count,
              forks: topRepository.forks_count,
              url: topRepository.html_url,
            }
          : null,
      },
      sources: {
        achievements: profilePage === null ? "unavailable" : "available",
        mergedPullRequests: mergedSearch === null ? "unavailable" : "available",
        repositories: repositorySearch === null ? "unavailable" : "available",
      },
      sourceDiagnostics: {
        achievements: achievementDiagnostic,
        mergedPullRequests: mergedPullRequestDiagnostic,
        repositories: repositoryDiagnostic,
      },
      visibleAchievementCount: profilePage === null ? null : visibleAchievements.length,
      achievements,
      warnings,
      generatedAt: new Date().toISOString(),
    };

    return Response.json(
      audit,
      {
        headers: {
          "X-Constellation-Schema-Version": String(AUDIT_SCHEMA_VERSION),
          "Cache-Control": warnings.length
            ? "public, s-maxage=30, stale-while-revalidate=60"
            : "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error) {
    const diagnostic = githubFailureDiagnostic(error);
    if (diagnostic.reason === "not-found") {
      return Response.json({ error: "Perfil não encontrado no GitHub." }, { status: 404 });
    }
    if (diagnostic.reason === "rate-limit") {
      const retryLabel = "retryAt" in diagnostic ? formatGitHubRetryAt(diagnostic.retryAt) : null;
      return Response.json(
        {
          error: retryLabel
            ? `O GitHub limitou novas consultas. Tente novamente após ${retryLabel}.`
            : "O GitHub limitou novas consultas por alguns minutos. Tente novamente em breve.",
          ...("retryAt" in diagnostic ? { retryAt: diagnostic.retryAt } : {}),
        },
        { status: 429 },
      );
    }
    if (diagnostic.reason === "timeout") {
      return Response.json(
        { error: "O GitHub demorou demais para responder. Tente novamente em instantes." },
        { status: 504 },
      );
    }
    return Response.json({ error: "O GitHub não respondeu como esperado. Tente novamente." }, { status: 502 });
  }
}
