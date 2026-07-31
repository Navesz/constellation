import { buildAchievementProgress } from "@/lib/achievements";
import { normalizeGitHubLogin, parseVisibleAchievements } from "@/lib/github-profile";

const githubHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "constellation-profile-observatory",
  "X-GitHub-Api-Version": "2022-11-28",
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
  fork: boolean;
};

async function githubJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: githubHeaders });
  if (!response.ok) {
    if (response.status === 404) throw new Error("PROFILE_NOT_FOUND");
    if (response.status === 403 || response.status === 429) throw new Error("GITHUB_RATE_LIMIT");
    throw new Error(`GITHUB_${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function githubProfilePage(login: string): Promise<string> {
  const response = await fetch(`https://github.com/${login}`, {
    headers: { "User-Agent": githubHeaders["User-Agent"] },
  });

  if (!response.ok) throw new Error(`PROFILE_PAGE_${response.status}`);
  return response.text();
}

export async function GET(request: Request) {
  const login = normalizeGitHubLogin(new URL(request.url).searchParams.get("login"));

  if (!login) {
    return Response.json({ error: "Informe um usuário válido do GitHub." }, { status: 400 });
  }

  try {
    const encodedLogin = encodeURIComponent(login);
    const [profileResult, repositoriesResult, mergedSearchResult, profilePageResult] = await Promise.allSettled([
      githubJson<GitHubUser>(`https://api.github.com/users/${encodedLogin}`),
      githubJson<GitHubRepository[]>(
        `https://api.github.com/users/${encodedLogin}/repos?type=owner&sort=updated&per_page=100`,
      ),
      githubJson<{ total_count: number }>(
        `https://api.github.com/search/issues?q=${encodeURIComponent(`is:pr author:${login} is:merged`)}`,
      ),
      githubProfilePage(encodedLogin),
    ]);

    if (profileResult.status === "rejected") throw profileResult.reason;

    const profile = profileResult.value;
    const repositories = repositoriesResult.status === "fulfilled" ? repositoriesResult.value : null;
    const mergedSearch = mergedSearchResult.status === "fulfilled" ? mergedSearchResult.value : null;
    const profilePage = profilePageResult.status === "fulfilled" ? profilePageResult.value : null;
    const warnings: string[] = [];

    if (repositories === null) {
      warnings.push("Os repositórios não responderam; estrelas e projeto principal ficaram indisponíveis.");
    }
    if (mergedSearch === null) {
      warnings.push("A busca de pull requests não respondeu; esse contador ficou indisponível.");
    }
    if (profilePage === null) {
      warnings.push("Os selos públicos não responderam; o estado das conquistas pode estar incompleto.");
    }

    const visibleAchievements = profilePage === null ? [] : parseVisibleAchievements(profilePage);
    const topRepository = repositories
      ? (repositories
          .filter((repository) => !repository.fork)
          .sort((a, b) => b.stargazers_count - a.stargazers_count)[0] ?? null)
      : null;

    const achievements = buildAchievementProgress(
      visibleAchievements,
      {
        mergedPullRequests: mergedSearch?.total_count,
        topRepositoryStars: repositories === null ? undefined : topRepository?.stargazers_count ?? 0,
      },
      {
        achievementScanAvailable: profilePage !== null,
      },
    );

    return Response.json(
      {
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
          repositories: repositories === null ? "unavailable" : "available",
        },
        visibleAchievementCount: profilePage === null ? null : visibleAchievements.length,
        achievements,
        warnings,
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": warnings.length
            ? "public, s-maxage=30, stale-while-revalidate=60"
            : "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    if (message === "PROFILE_NOT_FOUND") {
      return Response.json({ error: "Perfil não encontrado no GitHub." }, { status: 404 });
    }
    if (message === "GITHUB_RATE_LIMIT") {
      return Response.json(
        { error: "O GitHub limitou novas consultas por alguns minutos. Tente novamente em breve." },
        { status: 429 },
      );
    }
    return Response.json({ error: "O GitHub não respondeu como esperado. Tente novamente." }, { status: 502 });
  }
}
