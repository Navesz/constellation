import assert from "node:assert/strict";
import test from "node:test";
import { countAchievementFilters, filterAchievements } from "../lib/achievement-filters.ts";

function achievement(slug, overrides = {}) {
  return {
    slug,
    catalogStatus: "modeled",
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
    catalogStatus: "discovered",
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
    ["pull-shark", "mars-2020-contributor"],
  );
});

test("keeps actionable progress separate from private and unavailable counters", () => {
  assert.deepEqual(
    filterAchievements(achievements, "actionable").map((item) => item.slug),
    ["pull-shark", "starstruck"],
  );
  assert.deepEqual(
    filterAchievements(achievements, "withoutPublicCounter").map((item) => item.slug),
    ["quickdraw", "mars-2020-contributor", "galaxy-brain"],
  );
});

test("counts overlapping filters without changing the full catalog", () => {
  assert.deepEqual(countAchievementFilters(achievements), {
    all: 5,
    visible: 2,
    actionable: 2,
    withoutPublicCounter: 3,
  });
  assert.equal(filterAchievements(achievements, "all"), achievements);
});
