import assert from "node:assert/strict";
import test from "node:test";
import { compareProfiles } from "../lib/profile-comparison.ts";

function achievement(slug, unlocked, overrides = {}) {
  return {
    slug,
    name: slug === "pull-shark" ? "Pull Shark" : "Quickdraw",
    unlocked,
    tier: unlocked ? 1 : 0,
    current: unlocked ? 2 : 0,
    nextThreshold: unlocked ? 16 : 1,
    badgeStatus: unlocked ? "visible" : "not-visible",
    ...overrides,
  };
}

function audit(overrides = {}) {
  return {
    profile: { publicRepos: 8 },
    metrics: {
      mergedPullRequests: 12,
      topRepository: { stars: 7 },
    },
    sources: { repositories: "available" },
    visibleAchievementCount: 2,
    achievements: [
      achievement("quickdraw", true),
      achievement("pull-shark", true),
    ],
    ...overrides,
  };
}

test("compares equivalent public metrics with an explicit secondary-minus-primary delta", () => {
  const comparison = compareProfiles(
    audit(),
    audit({
      profile: { publicRepos: 10 },
      metrics: { mergedPullRequests: 9, topRepository: { stars: 11 } },
      visibleAchievementCount: 3,
    }),
  );

  assert.deepEqual(
    comparison.metrics.map(({ id, difference, leader }) => ({ id, difference, leader })),
    [
      { id: "visibleAchievements", difference: 1, leader: "secondary" },
      { id: "mergedPullRequests", difference: -3, leader: "primary" },
      { id: "topRepositoryStars", difference: 4, leader: "secondary" },
      { id: "publicRepositories", difference: 2, leader: "secondary" },
    ],
  );
});

test("keeps an unavailable metric unknown instead of treating it as zero", () => {
  const comparison = compareProfiles(
    audit(),
    audit({
      metrics: { mergedPullRequests: null, topRepository: null },
      sources: { repositories: "unavailable" },
      visibleAchievementCount: null,
    }),
  );

  for (const id of ["visibleAchievements", "mergedPullRequests", "topRepositoryStars"]) {
    const metric = comparison.metrics.find((item) => item.id === id);
    assert.equal(metric.secondary, null);
    assert.equal(metric.difference, null);
    assert.equal(metric.leader, "unknown");
  }
});

test("summarizes shared and profile-exclusive visible achievements", () => {
  const comparison = compareProfiles(
    audit(),
    audit({
      achievements: [
        achievement("quickdraw", true),
        achievement("pull-shark", false),
        achievement("starstruck", true, { name: "Starstruck" }),
      ],
    }),
  );

  assert.equal(comparison.sharedUnlocked, 1);
  assert.deepEqual(comparison.primaryOnlyUnlocked, ["pull-shark"]);
  assert.deepEqual(comparison.secondaryOnlyUnlocked, ["starstruck"]);
  assert.equal(comparison.achievements.length, 3);
});
