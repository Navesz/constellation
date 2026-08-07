import type { AchievementProgress } from "./achievements";
import { normalizeGitHubLogin } from "./github-profile.ts";

export type ComparisonMetricId =
  | "visibleAchievements"
  | "mergedPullRequests"
  | "topRepositoryStars"
  | "followers"
  | "publicRepositories";

export type ComparisonMetric = {
  id: ComparisonMetricId;
  label: string;
  primary: number | null;
  secondary: number | null;
  difference: number | null;
  leader: "primary" | "secondary" | "tie" | "unknown";
};

export type ComparisonAchievementState = {
  unlocked: boolean;
  tier: number;
  current: number | null;
  nextThreshold: number | null;
  badgeStatus: "visible" | "not-visible" | "unavailable";
  measurementKind: AchievementProgress["measurementKind"];
  earningStatus: AchievementProgress["earningStatus"];
};

export type ComparisonAchievement = {
  slug: string;
  name: string;
  primary: ComparisonAchievementState;
  secondary: ComparisonAchievementState;
};

export type ProfileComparison = {
  metrics: ComparisonMetric[];
  achievements: ComparisonAchievement[];
  sharedUnlocked: number;
  primaryOnlyUnlocked: string[];
  secondaryOnlyUnlocked: string[];
};

type ComparableAudit = {
  profile: {
    followers: number;
    publicRepos: number;
  };
  metrics: {
    mergedPullRequests: number | null;
    topRepository: { stars: number } | null;
  };
  sources: {
    repositories: "available" | "unavailable";
  };
  visibleAchievementCount: number | null;
  achievements: Array<{
    slug: string;
    name: string;
    unlocked: boolean;
    tier: number;
    current: number | null;
    nextThreshold: number | null;
    badgeStatus: "visible" | "not-visible" | "unavailable";
    measurementKind: AchievementProgress["measurementKind"];
    earningStatus: AchievementProgress["earningStatus"];
  }>;
};

export function buildProfileComparisonPath(
  primaryLogin: string,
  secondaryLogin: string,
) {
  const primary = normalizeGitHubLogin(primaryLogin);
  const secondary = normalizeGitHubLogin(secondaryLogin);
  if (!primary || !secondary || primary.toLowerCase() === secondary.toLowerCase()) {
    throw new Error("A comparação exige dois logins válidos e diferentes.");
  }

  const parameters = new URLSearchParams({
    login: primary,
    compare: secondary,
  });
  return `/?${parameters.toString()}`;
}

function metric(
  id: ComparisonMetricId,
  label: string,
  primary: number | null,
  secondary: number | null,
): ComparisonMetric {
  if (primary === null || secondary === null) {
    return { id, label, primary, secondary, difference: null, leader: "unknown" };
  }

  const difference = secondary - primary;
  const leader = difference === 0 ? "tie" : difference > 0 ? "secondary" : "primary";
  return { id, label, primary, secondary, difference, leader };
}

function repositoryStars(audit: ComparableAudit) {
  return audit.sources.repositories === "available" ? audit.metrics.topRepository?.stars ?? 0 : null;
}

function achievementState(
  achievement: ComparableAudit["achievements"][number] | undefined,
): ComparisonAchievementState {
  return achievement
    ? {
        unlocked: achievement.unlocked,
        tier: achievement.tier,
        current: achievement.current,
        nextThreshold: achievement.nextThreshold,
        badgeStatus: achievement.badgeStatus,
        measurementKind: achievement.measurementKind,
        earningStatus: achievement.earningStatus,
      }
    : {
        unlocked: false,
        tier: 0,
        current: null,
        nextThreshold: null,
        badgeStatus: "unavailable",
        measurementKind: "unavailable",
        earningStatus: "unknown",
      };
}

export function comparisonAchievementLabel(state: ComparisonAchievementState) {
  if (state.badgeStatus === "unavailable") return "Fonte indisponível";
  if (state.earningStatus === "historical") {
    return state.unlocked ? "Histórica · visível" : "Evento histórico encerrado";
  }
  if (state.unlocked) return `Nível ${state.tier}`;
  if (state.measurementKind === "not-public" || state.current === null) {
    return "Progresso não público";
  }
  if (state.nextThreshold) return `${state.current} de ${state.nextThreshold}`;
  if (state.measurementKind === "measured") return `${state.current} medidos; selo não visível`;
  return "Não visível";
}

export function compareProfiles(primary: ComparableAudit, secondary: ComparableAudit): ProfileComparison {
  const secondaryBySlug = new Map(secondary.achievements.map((achievement) => [achievement.slug, achievement]));
  const allAchievements = new Map(
    [...primary.achievements, ...secondary.achievements].map((achievement) => [achievement.slug, achievement.name]),
  );
  const achievements = [...allAchievements].map(([slug, name]) => {
    const primaryAchievement = primary.achievements.find((achievement) => achievement.slug === slug);
    const secondaryAchievement = secondaryBySlug.get(slug);

    return {
      slug,
      name,
      primary: achievementState(primaryAchievement),
      secondary: achievementState(secondaryAchievement),
    };
  });
  const primaryOnlyUnlocked = achievements
    .filter((achievement) => achievement.primary.unlocked && !achievement.secondary.unlocked)
    .map((achievement) => achievement.slug);
  const secondaryOnlyUnlocked = achievements
    .filter((achievement) => achievement.secondary.unlocked && !achievement.primary.unlocked)
    .map((achievement) => achievement.slug);

  return {
    metrics: [
      metric(
        "visibleAchievements",
        "conquistas visíveis",
        primary.visibleAchievementCount,
        secondary.visibleAchievementCount,
      ),
      metric(
        "mergedPullRequests",
        "PRs públicos mesclados",
        primary.metrics.mergedPullRequests,
        secondary.metrics.mergedPullRequests,
      ),
      metric(
        "topRepositoryStars",
        "estrelas no melhor projeto",
        repositoryStars(primary),
        repositoryStars(secondary),
      ),
      metric(
        "followers",
        "seguidores",
        primary.profile.followers,
        secondary.profile.followers,
      ),
      metric(
        "publicRepositories",
        "repositórios públicos",
        primary.profile.publicRepos,
        secondary.profile.publicRepos,
      ),
    ],
    achievements,
    sharedUnlocked: achievements.filter(
      (achievement) => achievement.primary.unlocked && achievement.secondary.unlocked,
    ).length,
    primaryOnlyUnlocked,
    secondaryOnlyUnlocked,
  };
}
