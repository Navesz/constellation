import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProfileComparisonPath,
  compareProfiles,
  comparisonAchievementLabel,
} from "../lib/profile-comparison.ts";

function achievement(slug, unlocked, overrides = {}) {
  return {
    slug,
    name: slug === "pull-shark" ? "Pull Shark" : "Quickdraw",
    unlocked,
    tier: unlocked ? 1 : 0,
    current: unlocked ? 2 : 0,
    nextThreshold: unlocked ? 16 : 1,
    badgeStatus: unlocked ? "visible" : "not-visible",
    measurementKind: unlocked ? "confirmed-minimum" : "not-public",
    earningStatus: "active",
    ...overrides,
  };
}

function audit(overrides = {}) {
  return {
    profile: { followers: 100, publicRepos: 8 },
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

test("builds an ordered comparison route and rejects ambiguous pairs", () => {
  assert.equal(
    buildProfileComparisonPath("OctoCat", "hubot"),
    "/?login=OctoCat&compare=hubot",
  );
  assert.throws(
    () => buildProfileComparisonPath("octocat", "OCTOCAT"),
    /dois logins válidos e diferentes/,
  );
  assert.throws(
    () => buildProfileComparisonPath("-invalid", "hubot"),
    /dois logins válidos e diferentes/,
  );
});

test("compares equivalent public metrics with an explicit secondary-minus-primary delta", () => {
  const comparison = compareProfiles(
    audit(),
    audit({
      profile: { followers: 130, publicRepos: 10 },
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
      { id: "followers", difference: 30, leader: "secondary" },
      { id: "publicRepositories", difference: 2, leader: "secondary" },
    ],
  );
});

test("reverses delta direction when the primary and secondary profiles are swapped", () => {
  const primary = audit();
  const secondary = audit({
    profile: { followers: 130, publicRepos: 10 },
    metrics: { mergedPullRequests: 9, topRepository: { stars: 11 } },
    visibleAchievementCount: 3,
  });
  const forward = compareProfiles(primary, secondary);
  const reversed = compareProfiles(secondary, primary);

  for (const metric of forward.metrics) {
    const reversedMetric = reversed.metrics.find((item) => item.id === metric.id);
    assert.equal(reversedMetric.difference, -metric.difference);
    assert.equal(
      reversedMetric.leader,
      metric.leader === "primary" ? "secondary" : metric.leader === "secondary" ? "primary" : metric.leader,
    );
  }
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

test("does not format a private achievement counter as zero progress", () => {
  const comparison = compareProfiles(
    audit({ achievements: [achievement("quickdraw", false, { current: null })] }),
    audit({ achievements: [achievement("quickdraw", false, { current: null })] }),
  );

  const quickdraw = comparison.achievements.find((item) => item.slug === "quickdraw");
  assert.equal(quickdraw.primary.current, null);
  assert.equal(quickdraw.primary.measurementKind, "not-public");
  assert.equal(comparisonAchievementLabel(quickdraw.primary), "Progresso não público");
});

test("does not present a historical achievement as future progress", () => {
  const comparison = compareProfiles(
    audit({
      achievements: [achievement("mars-2020-contributor", false, {
        name: "Mars 2020 Contributor",
        current: null,
        nextThreshold: null,
        earningStatus: "historical",
      })],
    }),
    audit({
      achievements: [achievement("mars-2020-contributor", true, {
        name: "Mars 2020 Contributor",
        current: 1,
        nextThreshold: null,
        earningStatus: "historical",
      })],
    }),
  );

  const historical = comparison.achievements.find((item) => item.slug === "mars-2020-contributor");
  assert.equal(comparisonAchievementLabel(historical.primary), "Evento histórico encerrado");
  assert.equal(comparisonAchievementLabel(historical.secondary), "Histórica · visível");
});
