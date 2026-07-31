import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SNAPSHOTS_PER_PROFILE,
  MAX_TRACKED_PROFILES,
  appendAuditSnapshot,
  compareAuditSnapshots,
  createAuditSnapshot,
  findComparisonSnapshot,
  parseAuditHistory,
  removeProfileHistory,
  serializeAuditHistory,
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
