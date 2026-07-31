import type { AuditResponse } from "./achievements.ts";
import { constellationExportFilename } from "./export-filename.ts";
import { PUBLIC_SITE_URL } from "./site.ts";

export const AUDIT_EXPORT_FORMAT = "constellation-audit";
export const AUDIT_EXPORT_VERSION = 2;
export const AUDIT_EXPORT_SCHEMA_PATH = "/api/export/schema/2";
export const LEGACY_AUDIT_EXPORT_SCHEMA_PATH = "/api/export/schema/1";
export const AUDIT_EXPORT_SCHEMA_URL =
  `${PUBLIC_SITE_URL}${AUDIT_EXPORT_SCHEMA_PATH}`;

export type AuditDataExport = {
  $schema: typeof AUDIT_EXPORT_SCHEMA_URL;
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
    $schema: AUDIT_EXPORT_SCHEMA_URL,
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
