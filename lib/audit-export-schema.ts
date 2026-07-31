import { AUDIT_SCHEMA_PATH } from "./audit-schema.ts";
import {
  AUDIT_EXPORT_FORMAT,
  AUDIT_EXPORT_SCHEMA_URL,
  AUDIT_EXPORT_VERSION,
  LEGACY_AUDIT_EXPORT_SCHEMA_PATH,
} from "./audit-export.ts";
import { PUBLIC_SITE_URL } from "./site.ts";

const auditSchemaUrl = `${PUBLIC_SITE_URL}${AUDIT_SCHEMA_PATH}`;
const legacyExportSchemaUrl = `${PUBLIC_SITE_URL}${LEGACY_AUDIT_EXPORT_SCHEMA_PATH}`;
const commonProperties = {
  format: { const: AUDIT_EXPORT_FORMAT },
  exportedAt: { type: "string", format: "date-time" },
  shareUrl: { type: "string", format: "uri", pattern: "^https?://" },
  privacy: {
    type: "object",
    additionalProperties: false,
    required: ["publicDataOnly", "includesLocalHistory"],
    properties: {
      publicDataOnly: { const: true },
      includesLocalHistory: { const: false },
    },
  },
  primary: { $ref: auditSchemaUrl },
  comparison: {
    anyOf: [{ $ref: auditSchemaUrl }, { type: "null" }],
  },
} as const;

const commonRequired = [
  "format",
  "version",
  "exportedAt",
  "shareUrl",
  "privacy",
  "primary",
  "comparison",
] as const;

export const legacyAuditExportJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: legacyExportSchemaUrl,
  title: "Constellation audit export v1",
  description: "Legacy public-data export produced by Constellation before self-describing files.",
  type: "object",
  additionalProperties: false,
  required: commonRequired,
  properties: {
    ...commonProperties,
    version: { const: 1 },
  },
} as const;

export const auditExportJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: AUDIT_EXPORT_SCHEMA_URL,
  title: `Constellation audit export v${AUDIT_EXPORT_VERSION}`,
  description: "A self-describing public-data export produced by Constellation without local browser history.",
  type: "object",
  additionalProperties: false,
  required: ["$schema", ...commonRequired],
  properties: {
    $schema: { const: AUDIT_EXPORT_SCHEMA_URL },
    ...commonProperties,
    version: { const: AUDIT_EXPORT_VERSION },
  },
} as const;

export const AUDIT_EXPORT_SCHEMA_ALIAS_PATH = "/api/export/schema";
