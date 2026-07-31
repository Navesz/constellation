import { AUDIT_SCHEMA_VERSION } from "./achievements.ts";
import { AUDIT_SCHEMA_PATH } from "./audit-schema.ts";
import { AUDIT_EXPORT_SCHEMA_PATH, AUDIT_EXPORT_VERSION } from "./audit-export.ts";
import { API_DOCS_PATH, OPENAPI_PATH } from "./openapi.ts";

export function buildServiceStatus(origin: string, now = new Date()) {
  const serviceOrigin = origin.replace(/\/+$/, "");

  return {
    status: "ok",
    service: "constellation",
    auditSchemaVersion: AUDIT_SCHEMA_VERSION,
    auditExportVersion: AUDIT_EXPORT_VERSION,
    dependencies: {
      github: "not-checked",
    },
    contracts: {
      auditSchema: `${serviceOrigin}${AUDIT_SCHEMA_PATH}`,
      exportSchema: `${serviceOrigin}${AUDIT_EXPORT_SCHEMA_PATH}`,
      openApi: `${serviceOrigin}${OPENAPI_PATH}`,
      documentation: `${serviceOrigin}${API_DOCS_PATH}`,
    },
    checkedAt: now.toISOString(),
  } as const;
}
