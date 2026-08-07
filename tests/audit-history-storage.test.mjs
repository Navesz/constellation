import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIT_HISTORY_STORAGE_KEY,
  parseAuditHistory,
  serializeAuditHistory,
} from "../lib/audit-history.ts";
import {
  AUDIT_HISTORY_RECORDING_STORAGE_KEY,
  parseAuditHistoryRecordingPreference,
} from "../lib/audit-history-preference.ts";
import { clearStoredAuditHistory } from "../lib/audit-history-storage.ts";

function snapshot(login, capturedAt) {
  return {
    version: 2,
    login,
    capturedAt,
    complete: true,
    followers: 10,
    visibleAchievementCount: 2,
    mergedPullRequests: 3,
    topRepositoryStars: 4,
    publicRepositories: 5,
    unlockedAchievementSlugs: ["quickdraw"],
  };
}

function memoryStorage(entries) {
  const values = new Map(entries);
  const operations = [];
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      operations.push(["set", key, value]);
      values.set(key, value);
    },
    removeItem(key) {
      operations.push(["remove", key]);
      values.delete(key);
    },
    operations,
  };
}

const history = {
  octocat: [snapshot("octocat", "2026-08-01T12:00:00.000Z")],
  hubot: [snapshot("hubot", "2026-08-02T12:00:00.000Z")],
};

test("clears one stored profile without changing the recording preference", () => {
  const storage = memoryStorage([
    [AUDIT_HISTORY_STORAGE_KEY, serializeAuditHistory(history)],
    [AUDIT_HISTORY_RECORDING_STORAGE_KEY, "enabled"],
  ]);

  const result = clearStoredAuditHistory(storage, { scope: "profile", login: "OctoCat" });

  assert.equal(result.recordingPaused, false);
  assert.deepEqual(Object.keys(result.history), ["hubot"]);
  assert.deepEqual(
    Object.keys(parseAuditHistory(storage.getItem(AUDIT_HISTORY_STORAGE_KEY))),
    ["hubot"],
  );
  assert.equal(storage.getItem(AUDIT_HISTORY_RECORDING_STORAGE_KEY), "enabled");
});

test("clears every stored profile only after persisting a recording pause", () => {
  const storage = memoryStorage([
    [AUDIT_HISTORY_STORAGE_KEY, serializeAuditHistory(history)],
    [AUDIT_HISTORY_RECORDING_STORAGE_KEY, "enabled"],
  ]);

  const result = clearStoredAuditHistory(storage, { scope: "all" });

  assert.deepEqual(result, { history: {}, recordingPaused: true });
  assert.equal(storage.getItem(AUDIT_HISTORY_STORAGE_KEY), null);
  assert.equal(
    parseAuditHistoryRecordingPreference(
      storage.getItem(AUDIT_HISTORY_RECORDING_STORAGE_KEY),
    ),
    false,
  );
  assert.deepEqual(storage.operations.map(([operation, key]) => [operation, key]), [
    ["set", AUDIT_HISTORY_RECORDING_STORAGE_KEY],
    ["remove", AUDIT_HISTORY_STORAGE_KEY],
  ]);
});
