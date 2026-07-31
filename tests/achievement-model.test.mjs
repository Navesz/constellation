import assert from "node:assert/strict";
import test from "node:test";
import { buildAchievementProgress, selectNextMission } from "../lib/achievements.ts";
import {
  githubAchievementDetailUrl,
  normalizeGitHubLogin,
  parseVisibleAchievements,
} from "../lib/github-profile.ts";

test("normalizes valid GitHub logins and rejects malformed values", () => {
  assert.equal(normalizeGitHubLogin("  @octocat  "), "octocat");
  assert.equal(normalizeGitHubLogin("a".repeat(39)), "a".repeat(39));
  assert.equal(normalizeGitHubLogin("-invalid"), null);
  assert.equal(normalizeGitHubLogin("invalid-"), null);
  assert.equal(normalizeGitHubLogin("a".repeat(40)), null);
});

test("builds safe GitHub detail links for visible achievements", () => {
  assert.equal(
    githubAchievementDetailUrl("Navesz", "Pull-Shark"),
    "https://github.com/Navesz?achievement=pull-shark&tab=achievements",
  );
  assert.equal(githubAchievementDetailUrl("not a login", "pull-shark"), null);
  assert.equal(githubAchievementDetailUrl("octocat", "pull-shark/escape"), null);
});

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

test("keeps private badge progress unknown and out of the next mission", () => {
  const progress = buildAchievementProgress([], {
    mergedPullRequests: 3,
    topRepositoryStars: 0,
  });

  const quickdraw = progress.find((item) => item.slug === "quickdraw");
  assert.equal(quickdraw.current, null);
  assert.equal(quickdraw.nextThreshold, 1);
  assert.equal(quickdraw.measurementKind, "not-public");
  assert.equal(quickdraw.progressLabel, "progresso não público");

  const mission = selectNextMission(progress);
  assert.equal(mission?.slug, "pull-shark");
  assert.equal(mission?.current, 3);
  assert.equal(mission?.nextThreshold, 16);
});

test("returns no mission when every available counter is private", () => {
  const progress = buildAchievementProgress([], {});
  assert.equal(selectNextMission(progress), null);
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

test("models official historical achievements without making them actionable", () => {
  const progress = buildAchievementProgress(
    [
      { name: "Mars 2020 Contributor", slug: "mars-2020-contributor", tier: 1 },
      { name: "Arctic Code Vault Contributor", slug: "arctic-code-vault-contributor", tier: 1 },
    ],
    {},
  );

  const mars = progress.find((item) => item.slug === "mars-2020-contributor");
  const arctic = progress.find((item) => item.slug === "arctic-code-vault-contributor");
  assert.ok(mars);
  assert.ok(arctic);
  assert.equal(mars.catalogStatus, "modeled");
  assert.equal(mars.earningStatus, "historical");
  assert.match(mars.documentationUrl, /^https:\/\/docs\.github\.com\//);
  assert.equal(mars.unlocked, true);
  assert.equal(mars.current, 1);
  assert.equal(mars.nextThreshold, null);
  assert.equal(mars.measurementKind, "confirmed-minimum");
  assert.equal(mars.progressLabel, "reconhecimento histórico confirmado");
  assert.equal(mars.confidenceLabel, "reconhecimento histórico confirmado pelo selo");
  assert.equal(arctic.earningStatus, "historical");
  assert.match(arctic.documentationUrl, /^https:\/\/archiveprogram\.github\.com\//);
  assert.equal(selectNextMission(progress), null);
});

test("keeps newly released or unknown achievements discoverable", () => {
  const progress = buildAchievementProgress(
    [{ name: "Open Sourcerer", slug: "open-sourcerer", tier: 1 }],
    {},
  );

  const discovered = progress.find((item) => item.slug === "open-sourcerer");
  assert.ok(discovered);
  assert.equal(discovered.catalogStatus, "discovered");
  assert.equal(discovered.earningStatus, "unknown");
  assert.equal(discovered.documentationUrl, null);
  assert.equal(discovered.unlocked, true);
  assert.equal(discovered.current, null);
  assert.equal(discovered.nextThreshold, null);
  assert.equal(discovered.measurementKind, "not-public");
  assert.equal(discovered.progressLabel, "selo público detectado");
});
