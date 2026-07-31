import assert from "node:assert/strict";
import test from "node:test";
import { buildAchievementProgress } from "../lib/achievements.ts";
import { parseVisibleAchievements } from "../lib/github-profile.ts";

test("parses achievement tiers and keeps the highest duplicate tier", () => {
  const html = `
    <a href="/octocat?achievement=pull-shark&amp;tab=achievements">
      <img alt="Achievement: Pull Shark"><span> x2 </span>
    </a>
    <a href="/octocat?achievement=pull-shark&tab=achievements">
      <img alt="Achievement: Pull Shark"><span>x1</span>
    </a>
    <a href="/octocat?achievement=quickdraw&amp;tab=achievements">
      <img alt="Achievement: Quickdraw">
    </a>`;

  assert.deepEqual(parseVisibleAchievements(html), [
    { name: "Pull Shark", slug: "pull-shark", tier: 2 },
    { name: "Quickdraw", slug: "quickdraw", tier: 1 },
  ]);
});

test("labels badge-derived counts as confirmed minimums", () => {
  const progress = buildAchievementProgress(
    [{ name: "Pull Shark", slug: "pull-shark", tier: 2 }],
    { mergedPullRequests: 1, topRepositoryStars: 7 },
  );

  const pullShark = progress.find((item) => item.slug === "pull-shark");
  assert.equal(pullShark.current, 16);
  assert.equal(pullShark.nextThreshold, 128);
  assert.equal(pullShark.currentIsMinimum, true);
  assert.equal(pullShark.progressLabel, "pelo menos 16 de 128");
  assert.equal(pullShark.confidenceLabel, "mínimo confirmado pelo selo");
});

test("keeps public repository stars as a measured signal", () => {
  const progress = buildAchievementProgress([], {
    mergedPullRequests: 0,
    topRepositoryStars: 7,
  });

  const starstruck = progress.find((item) => item.slug === "starstruck");
  assert.equal(starstruck.unlocked, false);
  assert.equal(starstruck.current, 7);
  assert.equal(starstruck.nextThreshold, 16);
  assert.equal(starstruck.measurementKind, "measured");
  assert.equal(starstruck.progressLabel, "7 de 16");
});

test("marks badge-only progress as unknown when the achievement scan is unavailable", () => {
  const progress = buildAchievementProgress(
    [],
    {},
    { achievementScanAvailable: false },
  );

  const quickdraw = progress.find((item) => item.slug === "quickdraw");
  assert.equal(quickdraw.unlocked, false);
  assert.equal(quickdraw.badgeStatus, "unavailable");
  assert.equal(quickdraw.nextThreshold, null);
  assert.equal(quickdraw.measurementKind, "unavailable");
  assert.equal(quickdraw.progressLabel, "estado temporariamente indisponível");
});

test("preserves measured progress when only the badge scan is unavailable", () => {
  const progress = buildAchievementProgress(
    [],
    { mergedPullRequests: 3 },
    { achievementScanAvailable: false },
  );

  const pullShark = progress.find((item) => item.slug === "pull-shark");
  assert.equal(pullShark.unlocked, false);
  assert.equal(pullShark.badgeStatus, "unavailable");
  assert.equal(pullShark.current, 3);
  assert.equal(pullShark.nextThreshold, 16);
  assert.equal(pullShark.measurementKind, "measured");
});
