import assert from "node:assert/strict";
import test from "node:test";
import { AUDIT_SCHEMA_VERSION } from "../lib/achievements.ts";
import { AUDIT_SCHEMA_PATH } from "../lib/audit-schema.ts";
import {
  OPENAPI_LINK_HEADER,
  OPENAPI_MEDIA_TYPE,
  OPENAPI_PATH,
  PUBLIC_API_LINK_HEADER,
  PUBLIC_SITE_URL,
  openApiDocument,
} from "../lib/openapi.ts";

test("publishes a discoverable OpenAPI 3.1.1 entry document", () => {
  assert.equal(openApiDocument.openapi, "3.1.1");
  assert.equal(openApiDocument.info.version, `${AUDIT_SCHEMA_VERSION}.0.0`);
  assert.equal(openApiDocument.jsonSchemaDialect, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(openApiDocument.servers[0].url, PUBLIC_SITE_URL);
  assert.equal(OPENAPI_PATH, "/api/openapi.json");
  assert.equal(OPENAPI_MEDIA_TYPE, "application/openapi+json");
  assert.equal(
    OPENAPI_LINK_HEADER,
    '</api/openapi.json>; rel="service-desc"; type="application/openapi+json"',
  );
  assert.equal(
    PUBLIC_API_LINK_HEADER,
    '</api/audit/schema/2>; rel="describedby"; type="application/schema+json", '
      + '</api/openapi.json>; rel="service-desc"; type="application/openapi+json"',
  );
});

test("describes every public GET route and the versioned audit payload", () => {
  assert.deepEqual(Object.keys(openApiDocument.paths), [
    "/api/audit",
    "/api/audit/schema",
    AUDIT_SCHEMA_PATH,
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
  assert.equal(openApiDocument.components.schemas.Error.additionalProperties, false);
});
