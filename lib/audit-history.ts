import { GITHUB_LOGIN_PATTERN } from "./github-profile.ts";

export const AUDIT_HISTORY_STORAGE_KEY = "constellation:audit-history:v1";
export const AUDIT_HISTORY_BACKUP_FORMAT = "constellation-audit-history";
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

export type AuditHistoryBackup = {
  format: typeof AUDIT_HISTORY_BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  history: AuditHistory;
};

export type AuditChanges = {
  visibleAchievements: number | null;
  mergedPullRequests: number | null;
  topRepositoryStars: number | null;
  publicRepositories: number;
  newlyUnlockedSlugs: string[];
};

export type AuditTimelineEntry = {
  snapshot: AuditSnapshot;
  changes: AuditChanges | null;
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
  return value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0);
}

function validSnapshot(value: unknown): value is AuditSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<AuditSnapshot>;

  return (
    snapshot.version === 1 &&
    typeof snapshot.login === "string" &&
    GITHUB_LOGIN_PATTERN.test(snapshot.login) &&
    typeof snapshot.capturedAt === "string" &&
    Number.isFinite(Date.parse(snapshot.capturedAt)) &&
    typeof snapshot.complete === "boolean" &&
    nullableCount(snapshot.visibleAchievementCount) &&
    nullableCount(snapshot.mergedPullRequests) &&
    nullableCount(snapshot.topRepositoryStars) &&
    typeof snapshot.publicRepositories === "number" &&
    Number.isInteger(snapshot.publicRepositories) &&
    snapshot.publicRepositories >= 0 &&
    (snapshot.unlockedAchievementSlugs === null ||
      (Array.isArray(snapshot.unlockedAchievementSlugs) &&
        snapshot.unlockedAchievementSlugs.every((slug) => (
          typeof slug === "string" && /^[a-z0-9-]+$/.test(slug)
        ))))
  );
}

function validBackupHistory(value: unknown): value is AuditHistory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const entries = Object.entries(value);
  const normalizedKeys = entries.map(([login]) => profileKey(login));
  if (
    entries.length > MAX_TRACKED_PROFILES ||
    new Set(normalizedKeys).size !== normalizedKeys.length
  ) {
    return false;
  }

  return entries.every(([login, snapshots]) => (
    profileKey(login).length > 0 &&
    Array.isArray(snapshots) &&
    snapshots.length > 0 &&
    snapshots.length <= MAX_SNAPSHOTS_PER_PROFILE &&
    snapshots.every((snapshot) => (
      validSnapshot(snapshot) &&
      snapshot.complete &&
      snapshot.visibleAchievementCount !== null &&
      snapshot.mergedPullRequests !== null &&
      snapshot.topRepositoryStars !== null &&
      snapshot.unlockedAchievementSlugs !== null &&
      profileKey(snapshot.login) === profileKey(login)
    ))
  ));
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

    const history = Object.fromEntries(
      Object.entries(parsed)
        .filter(([, snapshots]) => Array.isArray(snapshots))
        .map(([login, snapshots]) => [
          profileKey(login),
          (snapshots as unknown[]).filter(validSnapshot).slice(-MAX_SNAPSHOTS_PER_PROFILE),
        ])
        .filter(([, snapshots]) => (snapshots as AuditSnapshot[]).length > 0),
    ) as AuditHistory;

    return Object.fromEntries(
      Object.entries(history)
        .sort(([, left], [, right]) => {
          const leftTime = Date.parse(left.at(-1)?.capturedAt ?? "");
          const rightTime = Date.parse(right.at(-1)?.capturedAt ?? "");
          return rightTime - leftTime;
        })
        .slice(0, MAX_TRACKED_PROFILES),
    );
  } catch {
    return {};
  }
}

export function serializeAuditHistory(history: AuditHistory) {
  return JSON.stringify(history);
}

export function countAuditHistorySnapshots(history: AuditHistory) {
  return Object.values(history).reduce((total, snapshots) => total + snapshots.length, 0);
}

export function auditHistoryBackupFilename(exportedAt: string) {
  const parsedDate = new Date(exportedAt);
  const date = Number.isNaN(parsedDate.getTime()) ? "backup" : parsedDate.toISOString().slice(0, 10);
  return `constellation-history-${date}.json`;
}

export function serializeAuditHistoryBackup(history: AuditHistory, exportedAt = new Date().toISOString()) {
  const backup: AuditHistoryBackup = {
    format: AUDIT_HISTORY_BACKUP_FORMAT,
    version: 1,
    exportedAt,
    history: mergeAuditHistories({}, history),
  };

  return JSON.stringify(backup, null, 2);
}

export function parseAuditHistoryBackup(serialized: string): AuditHistoryBackup | null {
  try {
    const parsed = JSON.parse(serialized) as Partial<AuditHistoryBackup>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.format !== AUDIT_HISTORY_BACKUP_FORMAT ||
      parsed.version !== 1 ||
      typeof parsed.exportedAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.exportedAt)) ||
      !validBackupHistory(parsed.history)
    ) {
      return null;
    }

    return {
      format: AUDIT_HISTORY_BACKUP_FORMAT,
      version: 1,
      exportedAt: parsed.exportedAt,
      history: Object.fromEntries(
        Object.entries(parsed.history).map(([login, snapshots]) => [
          profileKey(login),
          [...snapshots].sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt)),
        ]),
      ),
    };
  } catch {
    return null;
  }
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

export function mergeAuditHistories(current: AuditHistory, imported: AuditHistory): AuditHistory {
  const snapshots = [...Object.values(current), ...Object.values(imported)]
    .flat()
    .filter((snapshot) => validSnapshot(snapshot) && snapshot.complete)
    .sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt));

  return snapshots.reduce<AuditHistory>(
    (history, snapshot) => appendAuditSnapshot(history, snapshot),
    {},
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

export function buildAuditTimeline(history: AuditHistory, login: string): AuditTimelineEntry[] {
  const snapshots = [...(history[profileKey(login)] ?? [])]
    .filter((snapshot) => snapshot.complete)
    .sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt));

  return snapshots
    .map((snapshot, index) => ({
      snapshot,
      changes: index > 0 ? compareAuditSnapshots(snapshot, snapshots[index - 1]) : null,
    }))
    .reverse();
}
