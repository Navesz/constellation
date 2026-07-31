import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SNAPSHOTS_PER_PROFILE,
  MAX_TRACKED_PROFILES,
  appendAuditSnapshot,
  auditHistoryBackupFilename,
  buildAuditTimeline,
  compareAuditSnapshots,
  countAuditHistorySnapshots,
  createAuditSnapshot,
  findComparisonSnapshot,
  listRecentAuditProfiles,
  mergeAuditHistories,
  parseAuditHistory,
  parseAuditHistoryBackup,
  removeProfileHistory,
  serializeAuditHistory,
  serializeAuditHistoryBackup,
} from "../lib/audit-history.ts";

function audit(overrides = {}) {
  return {
    profile: { login: "octocat", publicRepos: 8 },
    metrics: {
      mergedPullRequests: 12,
      topRepository: { stars: 7 },
    },
    sources: {
      achievements: "available",
      mergedPullRequests: "available",
      repositories: "available",
    },
    visibleAchievementCount: 2,
    achievements: [
      { slug: "quickdraw", unlocked: true },
      { slug: "pull-shark", unlocked: true },
      { slug: "starstruck", unlocked: false },
    ],
    generatedAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

test("creates a complete, minimal snapshot from an audit", () => {
  assert.deepEqual(createAuditSnapshot(audit()), {
    version: 1,
    login: "octocat",
    capturedAt: "2026-07-31T00:00:00.000Z",
    complete: true,
    visibleAchievementCount: 2,
    mergedPullRequests: 12,
    topRepositoryStars: 7,
    publicRepositories: 8,
    unlockedAchievementSlugs: ["quickdraw", "pull-shark"],
  });
});

test("does not persist a partial audit as a historical baseline", () => {
  const snapshot = createAuditSnapshot(audit({
    sources: {
      achievements: "unavailable",
      mergedPullRequests: "available",
      repositories: "available",
    },
    visibleAchievementCount: null,
  }));

  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.unlockedAchievementSlugs, null);
  assert.deepEqual(appendAuditSnapshot({}, snapshot), {});
});

test("compares changes against the last different state", () => {
  const baseline = createAuditSnapshot(audit());
  const history = appendAuditSnapshot({}, baseline);
  const current = createAuditSnapshot(audit({
    metrics: {
      mergedPullRequests: 15,
      topRepository: { stars: 8 },
    },
    visibleAchievementCount: 3,
    achievements: [
      { slug: "quickdraw", unlocked: true },
      { slug: "pull-shark", unlocked: true },
      { slug: "starstruck", unlocked: true },
    ],
    generatedAt: "2026-08-01T00:00:00.000Z",
  }));

  const comparison = findComparisonSnapshot(history, current);
  assert.equal(comparison?.capturedAt, baseline.capturedAt);
  assert.deepEqual(compareAuditSnapshots(current, comparison), {
    visibleAchievements: 1,
    mergedPullRequests: 3,
    topRepositoryStars: 1,
    publicRepositories: 0,
    newlyUnlockedSlugs: ["starstruck"],
  });

  const updated = appendAuditSnapshot(history, current);
  assert.equal(findComparisonSnapshot(updated, current)?.capturedAt, baseline.capturedAt);
});

test("builds a newest-first timeline from complete snapshots in chronological order", () => {
  const baseline = createAuditSnapshot(audit());
  const middle = createAuditSnapshot(audit({
    metrics: {
      mergedPullRequests: 15,
      topRepository: { stars: 8 },
    },
    generatedAt: "2026-08-01T00:00:00.000Z",
  }));
  const latest = createAuditSnapshot(audit({
    profile: { login: "octocat", publicRepos: 9 },
    metrics: {
      mergedPullRequests: 17,
      topRepository: { stars: 8 },
    },
    visibleAchievementCount: 3,
    achievements: [
      { slug: "quickdraw", unlocked: true },
      { slug: "pull-shark", unlocked: true },
      { slug: "starstruck", unlocked: true },
    ],
    generatedAt: "2026-08-03T00:00:00.000Z",
  }));
  const partial = createAuditSnapshot(audit({
    sources: {
      achievements: "unavailable",
      mergedPullRequests: "available",
      repositories: "available",
    },
    visibleAchievementCount: null,
    generatedAt: "2026-08-02T00:00:00.000Z",
  }));

  const timeline = buildAuditTimeline(
    { octocat: [latest, partial, baseline, middle] },
    "OCTOCAT",
  );

  assert.deepEqual(
    timeline.map((entry) => entry.snapshot.capturedAt),
    [latest.capturedAt, middle.capturedAt, baseline.capturedAt],
  );
  assert.deepEqual(timeline[0].changes, {
    visibleAchievements: 1,
    mergedPullRequests: 2,
    topRepositoryStars: 0,
    publicRepositories: 1,
    newlyUnlockedSlugs: ["starstruck"],
  });
  assert.deepEqual(timeline[1].changes, {
    visibleAchievements: 0,
    mergedPullRequests: 3,
    topRepositoryStars: 1,
    publicRepositories: 0,
    newlyUnlockedSlugs: [],
  });
  assert.equal(timeline[2].changes, null);
});

test("deduplicates unchanged signals and caps profile history", () => {
  let history = {};

  for (let index = 0; index < MAX_SNAPSHOTS_PER_PROFILE + 3; index += 1) {
    history = appendAuditSnapshot(history, createAuditSnapshot(audit({
      metrics: {
        mergedPullRequests: 12 + index,
        topRepository: { stars: 7 },
      },
      generatedAt: new Date(Date.UTC(2026, 6, 31 + index)).toISOString(),
    })));
  }

  assert.equal(history.octocat.length, MAX_SNAPSHOTS_PER_PROFILE);

  const latest = history.octocat.at(-1);
  const unchangedLater = { ...latest, capturedAt: "2027-01-01T00:00:00.000Z" };
  const deduplicated = appendAuditSnapshot(history, unchangedLater);
  assert.equal(deduplicated.octocat.length, MAX_SNAPSHOTS_PER_PROFILE);
  assert.equal(deduplicated.octocat.at(-1).capturedAt, latest.capturedAt);
});

test("keeps only the most recently observed profiles", () => {
  let history = {};

  for (let index = 0; index < MAX_TRACKED_PROFILES + 2; index += 1) {
    history = appendAuditSnapshot(history, createAuditSnapshot(audit({
      profile: { login: `user-${index}`, publicRepos: index },
      generatedAt: new Date(Date.UTC(2026, 7, index + 1)).toISOString(),
    })));
  }

  assert.equal(Object.keys(history).length, MAX_TRACKED_PROFILES);
  assert.equal("user-0" in history, false);
  assert.equal(`user-${MAX_TRACKED_PROFILES + 1}` in history, true);
});

test("recovers safely from malformed storage and removes one profile", () => {
  assert.deepEqual(parseAuditHistory("not-json"), {});
  assert.deepEqual(parseAuditHistory("[]"), {});

  const snapshot = createAuditSnapshot(audit());
  const serialized = serializeAuditHistory({ octocat: [snapshot] });
  const parsed = parseAuditHistory(serialized);
  assert.deepEqual(parsed, { octocat: [snapshot] });
  assert.deepEqual(removeProfileHistory(parsed, "@Octocat".replace(/^@/, "")), {});
});

test("round-trips a versioned backup with a stable filename", () => {
  const snapshot = createAuditSnapshot(audit());
  const history = { octocat: [snapshot] };
  const exportedAt = "2026-08-04T10:20:30.000Z";
  const serialized = serializeAuditHistoryBackup(history, exportedAt);
  const backup = parseAuditHistoryBackup(serialized);

  assert.equal(backup?.format, "constellation-audit-history");
  assert.equal(backup?.version, 1);
  assert.equal(backup?.exportedAt, exportedAt);
  assert.deepEqual(backup?.history, history);
  assert.equal(countAuditHistorySnapshots(backup.history), 1);
  assert.equal(auditHistoryBackupFilename(exportedAt), "constellation-history-2026-08-04.json");
  assert.equal(auditHistoryBackupFilename("invalid"), "constellation-history-backup.json");
  assert.deepEqual(parseAuditHistoryBackup(serializeAuditHistoryBackup({}, exportedAt))?.history, {});
});

test("rejects malformed, incompatible and internally inconsistent backups", () => {
  const snapshot = createAuditSnapshot(audit());
  const valid = JSON.parse(serializeAuditHistoryBackup({ octocat: [snapshot] }));

  assert.equal(parseAuditHistoryBackup("not-json"), null);
  assert.equal(parseAuditHistoryBackup(JSON.stringify({ ...valid, version: 2 })), null);
  assert.equal(parseAuditHistoryBackup(JSON.stringify({
    ...valid,
    history: { hubot: [snapshot] },
  })), null);
  assert.equal(parseAuditHistoryBackup(JSON.stringify({
    ...valid,
    history: { octocat: [{ ...snapshot, complete: false }] },
  })), null);
  assert.equal(parseAuditHistoryBackup(JSON.stringify({
    ...valid,
    history: { octocat: [{ ...snapshot, mergedPullRequests: null }] },
  })), null);
  assert.equal(parseAuditHistoryBackup(JSON.stringify({
    ...valid,
    history: { "not a login": [{ ...snapshot, login: "not a login" }] },
  })), null);
});

test("merges backups chronologically without duplicating shared observations", () => {
  const baseline = createAuditSnapshot(audit());
  const newer = createAuditSnapshot(audit({
    metrics: { mergedPullRequests: 15, topRepository: { stars: 8 } },
    generatedAt: "2026-08-03T00:00:00.000Z",
  }));
  const importedMiddle = createAuditSnapshot(audit({
    metrics: { mergedPullRequests: 14, topRepository: { stars: 7 } },
    generatedAt: "2026-08-02T00:00:00.000Z",
  }));

  const merged = mergeAuditHistories(
    { octocat: [baseline, newer] },
    { octocat: [baseline, importedMiddle] },
  );

  assert.deepEqual(
    merged.octocat.map((snapshot) => snapshot.capturedAt),
    [baseline.capturedAt, importedMiddle.capturedAt, newer.capturedAt],
  );
  assert.equal(countAuditHistorySnapshots(merged), 3);
});

test("reapplies profile and snapshot retention limits while merging", () => {
  const imported = {};

  for (let profile = 0; profile < MAX_TRACKED_PROFILES + 2; profile += 1) {
    const login = `user-${profile}`;
    imported[login] = [];
    for (let snapshot = 0; snapshot < MAX_SNAPSHOTS_PER_PROFILE + 2; snapshot += 1) {
      imported[login].push(createAuditSnapshot(audit({
        profile: { login, publicRepos: profile },
        metrics: { mergedPullRequests: snapshot, topRepository: { stars: profile } },
        generatedAt: new Date(Date.UTC(2026, 7, profile * 20 + snapshot + 1)).toISOString(),
      })));
    }
  }

  const merged = mergeAuditHistories({}, imported);
  assert.equal(Object.keys(merged).length, MAX_TRACKED_PROFILES);
  assert.ok(Object.values(merged).every((snapshots) => snapshots.length <= MAX_SNAPSHOTS_PER_PROFILE));

  const reparsed = parseAuditHistory(JSON.stringify(imported));
  assert.equal(Object.keys(reparsed).length, MAX_TRACKED_PROFILES);
  assert.equal(`user-${MAX_TRACKED_PROFILES + 1}` in reparsed, true);
});

test("lists recent profiles by their latest complete observation", () => {
  const octocatBaseline = createAuditSnapshot(audit());
  const octocatLatest = createAuditSnapshot(audit({
    metrics: { mergedPullRequests: 18, topRepository: { stars: 9 } },
    visibleAchievementCount: 3,
    generatedAt: "2026-08-04T00:00:00.000Z",
  }));
  const hubotLatest = createAuditSnapshot(audit({
    profile: { login: "hubot", publicRepos: 14 },
    metrics: { mergedPullRequests: 7, topRepository: { stars: 21 } },
    visibleAchievementCount: 1,
    generatedAt: "2026-08-03T00:00:00.000Z",
  }));
  const partialOnly = createAuditSnapshot(audit({
    profile: { login: "monalisa", publicRepos: 4 },
    sources: {
      achievements: "unavailable",
      mergedPullRequests: "available",
      repositories: "available",
    },
    visibleAchievementCount: null,
    generatedAt: "2026-08-05T00:00:00.000Z",
  }));

  const profiles = listRecentAuditProfiles({
    octocat: [octocatLatest, octocatBaseline],
    hubot: [hubotLatest],
    monalisa: [partialOnly],
  });

  assert.deepEqual(profiles.map((profile) => profile.login), ["octocat", "hubot"]);
  assert.deepEqual(profiles[0], {
    login: "octocat",
    lastObservedAt: octocatLatest.capturedAt,
    observationCount: 2,
    visibleAchievementCount: 3,
    mergedPullRequests: 18,
    topRepositoryStars: 9,
    publicRepositories: 8,
  });
});
