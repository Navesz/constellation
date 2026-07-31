import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIT_HISTORY_RECORDING_STORAGE_KEY,
  applyAuditHistoryRecordingPreference,
  parseAuditHistoryRecordingPreference,
  serializeAuditHistoryRecordingPreference,
} from "../lib/audit-history-preference.ts";

const completeSnapshot = {
  version: 2,
  login: "octocat",
  capturedAt: "2026-07-31T12:00:00.000Z",
  complete: true,
  followers: 10,
  visibleAchievementCount: 2,
  mergedPullRequests: 3,
  topRepositoryStars: 4,
  publicRepositories: 5,
  unlockedAchievementSlugs: ["quickdraw"],
};

test("defaults to recording while preserving an explicit paused preference", () => {
  assert.equal(AUDIT_HISTORY_RECORDING_STORAGE_KEY, "constellation:audit-history-recording:v1");
  assert.equal(parseAuditHistoryRecordingPreference(null), true);
  assert.equal(parseAuditHistoryRecordingPreference("enabled"), true);
  assert.equal(parseAuditHistoryRecordingPreference("unexpected"), true);
  assert.equal(parseAuditHistoryRecordingPreference("paused"), false);
  assert.equal(serializeAuditHistoryRecordingPreference(true), "enabled");
  assert.equal(serializeAuditHistoryRecordingPreference(false), "paused");
});

test("does not mutate history while recording is paused", () => {
  const history = { octocat: [{ ...completeSnapshot, capturedAt: "2026-07-30T12:00:00.000Z" }] };
  const result = applyAuditHistoryRecordingPreference(history, completeSnapshot, false);

  assert.equal(result.recorded, false);
  assert.equal(result.history, history);
  assert.equal(result.history.octocat.length, 1);
});

test("records only complete snapshots after the preference is enabled", () => {
  const enabled = applyAuditHistoryRecordingPreference({}, completeSnapshot, true);
  const partial = applyAuditHistoryRecordingPreference(
    enabled.history,
    { ...completeSnapshot, capturedAt: "2026-08-01T12:00:00.000Z", complete: false },
    true,
  );

  assert.equal(enabled.recorded, true);
  assert.equal(enabled.history.octocat.length, 1);
  assert.equal(partial.recorded, false);
  assert.equal(partial.history, enabled.history);
});
