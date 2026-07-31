import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SNAPSHOTS_PER_PROFILE,
  MAX_TRACKED_PROFILES,
  appendAuditSnapshot,
  auditHistoryBackupFilename,
  auditTimelineCsvFilename,
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
  serializeAuditTimelineCsv,
} from "../lib/audit-history.ts";

function audit(overrides = {}) {
  return {
    profile: { login: "octocat", followers: 18_400, publicRepos: 8 },
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
    version: 2,
    login: "octocat",
    capturedAt: "2026-07-31T00:00:00.000Z",
    complete: true,
    followers: 18_400,
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
    followers: 0,
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
    profile: { login: "octocat", followers: 18_410, publicRepos: 9 },
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
    followers: 10,
    visibleAchievements: 1,
    mergedPullRequests: 2,
    topRepositoryStars: 0,
    publicRepositories: 1,
    newlyUnlockedSlugs: ["starstruck"],
  });
  assert.deepEqual(timeline[1].changes, {
    followers: 0,
    visibleAchievements: 0,
    mergedPullRequests: 3,
    topRepositoryStars: 1,
    publicRepositories: 0,
    newlyUnlockedSlugs: [],
  });
  assert.equal(timeline[2].changes, null);
});

test("exports a chronological spreadsheet timeline with values and deltas", () => {
  const baseline = createAuditSnapshot(audit());
  const latest = createAuditSnapshot(audit({
    profile: { login: "octocat", followers: 18_410, publicRepos: 9 },
    metrics: { mergedPullRequests: 15, topRepository: { stars: 8 } },
    visibleAchievementCount: 3,
    achievements: [
      { slug: "quickdraw", unlocked: true },
      { slug: "pull-shark", unlocked: true },
      { slug: "starstruck", unlocked: true },
    ],
    generatedAt: "2026-08-03T00:00:00.000Z",
  }));
  const timeline = buildAuditTimeline({ octocat: [latest, baseline] }, "octocat");
  const csv = serializeAuditTimelineCsv(timeline);
  const lines = csv.slice(1).trimEnd().split("\r\n");

  assert.equal(csv.startsWith("\uFEFFcaptured_at,login,followers"), true);
  assert.equal(lines.length, 3);
  assert.equal(
    lines[0],
    "captured_at,login,followers,visible_achievements,merged_pull_requests,top_repository_stars,public_repositories,unlocked_achievements,followers_change,visible_achievements_change,merged_pull_requests_change,top_repository_stars_change,public_repositories_change,newly_unlocked_achievements",
  );
  assert.equal(
    lines[1],
    "2026-07-31T00:00:00.000Z,octocat,18400,2,12,7,8,quickdraw|pull-shark,,,,,,",
  );
  assert.equal(
    lines[2],
    "2026-08-03T00:00:00.000Z,octocat,18410,3,15,8,9,quickdraw|pull-shark|starstruck,10,1,3,1,1,starstruck",
  );
  assert.equal(
    auditTimelineCsvFilename("OctoCat", "2026-08-04T10:20:30.000Z"),
    "constellation-timeline-octocat-2026-08-04.csv",
  );
  assert.equal(
    auditTimelineCsvFilename("***", "invalid"),
    "constellation-timeline-perfil-export.csv",
  );
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

  const followerChange = {
    ...latest,
    followers: latest.followers + 1,
    capturedAt: "2027-01-02T00:00:00.000Z",
  };
  const changed = appendAuditSnapshot(deduplicated, followerChange);
  assert.equal(changed.octocat.at(-1).capturedAt, followerChange.capturedAt);
  assert.equal(changed.octocat.at(-1).followers, followerChange.followers);
});

test("keeps only the most recently observed profiles", () => {
  let history = {};

  for (let index = 0; index < MAX_TRACKED_PROFILES + 2; index += 1) {
    history = appendAuditSnapshot(history, createAuditSnapshot(audit({
      profile: { login: `user-${index}`, followers: index * 10, publicRepos: index },
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
  assert.equal(backup?.version, 2);
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
  assert.equal(parseAuditHistoryBackup(JSON.stringify({ ...valid, version: 3 })), null);
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
    history: { octocat: [{ ...snapshot, followers: -1 }] },
  })), null);
  const missingFollowers = { ...snapshot };
  delete missingFollowers.followers;
  assert.equal(parseAuditHistoryBackup(JSON.stringify({
    ...valid,
    history: { octocat: [missingFollowers] },
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

test("migrates legacy history and version 1 backups without inventing followers", () => {
  const current = createAuditSnapshot(audit());
  const legacy = { ...current, version: 1 };
  delete legacy.followers;

  const parsedHistory = parseAuditHistory(JSON.stringify({ octocat: [legacy] }));
  assert.equal(parsedHistory.octocat[0].version, 2);
  assert.equal(parsedHistory.octocat[0].followers, null);

  const legacyBackup = JSON.stringify({
    format: "constellation-audit-history",
    version: 1,
    exportedAt: "2026-08-04T10:20:30.000Z",
    history: { octocat: [legacy] },
  });
  const migratedBackup = parseAuditHistoryBackup(legacyBackup);
  assert.equal(migratedBackup?.version, 2);
  assert.equal(migratedBackup?.history.octocat[0].followers, null);
  assert.equal(compareAuditSnapshots(current, migratedBackup.history.octocat[0]).followers, null);
});

test("reapplies profile and snapshot retention limits while merging", () => {
  const imported = {};

  for (let profile = 0; profile < MAX_TRACKED_PROFILES + 2; profile += 1) {
    const login = `user-${profile}`;
    imported[login] = [];
    for (let snapshot = 0; snapshot < MAX_SNAPSHOTS_PER_PROFILE + 2; snapshot += 1) {
      imported[login].push(createAuditSnapshot(audit({
        profile: { login, followers: profile * 10, publicRepos: profile },
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
    profile: { login: "hubot", followers: 200, publicRepos: 14 },
    metrics: { mergedPullRequests: 7, topRepository: { stars: 21 } },
    visibleAchievementCount: 1,
    generatedAt: "2026-08-03T00:00:00.000Z",
  }));
  const partialOnly = createAuditSnapshot(audit({
    profile: { login: "monalisa", followers: 10, publicRepos: 4 },
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
    followers: 18_400,
    visibleAchievementCount: 3,
    mergedPullRequests: 18,
    topRepositoryStars: 9,
    publicRepositories: 8,
  });
});
