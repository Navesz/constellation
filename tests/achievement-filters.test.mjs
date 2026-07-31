import assert from "node:assert/strict";
import test from "node:test";
import { countAchievementFilters, filterAchievements } from "../lib/achievement-filters.ts";

function achievement(slug, overrides = {}) {
  return {
    slug,
    catalogStatus: "modeled",
    earningStatus: "active",
    unlocked: false,
    current: null,
    nextThreshold: 1,
    measurementKind: "not-public",
    ...overrides,
  };
}

const achievements = [
  achievement("pull-shark", {
    unlocked: true,
    current: 4,
    nextThreshold: 16,
    measurementKind: "measured",
  }),
  achievement("starstruck", {
    current: 7,
    nextThreshold: 16,
    measurementKind: "measured",
  }),
  achievement("quickdraw"),
  achievement("mars-2020-contributor", {
    earningStatus: "historical",
    unlocked: true,
    nextThreshold: null,
  }),
  achievement("open-sourcerer", {
    catalogStatus: "discovered",
    earningStatus: "unknown",
    unlocked: true,
    nextThreshold: null,
  }),
  achievement("galaxy-brain", {
    nextThreshold: null,
    measurementKind: "unavailable",
  }),
];

test("filters visible achievements without requiring a public counter", () => {
  assert.deepEqual(
    filterAchievements(achievements, "visible").map((item) => item.slug),
    ["pull-shark", "mars-2020-contributor", "open-sourcerer"],
  );
});

test("keeps actionable progress separate from private and unavailable counters", () => {
  assert.deepEqual(
    filterAchievements(achievements, "actionable").map((item) => item.slug),
    ["pull-shark", "starstruck"],
  );
  assert.deepEqual(
    filterAchievements(achievements, "withoutPublicCounter").map((item) => item.slug),
    ["quickdraw", "mars-2020-contributor", "open-sourcerer", "galaxy-brain"],
  );
  assert.deepEqual(
    filterAchievements(achievements, "historical").map((item) => item.slug),
    ["mars-2020-contributor"],
  );
});

test("counts overlapping filters without changing the full catalog", () => {
  assert.deepEqual(countAchievementFilters(achievements), {
    all: 6,
    visible: 3,
    actionable: 2,
    historical: 1,
    withoutPublicCounter: 4,
  });
  assert.equal(filterAchievements(achievements, "all"), achievements);
});
