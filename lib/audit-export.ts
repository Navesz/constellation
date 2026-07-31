import type { AuditResponse } from "./achievements.ts";
import { constellationExportFilename } from "./export-filename.ts";

export const AUDIT_EXPORT_FORMAT = "constellation-audit";
export const AUDIT_EXPORT_VERSION = 1;

export type AuditDataExport = {
  format: typeof AUDIT_EXPORT_FORMAT;
  version: typeof AUDIT_EXPORT_VERSION;
  exportedAt: string;
  shareUrl: string;
  privacy: {
    publicDataOnly: true;
    includesLocalHistory: false;
  };
  primary: AuditResponse;
  comparison: AuditResponse | null;
};

export type AuditDataExportOptions = {
  audit: AuditResponse;
  comparison?: AuditResponse | null;
  shareUrl: string;
  exportedAt?: string;
};

export function buildAuditDataExport({
  audit,
  comparison,
  shareUrl,
  exportedAt = new Date().toISOString(),
}: AuditDataExportOptions): AuditDataExport {
  return {
    format: AUDIT_EXPORT_FORMAT,
    version: AUDIT_EXPORT_VERSION,
    exportedAt,
    shareUrl,
    privacy: {
      publicDataOnly: true,
      includesLocalHistory: false,
    },
    primary: audit,
    comparison: comparison ?? null,
  };
}

export function serializeAuditDataExport(options: AuditDataExportOptions) {
  return `${JSON.stringify(buildAuditDataExport(options), null, 2)}\n`;
}

export function auditDataFilename(login: string, comparisonLogin?: string | null) {
  return constellationExportFilename(login, comparisonLogin, "json");
}
