import { GITHUB_LOGIN_PATTERN } from "./github-profile.ts";

// Preserve the original key so browsers can migrate existing snapshots in place.
export const AUDIT_HISTORY_STORAGE_KEY = "constellation:audit-history:v1";
export const AUDIT_HISTORY_BACKUP_FORMAT = "constellation-audit-history";
export const MAX_SNAPSHOTS_PER_PROFILE = 12;
export const MAX_TRACKED_PROFILES = 8;

export type AuditSnapshot = {
  version: 3;
  login: string;
  capturedAt: string;
  complete: boolean;
  followers: number | null;
  following: number | null;
  visibleAchievementCount: number | null;
  mergedPullRequests: number | null;
  topRepositoryStars: number | null;
  publicRepositories: number;
  unlockedAchievementSlugs: string[] | null;
};

export type AuditHistory = Record<string, AuditSnapshot[]>;

export type AuditHistoryBackup = {
  format: typeof AUDIT_HISTORY_BACKUP_FORMAT;
  version: 3;
  exportedAt: string;
  history: AuditHistory;
};

export type RecentAuditProfile = {
  login: string;
  lastObservedAt: string;
  observationCount: number;
  followers: number | null;
  following: number | null;
  visibleAchievementCount: number | null;
  mergedPullRequests: number | null;
  topRepositoryStars: number | null;
  publicRepositories: number;
};

export type AuditChanges = {
  followers: number | null;
  following: number | null;
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
    followers: number;
    following: number;
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

function normalizeSnapshot(value: unknown): AuditSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Record<string, unknown>;
  const followers = snapshot.version === 1 && snapshot.followers === undefined
    ? null
    : snapshot.followers;
  const following = (snapshot.version === 1 || snapshot.version === 2) && snapshot.following === undefined
    ? null
    : snapshot.following;

  if (
    (snapshot.version !== 1 && snapshot.version !== 2 && snapshot.version !== 3) ||
    typeof snapshot.login !== "string" ||
    !GITHUB_LOGIN_PATTERN.test(snapshot.login) ||
    typeof snapshot.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(snapshot.capturedAt)) ||
    typeof snapshot.complete !== "boolean" ||
    !nullableCount(followers) ||
    !nullableCount(following) ||
    !nullableCount(snapshot.visibleAchievementCount) ||
    !nullableCount(snapshot.mergedPullRequests) ||
    !nullableCount(snapshot.topRepositoryStars) ||
    typeof snapshot.publicRepositories !== "number" ||
    !Number.isInteger(snapshot.publicRepositories) ||
    snapshot.publicRepositories < 0 ||
    !(snapshot.unlockedAchievementSlugs === null ||
      (Array.isArray(snapshot.unlockedAchievementSlugs) &&
        snapshot.unlockedAchievementSlugs.every((slug) => (
          typeof slug === "string" && /^[a-z0-9-]+$/.test(slug)
        ))))
  ) {
    return null;
  }

  return {
    version: 3,
    login: snapshot.login,
    capturedAt: snapshot.capturedAt,
    complete: snapshot.complete,
    followers,
    following,
    visibleAchievementCount: snapshot.visibleAchievementCount,
    mergedPullRequests: snapshot.mergedPullRequests,
    topRepositoryStars: snapshot.topRepositoryStars,
    publicRepositories: snapshot.publicRepositories,
    unlockedAchievementSlugs: snapshot.unlockedAchievementSlugs as string[] | null,
  };
}

function normalizeBackupHistory(value: unknown): AuditHistory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const entries = Object.entries(value);
  const normalizedKeys = entries.map(([login]) => profileKey(login));
  if (
    entries.length > MAX_TRACKED_PROFILES ||
    new Set(normalizedKeys).size !== normalizedKeys.length
  ) {
    return null;
  }

  const normalizedEntries: Array<[string, AuditSnapshot[]]> = [];
  for (const [login, snapshots] of entries) {
    if (
      profileKey(login).length === 0 ||
      !Array.isArray(snapshots) ||
      snapshots.length === 0 ||
      snapshots.length > MAX_SNAPSHOTS_PER_PROFILE
    ) {
      return null;
    }

    const normalizedSnapshots = snapshots.map(normalizeSnapshot);
    if (normalizedSnapshots.some((snapshot) => (
      !snapshot ||
      !snapshot.complete ||
      snapshot.visibleAchievementCount === null ||
      snapshot.mergedPullRequests === null ||
      snapshot.topRepositoryStars === null ||
      snapshot.unlockedAchievementSlugs === null ||
      profileKey(snapshot.login) !== profileKey(login)
    ))) {
      return null;
    }

    normalizedEntries.push([
      profileKey(login),
      (normalizedSnapshots as AuditSnapshot[]).sort(
        (left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt),
      ),
    ]);
  }

  return Object.fromEntries(normalizedEntries);
}

