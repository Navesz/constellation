import {
  appendAuditSnapshot,
  type AuditHistory,
  type AuditSnapshot,
} from "./audit-history.ts";

export const AUDIT_HISTORY_RECORDING_STORAGE_KEY =
  "constellation:audit-history-recording:v1";

export function parseAuditHistoryRecordingPreference(value: string | null) {
  return value !== "paused";
}

export function serializeAuditHistoryRecordingPreference(enabled: boolean) {
  return enabled ? "enabled" : "paused";
}

export function applyAuditHistoryRecordingPreference(
  history: AuditHistory,
  snapshot: AuditSnapshot,
  enabled: boolean,
) {
  if (!enabled || !snapshot.complete) {
    return { history, recorded: false } as const;
  }

  return {
    history: appendAuditSnapshot(history, snapshot),
    recorded: true,
  } as const;
}
