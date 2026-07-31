import { isActionableAchievement, type AchievementProgress } from "./achievements.ts";

export type AchievementFilter = "all" | "visible" | "actionable" | "withoutPublicCounter";

export const ACHIEVEMENT_FILTER_OPTIONS: ReadonlyArray<{
  id: AchievementFilter;
  label: string;
}> = [
  { id: "all", label: "Todas" },
  { id: "visible", label: "Visíveis" },
  { id: "actionable", label: "Próximo marco" },
  { id: "withoutPublicCounter", label: "Sem contador público" },
];

function hasNoPublicCounter(achievement: AchievementProgress) {
  return (
    achievement.catalogStatus === "discovered" ||
    achievement.measurementKind === "not-public" ||
    achievement.measurementKind === "unavailable"
  );
}

export function filterAchievements(
  achievements: AchievementProgress[],
  filter: AchievementFilter,
) {
  if (filter === "visible") return achievements.filter((achievement) => achievement.unlocked);
  if (filter === "actionable") return achievements.filter(isActionableAchievement);
  if (filter === "withoutPublicCounter") return achievements.filter(hasNoPublicCounter);
  return achievements;
}

export function countAchievementFilters(achievements: AchievementProgress[]): Record<AchievementFilter, number> {
  return {
    all: achievements.length,
    visible: achievements.filter((achievement) => achievement.unlocked).length,
    actionable: achievements.filter(isActionableAchievement).length,
    withoutPublicCounter: achievements.filter(hasNoPublicCounter).length,
  };
}
