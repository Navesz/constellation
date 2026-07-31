import assert from "node:assert/strict";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { AUDIT_SCHEMA_VERSION } from "../lib/achievements.ts";
import { AUDIT_EXPORT_VERSION } from "../lib/audit-export.ts";
import { openApiDocument } from "../lib/openapi.ts";
import { buildServiceStatus } from "../lib/service-status.ts";

test("builds an explicit application-only status observation", () => {
  const checkedAt = new Date("2026-07-31T12:00:00.000Z");
  const status = buildServiceStatus("https://constellation.example/", checkedAt);

  assert.deepEqual(status, {
    status: "ok",
    service: "constellation",
    auditSchemaVersion: AUDIT_SCHEMA_VERSION,
    auditExportVersion: AUDIT_EXPORT_VERSION,
    dependencies: {
      github: "not-checked",
    },
    contracts: {
      auditSchema: "https://constellation.example/api/audit/schema/2",
      exportSchema: "https://constellation.example/api/export/schema/2",
      openApi: "https://constellation.example/api/openapi.json",
      documentation: "https://constellation.example/docs",
    },
    checkedAt: "2026-07-31T12:00:00.000Z",
  });
});

test("keeps the runtime observation aligned with the advertised OpenAPI schema", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(openApiDocument.components.schemas.ServiceStatus);
  const status = buildServiceStatus(
    "https://constellation.example",
    new Date("2026-07-31T12:00:00.000Z"),
  );

  assert.equal(validate(status), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...status, status: "degraded" }), false);
  assert.equal(validate({ ...status, unexpected: true }), false);
});
