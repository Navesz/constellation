import assert from "node:assert/strict";
import test from "node:test";
import { AUDIT_SCHEMA_VERSION } from "../lib/achievements.ts";
import { AUDIT_SCHEMA_PATH } from "../lib/audit-schema.ts";
import {
  AUDIT_EXPORT_SCHEMA_PATH,
  LEGACY_AUDIT_EXPORT_SCHEMA_PATH,
} from "../lib/audit-export.ts";
import { AUDIT_EXPORT_SCHEMA_ALIAS_PATH } from "../lib/audit-export-schema.ts";
import {
  API_DOCS_LINK_HEADER,
  API_DOCS_PATH,
  OPENAPI_LINK_HEADER,
  OPENAPI_MEDIA_TYPE,
  OPENAPI_PATH,
  PUBLIC_API_LINK_HEADER,
  PUBLIC_SITE_URL,
  STATUS_LINK_HEADER,
  STATUS_PATH,
  openApiDocument,
} from "../lib/openapi.ts";
import { PUBLIC_API_REQUEST_ID_HEADER } from "../lib/public-api.ts";

test("publishes a discoverable OpenAPI 3.1.1 entry document", () => {
  assert.equal(openApiDocument.openapi, "3.1.1");
  assert.equal(openApiDocument.info.version, `${AUDIT_SCHEMA_VERSION}.0.0`);
  assert.equal(openApiDocument.jsonSchemaDialect, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(openApiDocument.servers[0].url, PUBLIC_SITE_URL);
  assert.equal(OPENAPI_PATH, "/api/openapi.json");
  assert.equal(API_DOCS_PATH, "/docs");
  assert.equal(STATUS_PATH, "/api/status");
  assert.equal(OPENAPI_MEDIA_TYPE, "application/openapi+json");
  assert.equal(
    OPENAPI_LINK_HEADER,
    '</api/openapi.json>; rel="service-desc"; type="application/openapi+json"',
  );
  assert.equal(
    API_DOCS_LINK_HEADER,
    '</docs>; rel="service-doc"; type="text/html"',
  );
  assert.equal(
    STATUS_LINK_HEADER,
    '</api/status>; rel="status"; type="application/json"',
  );
  assert.equal(
    PUBLIC_API_LINK_HEADER,
    '</api/audit/schema/2>; rel="describedby"; type="application/schema+json", '
      + '</api/openapi.json>; rel="service-desc"; type="application/openapi+json", '
      + '</docs>; rel="service-doc"; type="text/html", '
      + '</api/status>; rel="status"; type="application/json"',
  );
  assert.equal(openApiDocument.externalDocs.url, `${PUBLIC_SITE_URL}${API_DOCS_PATH}`);
});

test("describes every public GET route and the versioned audit payload", () => {
  assert.deepEqual(Object.keys(openApiDocument.paths), [
    "/api/audit",
    STATUS_PATH,
    "/api/audit/schema",
    AUDIT_SCHEMA_PATH,
    AUDIT_EXPORT_SCHEMA_ALIAS_PATH,
    LEGACY_AUDIT_EXPORT_SCHEMA_PATH,
    AUDIT_EXPORT_SCHEMA_PATH,
    OPENAPI_PATH,
  ]);

  const operation = openApiDocument.paths["/api/audit"].get;
  const login = operation.parameters.find((parameter) => parameter.name === "login");
  const refresh = operation.parameters.find((parameter) => parameter.name === "refresh");

  assert.equal(login?.required, true);
  assert.equal(login?.schema.maxLength, 39);
  assert.equal(refresh?.required, false);
  assert.equal(refresh?.schema.pattern, "^[0-9a-z]+$");
  assert.equal(
    operation.responses["200"].content["application/json"].schema.$ref,
    `${PUBLIC_SITE_URL}${AUDIT_SCHEMA_PATH}`,
  );
  assert.equal(operation.responses["429"].$ref, "#/components/responses/RateLimited");
  assert.equal(openApiDocument.paths["/api/audit/schema"].get.deprecated, true);
  assert.equal(
    openApiDocument.paths[AUDIT_SCHEMA_PATH].get.parameters[0].name,
    "If-None-Match",
  );
  assert.equal(
    openApiDocument.paths[AUDIT_SCHEMA_PATH].get.responses["304"].headers.ETag.schema.pattern,
    '^W/"sha256-[0-9a-f]{64}"$',
  );
  assert.equal(
    openApiDocument.paths[AUDIT_EXPORT_SCHEMA_ALIAS_PATH].get.operationId,
    "getCurrentAuditExportSchema",
  );
  assert.equal(openApiDocument.paths[AUDIT_EXPORT_SCHEMA_ALIAS_PATH].get.deprecated, true);
  assert.equal(
    openApiDocument.paths[LEGACY_AUDIT_EXPORT_SCHEMA_PATH].get.operationId,
    "getLegacyAuditExportSchema",
  );
  assert.equal(
    openApiDocument.paths[AUDIT_EXPORT_SCHEMA_PATH].get.operationId,
    "getAuditExportSchema",
  );
  assert.equal(openApiDocument.components.schemas.Error.additionalProperties, false);
  assert.equal(openApiDocument.paths[STATUS_PATH].get.operationId, "getServiceStatus");
  assert.equal(
    openApiDocument.paths[STATUS_PATH].get.responses["200"].content["application/json"].schema.$ref,
    "#/components/schemas/ServiceStatus",
  );
  assert.equal(openApiDocument.components.schemas.ServiceStatus.properties.status.const, "ok");
  assert.equal(
    openApiDocument.components.schemas.ServiceStatus.properties.dependencies.properties.github.const,
    "not-checked",
  );
});

test("documents the opaque request ID on every API response", () => {
  assert.equal(
    openApiDocument.components.headers.RequestId.schema.format,
    "uuid",
  );

  for (const pathItem of Object.values(openApiDocument.paths)) {
    for (const operation of Object.values(pathItem)) {
      for (const response of Object.values(operation.responses)) {
        const resolved = "$ref" in response
          ? openApiDocument.components.responses[response.$ref.split("/").at(-1)]
          : response;
        assert.deepEqual(
          resolved.headers?.[PUBLIC_API_REQUEST_ID_HEADER],
          { $ref: "#/components/headers/RequestId" },
        );
      }
    }
  }
});

test("documents metadata-only HEAD operations only for local resources", () => {
  assert.equal(openApiDocument.paths["/api/audit"].head, undefined);

  const operationIds = new Set();
  for (const [path, pathItem] of Object.entries(openApiDocument.paths)) {
    if (path === "/api/audit") continue;
    assert.ok(pathItem.head, `${path} should document HEAD`);
    assert.equal(operationIds.has(pathItem.head.operationId), false);
    operationIds.add(pathItem.head.operationId);

    for (const response of Object.values(pathItem.head.responses)) {
      assert.equal("content" in response, false);
    }
  }
});
