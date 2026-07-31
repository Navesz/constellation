export const AUDIT_HISTORY_STORAGE_KEY = "constellation:audit-history:v1";
export const MAX_SNAPSHOTS_PER_PROFILE = 12;
export const MAX_TRACKED_PROFILES = 8;

export type AuditSnapshot = {
  version: 1;
  login: string;
  capturedAt: string;
  complete: boolean;
  visibleAchievementCount: number | null;
  mergedPullRequests: number | null;
  topRepositoryStars: number | null;
  publicRepositories: number;
  unlockedAchievementSlugs: string[] | null;
};

export type AuditHistory = Record<string, AuditSnapshot[]>;

export type AuditChanges = {
  visibleAchievements: number | null;
  mergedPullRequests: number | null;
  topRepositoryStars: number | null;
  publicRepositories: number;
  newlyUnlockedSlugs: string[];
};

type SnapshotInput = {
  profile: {
    login: string;
    publicRepos: number;
  };
  metrics: {
    mergedPullRequests: number | null;
    topRepository: { stars: number } | null;
  };
  sources: {
    achievements: "available" | "unavailable";
    mergedPullRequests: "available" | "unavailable";
    repositories: "available" | "unavailable";
  };
  visibleAchievementCount: number | null;
  achievements: Array<{ slug: string; unlocked: boolean }>;
  generatedAt: string;
};

function profileKey(login: string) {
  return login.trim().toLowerCase();
}

function nullableCount(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function validSnapshot(value: unknown): value is AuditSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<AuditSnapshot>;

  return (
    snapshot.version === 1 &&
    typeof snapshot.login === "string" &&
    snapshot.login.length > 0 &&
    typeof snapshot.capturedAt === "string" &&
    Number.isFinite(Date.parse(snapshot.capturedAt)) &&
    typeof snapshot.complete === "boolean" &&
    nullableCount(snapshot.visibleAchievementCount) &&
    nullableCount(snapshot.mergedPullRequests) &&
    nullableCount(snapshot.topRepositoryStars) &&
    typeof snapshot.publicRepositories === "number" &&
    Number.isFinite(snapshot.publicRepositories) &&
    snapshot.publicRepositories >= 0 &&
    (snapshot.unlockedAchievementSlugs === null ||
      (Array.isArray(snapshot.unlockedAchievementSlugs) &&
        snapshot.unlockedAchievementSlugs.every((slug) => typeof slug === "string")))
  );
}

function sameSignals(left: AuditSnapshot, right: AuditSnapshot) {
  return (
    left.complete === right.complete &&
    left.visibleAchievementCount === right.visibleAchievementCount &&
    left.mergedPullRequests === right.mergedPullRequests &&
    left.topRepositoryStars === right.topRepositoryStars &&
    left.publicRepositories === right.publicRepositories &&
    JSON.stringify(left.unlockedAchievementSlugs) === JSON.stringify(right.unlockedAchievementSlugs)
  );
}

export function createAuditSnapshot(audit: SnapshotInput): AuditSnapshot {
  const complete = Object.values(audit.sources).every((source) => source === "available");

  return {
    version: 1,
    login: audit.profile.login,
    capturedAt: audit.generatedAt,
    complete,
    visibleAchievementCount: audit.visibleAchievementCount,
    mergedPullRequests: audit.metrics.mergedPullRequests,
    topRepositoryStars:
      audit.sources.repositories === "available" ? audit.metrics.topRepository?.stars ?? 0 : null,
    publicRepositories: audit.profile.publicRepos,
    unlockedAchievementSlugs:
      audit.sources.achievements === "available"
        ? audit.achievements.filter((achievement) => achievement.unlocked).map((achievement) => achievement.slug)
        : null,
  };
}

export function parseAuditHistory(serialized: string | null): AuditHistory {
  if (!serialized) return {};

  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, snapshots]) => Array.isArray(snapshots))
        .map(([login, snapshots]) => [
          profileKey(login),
          (snapshots as unknown[]).filter(validSnapshot).slice(-MAX_SNAPSHOTS_PER_PROFILE),
        ])
        .filter(([, snapshots]) => (snapshots as AuditSnapshot[]).length > 0),
    );
  } catch {
    return {};
  }
}

export function serializeAuditHistory(history: AuditHistory) {
  return JSON.stringify(history);
}

export function findComparisonSnapshot(history: AuditHistory, current: AuditSnapshot) {
  const snapshots = history[profileKey(current.login)] ?? [];

  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    if (!sameSignals(snapshots[index], current)) return snapshots[index];
  }

  return snapshots.at(-1) ?? null;
}

export function appendAuditSnapshot(history: AuditHistory, snapshot: AuditSnapshot): AuditHistory {
  if (!snapshot.complete) return history;

  const key = profileKey(snapshot.login);
  const previousSnapshots = history[key] ?? [];
  const latest = previousSnapshots.at(-1);
  const snapshots = latest && sameSignals(latest, snapshot)
    ? previousSnapshots
    : [...previousSnapshots, snapshot].slice(-MAX_SNAPSHOTS_PER_PROFILE);
  const nextHistory = { ...history, [key]: snapshots };

  return Object.fromEntries(
    Object.entries(nextHistory)
      .sort(([, left], [, right]) => {
        const leftTime = Date.parse(left.at(-1)?.capturedAt ?? "");
        const rightTime = Date.parse(right.at(-1)?.capturedAt ?? "");
        return rightTime - leftTime;
      })
      .slice(0, MAX_TRACKED_PROFILES),
  );
}

export function removeProfileHistory(history: AuditHistory, login: string): AuditHistory {
  const nextHistory = { ...history };
  delete nextHistory[profileKey(login)];
  return nextHistory;
}

function delta(current: number | null, previous: number | null) {
  return current === null || previous === null ? null : current - previous;
}

export function compareAuditSnapshots(current: AuditSnapshot, previous: AuditSnapshot): AuditChanges {
  const previousUnlocked = new Set(previous.unlockedAchievementSlugs ?? []);
  const newlyUnlockedSlugs = current.unlockedAchievementSlugs
    ? current.unlockedAchievementSlugs.filter((slug) => !previousUnlocked.has(slug))
    : [];

  return {
    visibleAchievements: delta(current.visibleAchievementCount, previous.visibleAchievementCount),
    mergedPullRequests: delta(current.mergedPullRequests, previous.mergedPullRequests),
    topRepositoryStars: delta(current.topRepositoryStars, previous.topRepositoryStars),
    publicRepositories: current.publicRepositories - previous.publicRepositories,
    newlyUnlockedSlugs,
  };
}
