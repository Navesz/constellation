import type { AuditResponse } from "./achievements.ts";
import { isAuditResponse } from "./audit-contract.ts";
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

export type ParsedAuditDataExport = {
  sourceVersion: 1 | typeof AUDIT_EXPORT_VERSION;
  data: AuditDataExport;
};

export const INVALID_AUDIT_EXPORT_MESSAGE =
  "O arquivo não é uma exportação válida do Constellation.";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(value: UnknownRecord, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function webUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function validPrivacy(value: unknown): value is AuditDataExport["privacy"] {
  return record(value) &&
    hasExactKeys(value, ["publicDataOnly", "includesLocalHistory"]) &&
    value.publicDataOnly === true &&
    value.includesLocalHistory === false;
}

export function parseAuditDataExport(value: unknown): ParsedAuditDataExport | null {
  if (!record(value)) return null;
  const version = value.version;
  const commonKeys = [
    "format",
    "version",
    "exportedAt",
    "shareUrl",
    "privacy",
    "primary",
    "comparison",
  ] as const;
  const isCurrent = version === AUDIT_EXPORT_VERSION;
  const isLegacy = version === 1;

  if (!isCurrent && !isLegacy) return null;
  if (!hasExactKeys(value, isCurrent ? ["$schema", ...commonKeys] : commonKeys)) return null;
  if (isCurrent && value.$schema !== AUDIT_EXPORT_SCHEMA_URL) return null;
  if (
    value.format !== AUDIT_EXPORT_FORMAT ||
    !validDate(value.exportedAt) ||
    !webUrl(value.shareUrl) ||
    !validPrivacy(value.privacy) ||
    !isAuditResponse(value.primary) ||
    (value.comparison !== null && !isAuditResponse(value.comparison))
  ) {
    return null;
  }

  return {
    sourceVersion: version,
    data: {
      $schema: AUDIT_EXPORT_SCHEMA_URL,
      format: AUDIT_EXPORT_FORMAT,
      version: AUDIT_EXPORT_VERSION,
      exportedAt: value.exportedAt,
      shareUrl: value.shareUrl,
      privacy: value.privacy,
      primary: value.primary,
      comparison: value.comparison,
    },
  };
}

export function readAuditDataExport(contents: string) {
  let value: unknown;
  try {
    value = JSON.parse(contents.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(INVALID_AUDIT_EXPORT_MESSAGE);
  }

  const parsed = parseAuditDataExport(value);
  if (!parsed) throw new Error(INVALID_AUDIT_EXPORT_MESSAGE);
  return parsed;
}

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
