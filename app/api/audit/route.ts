import { buildAchievementProgress } from "@/lib/achievements";
import { parseVisibleAchievements } from "@/lib/github-profile";

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
    if (response.status === 403) throw new Error("GITHUB_RATE_LIMIT");
    throw new Error(`GITHUB_${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function GET(request: Request) {
  const login = new URL(request.url).searchParams.get("login")?.trim().replace(/^@/, "") ?? "";

  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(login)) {
    return Response.json({ error: "Informe um usuário válido do GitHub." }, { status: 400 });
  }

  try {
    const encodedLogin = encodeURIComponent(login);
    const [profile, repositories, mergedSearch, profilePage] = await Promise.all([
      githubJson<GitHubUser>(`https://api.github.com/users/${encodedLogin}`),
      githubJson<GitHubRepository[]>(
        `https://api.github.com/users/${encodedLogin}/repos?type=owner&sort=updated&per_page=100`,
      ),
      githubJson<{ total_count: number }>(
        `https://api.github.com/search/issues?q=${encodeURIComponent(`is:pr author:${login} is:merged`)}`,
      ),
      fetch(`https://github.com/${encodedLogin}`, {
        headers: { "User-Agent": githubHeaders["User-Agent"] },
      }).then((response) => {
        if (!response.ok) throw new Error("PROFILE_PAGE_UNAVAILABLE");
        return response.text();
      }),
    ]);

    const visibleAchievements = parseVisibleAchievements(profilePage);
    const topRepository = repositories
      .filter((repository) => !repository.fork)
      .sort((a, b) => b.stargazers_count - a.stargazers_count)[0] ?? null;

    const achievements = buildAchievementProgress(visibleAchievements, {
      mergedPullRequests: mergedSearch.total_count,
      topRepositoryStars: topRepository?.stargazers_count ?? 0,
    });

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
          mergedPullRequests: mergedSearch.total_count,
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
        visibleAchievementCount: visibleAchievements.length,
        achievements,
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
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
