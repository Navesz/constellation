import {
  AUDIT_HISTORY_STORAGE_KEY,
  listRecentAuditProfiles,
  parseAuditHistory,
  removeProfileHistory,
  serializeAuditHistory,
  type AuditHistory,
  type RecentAuditProfile,
} from "./audit-history.ts";
import {
  AUDIT_HISTORY_RECORDING_STORAGE_KEY,
  serializeAuditHistoryRecordingPreference,
} from "./audit-history-preference.ts";

type AuditHistoryReadableStorage = Pick<Storage, "getItem">;
type AuditHistoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type AuditHistoryClearTarget =
  | { scope: "profile"; login: string }
  | { scope: "all" };

export type AuditHistoryClearResult = {
  history: AuditHistory;
  recordingPaused: boolean;
};

export function readStoredRecentAuditProfiles(
  storage: AuditHistoryReadableStorage,
): RecentAuditProfile[] {
  return listRecentAuditProfiles(
    parseAuditHistory(storage.getItem(AUDIT_HISTORY_STORAGE_KEY)),
  );
}

export function clearStoredAuditHistory(
  storage: AuditHistoryStorage,
  target: AuditHistoryClearTarget,
): AuditHistoryClearResult {
  const history = parseAuditHistory(storage.getItem(AUDIT_HISTORY_STORAGE_KEY));

  if (target.scope === "all") {
    // Persist the pause before deleting data so a failed second operation cannot
    // leave recording enabled after the user requested a full privacy reset.
    storage.setItem(
      AUDIT_HISTORY_RECORDING_STORAGE_KEY,
      serializeAuditHistoryRecordingPreference(false),
    );
    storage.removeItem(AUDIT_HISTORY_STORAGE_KEY);
    return { history: {}, recordingPaused: true };
  }

  const nextHistory = removeProfileHistory(history, target.login);
  if (Object.keys(nextHistory).length) {
    storage.setItem(AUDIT_HISTORY_STORAGE_KEY, serializeAuditHistory(nextHistory));
  } else {
    storage.removeItem(AUDIT_HISTORY_STORAGE_KEY);
  }

  return { history: nextHistory, recordingPaused: false };
}
