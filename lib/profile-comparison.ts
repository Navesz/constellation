export type ComparisonMetricId =
  | "visibleAchievements"
  | "mergedPullRequests"
  | "topRepositoryStars"
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
  current: number;
  nextThreshold: number | null;
  badgeStatus: "visible" | "not-visible" | "unavailable";
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
    current: number;
    nextThreshold: number | null;
    badgeStatus: "visible" | "not-visible" | "unavailable";
  }>;
};

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
      }
    : {
        unlocked: false,
        tier: 0,
        current: 0,
        nextThreshold: null,
        badgeStatus: "unavailable",
      };
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