function sameSignals(left: AuditSnapshot, right: AuditSnapshot) {
  return (
    left.complete === right.complete &&
    left.followers === right.followers &&
    left.following === right.following &&
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
    version: 3,
    login: audit.profile.login,
    capturedAt: audit.generatedAt,
    complete,
    followers: audit.profile.followers,
    following: audit.profile.following,
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
          (snapshots as unknown[])
            .map(normalizeSnapshot)
            .filter((snapshot): snapshot is AuditSnapshot => snapshot !== null)
            .slice(-MAX_SNAPSHOTS_PER_PROFILE),
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

export function listRecentAuditProfiles(history: AuditHistory): RecentAuditProfile[] {
  return Object.values(history)
    .flatMap((snapshots) => {
      const completeSnapshots = snapshots
        .map(normalizeSnapshot)
        .filter((snapshot): snapshot is AuditSnapshot => Boolean(snapshot?.complete))
        .sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt));
      const latest = completeSnapshots.at(-1);
      if (!latest) return [];

      return [{
        login: latest.login,
        lastObservedAt: latest.capturedAt,
        observationCount: completeSnapshots.length,
        followers: latest.followers,
        following: latest.following,
        visibleAchievementCount: latest.visibleAchievementCount,
        mergedPullRequests: latest.mergedPullRequests,
        topRepositoryStars: latest.topRepositoryStars,
        publicRepositories: latest.publicRepositories,
      }];
    })
    .sort((left, right) => Date.parse(right.lastObservedAt) - Date.parse(left.lastObservedAt))
    .slice(0, MAX_TRACKED_PROFILES);
}

export function auditHistoryBackupFilename(exportedAt: string) {
  const parsedDate = new Date(exportedAt);
  const date = Number.isNaN(parsedDate.getTime()) ? "backup" : parsedDate.toISOString().slice(0, 10);
  return `constellation-history-${date}.json`;
}

export function auditTimelineCsvFilename(login: string, exportedAt: string) {
  const safeLogin = login.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "perfil";
  const parsedDate = new Date(exportedAt);
  const date = Number.isNaN(parsedDate.getTime()) ? "export" : parsedDate.toISOString().slice(0, 10);
  return `constellation-timeline-${safeLogin}-${date}.csv`;
}

function csvCell(value: string | number | null) {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function serializeAuditTimelineCsv(timeline: AuditTimelineEntry[]) {
  const header = [
    "captured_at",
    "login",
    "followers",
    "following",
    "visible_achievements",
    "merged_pull_requests",
    "top_repository_stars",
    "public_repositories",
    "unlocked_achievements",
    "followers_change",
    "following_change",
    "visible_achievements_change",
    "merged_pull_requests_change",
    "top_repository_stars_change",
    "public_repositories_change",
    "newly_unlocked_achievements",
  ];
  const entries = [...timeline].sort(
    (left, right) => Date.parse(left.snapshot.capturedAt) - Date.parse(right.snapshot.capturedAt),
  );
  const rows = entries.map(({ snapshot, changes }) => [
    snapshot.capturedAt,
    snapshot.login,
    snapshot.followers,
    snapshot.following,
    snapshot.visibleAchievementCount,
    snapshot.mergedPullRequests,
    snapshot.topRepositoryStars,
    snapshot.publicRepositories,
    snapshot.unlockedAchievementSlugs?.join("|") ?? "",
    changes?.followers ?? null,
    changes?.following ?? null,
    changes?.visibleAchievements ?? null,
    changes?.mergedPullRequests ?? null,
    changes?.topRepositoryStars ?? null,
    changes?.publicRepositories ?? null,
    changes?.newlyUnlockedSlugs.join("|") ?? "",
  ]);

  return `\uFEFF${[header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")}\r\n`;
}

export function serializeAuditHistoryBackup(history: AuditHistory, exportedAt = new Date().toISOString()) {
  const backup: AuditHistoryBackup = {
    format: AUDIT_HISTORY_BACKUP_FORMAT,
    version: 3,
    exportedAt,
    history: mergeAuditHistories({}, history),
  };

  return JSON.stringify(backup, null, 2);
}

export function parseAuditHistoryBackup(serialized: string): AuditHistoryBackup | null {
  try {
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    const history = normalizeBackupHistory(parsed.history);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.format !== AUDIT_HISTORY_BACKUP_FORMAT ||
      (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3) ||
      typeof parsed.exportedAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.exportedAt)) ||
      !history
    ) {
      return null;
    }

    return {
      format: AUDIT_HISTORY_BACKUP_FORMAT,
      version: 3,
      exportedAt: parsed.exportedAt,
      history,
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
    .map(normalizeSnapshot)
    .filter((snapshot): snapshot is AuditSnapshot => Boolean(snapshot?.complete))
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
    followers: delta(current.followers, previous.followers),
    following: delta(current.following, previous.following),
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
