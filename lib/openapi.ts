import { AUDIT_SCHEMA_VERSION } from "./achievements.ts";
import { AUDIT_SCHEMA_LINK_HEADER, AUDIT_SCHEMA_PATH } from "./audit-schema.ts";
import {
  AUDIT_EXPORT_SCHEMA_PATH,
  AUDIT_EXPORT_VERSION,
  LEGACY_AUDIT_EXPORT_SCHEMA_PATH,
} from "./audit-export.ts";
import { AUDIT_EXPORT_SCHEMA_ALIAS_PATH } from "./audit-export-schema.ts";
import { PUBLIC_SITE_URL } from "./site.ts";

export { PUBLIC_SITE_URL } from "./site.ts";
export const OPENAPI_PATH = "/api/openapi.json";
export const OPENAPI_MEDIA_TYPE = "application/openapi+json";
export const API_DOCS_PATH = "/docs";
export const STATUS_PATH = "/api/status";
export const OPENAPI_LINK_HEADER =
  `<${OPENAPI_PATH}>; rel="service-desc"; type="${OPENAPI_MEDIA_TYPE}"`;
export const API_DOCS_LINK_HEADER =
  `<${API_DOCS_PATH}>; rel="service-doc"; type="text/html"`;
export const STATUS_LINK_HEADER =
  `<${STATUS_PATH}>; rel="status"; type="application/json"`;
export const PUBLIC_API_LINK_HEADER =
  `${AUDIT_SCHEMA_LINK_HEADER}, ${OPENAPI_LINK_HEADER}, ${API_DOCS_LINK_HEADER}, ${STATUS_LINK_HEADER}`;

const errorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: { type: "string" },
    retryAt: { type: "string", format: "date-time" },
  },
} as const;

const jsonErrorContent = {
  "application/json": {
    schema: { $ref: "#/components/schemas/Error" },
  },
} as const;

const conditionalContractParameter = {
  name: "If-None-Match",
  in: "header",
  required: false,
  description: "Previously returned ETag. A matching validator produces an empty 304 response.",
  schema: { type: "string" },
} as const;

const entityTagHeader = {
  description: "Weak content validator for conditional requests.",
  schema: { type: "string", pattern: '^W/"sha256-[0-9a-f]{64}"$' },
} as const;

const requestIdResponseHeaders = {
  "X-Constellation-Request-Id": { $ref: "#/components/headers/RequestId" },
} as const;

const notModifiedResponse = {
  description: "The contract has not changed since the supplied If-None-Match validator.",
  headers: { ETag: entityTagHeader, ...requestIdResponseHeaders },
} as const;

const auditSchemaOperation = {
  tags: ["Contract"],
  summary: "Read the current audit response schema",
  operationId: "getAuditSchema",
  parameters: [conditionalContractParameter],
  responses: {
    "200": {
      description: `JSON Schema Draft 2020-12 for audit response version ${AUDIT_SCHEMA_VERSION}.`,
      headers: {
        ETag: entityTagHeader,
        ...requestIdResponseHeaders,
        "X-Constellation-Schema-Version": {
          description: "Audit response schema version.",
          schema: { type: "integer", const: AUDIT_SCHEMA_VERSION },
        },
      },
      content: {
        "application/schema+json": {
          schema: { type: "object" },
        },
      },
    },
    "304": notModifiedResponse,
  },
} as const;

function exportSchemaOperation(version: 1 | typeof AUDIT_EXPORT_VERSION) {
  return {
    tags: ["Contract"],
    summary: `Read the audit export schema version ${version}`,
    operationId: version === AUDIT_EXPORT_VERSION
      ? "getAuditExportSchema"
      : "getLegacyAuditExportSchema",
    parameters: [conditionalContractParameter],
    responses: {
      "200": {
        description: `JSON Schema Draft 2020-12 for audit export version ${version}.`,
        headers: {
          ETag: entityTagHeader,
          ...requestIdResponseHeaders,
          "X-Constellation-Export-Version": {
            description: "Audit export envelope version.",
            schema: { type: "integer", const: version },
          },
        },
        content: {
          "application/schema+json": {
            schema: { type: "object" },
          },
        },
      },
      "304": notModifiedResponse,
    },
  } as const;
}

function metadataOnlyOperation<T extends { responses: Record<string, unknown> }>(
  operation: T,
  summary: string,
  operationId: string,
) {
  const responses = Object.fromEntries(
    Object.entries(operation.responses).map(([status, response]) => {
      if (!response || typeof response !== "object" || "$ref" in response) {
        return [status, response];
      }
      const metadata = { ...response } as Record<string, unknown>;
      delete metadata.content;
      return [status, metadata];
    }),
  );

  return { ...operation, summary, operationId, responses };
}

const statusOperation = {
  tags: ["Operational"],
  summary: "Check whether the Constellation service is responding",
  description:
    "Checks the application layer only. It does not contact GitHub or consume an upstream request.",
  operationId: "getServiceStatus",
  responses: {
    "200": {
      description: "The application layer is responding.",
      headers: {
        ...requestIdResponseHeaders,
        "Cache-Control": {
          description: "Status observations must not be reused.",
          schema: { type: "string", const: "no-store" },
        },
        Link: {
          description: "Links to contracts, documentation, and this status resource.",
          schema: { type: "string" },
        },
      },
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ServiceStatus" },
        },
      },
    },
  },
} as const;

const openApiOperation = {
  tags: ["Contract"],
  summary: "Read the OpenAPI service description",
  operationId: "getOpenApiDocument",
  parameters: [conditionalContractParameter],
  responses: {
    "200": {
      description: "The OpenAPI 3.1.1 entry document for this service.",
      headers: { ETag: entityTagHeader, ...requestIdResponseHeaders },
      content: {
        [OPENAPI_MEDIA_TYPE]: {
          schema: { type: "object" },
        },
      },
    },
    "304": notModifiedResponse,
  },
} as const;

export const openApiDocument = {
  openapi: "3.1.1",
  info: {
    title: "Constellation Public API",
    version: `${AUDIT_SCHEMA_VERSION}.0.0`,
    description:
      "Public, read-only GitHub profile audits with explicit source diagnostics and versioned response contracts.",
  },
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  servers: [{ url: PUBLIC_SITE_URL, description: "Private Constellation deployment" }],
  tags: [
    { name: "Audit", description: "Public GitHub profile observations." },
    { name: "Contract", description: "Machine-readable API contracts." },
    { name: "Operational", description: "Checks that do not contact GitHub." },
  ],
  paths: {
    "/api/audit": {
      get: {
        tags: ["Audit"],
        summary: "Audit a public GitHub profile",
        operationId: "getProfileAudit",
        parameters: [
          {
            name: "login",
            in: "query",
            required: true,
            description: "GitHub login to observe.",
            schema: {
              type: "string",
              minLength: 1,
              maxLength: 39,
              pattern: "^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$",
            },
          },
          {
            name: "refresh",
            in: "query",
            required: false,
            description:
              "Optional short-lived base-36 refresh bucket generated by the Constellation client.",
            schema: {
              type: "string",
              minLength: 1,
              maxLength: 11,
              pattern: "^[0-9a-z]+$",
            },
          },
        ],
        responses: {
          "200": {
            description:
              "A complete or explicitly partial audit. Inspect sources, sourceDiagnostics, and warnings before using secondary metrics.",
            headers: {
              ...requestIdResponseHeaders,
              "X-Constellation-Schema-Version": {
                description: "Audit response schema version.",
                schema: { type: "integer", const: AUDIT_SCHEMA_VERSION },
              },
              Link: {
                description: "Links to the response schema, service description, documentation, and status.",
                schema: { type: "string" },
              },
            },
            content: {
              "application/json": {
                schema: { $ref: `${PUBLIC_SITE_URL}${AUDIT_SCHEMA_PATH}` },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "404": { $ref: "#/components/responses/NotFound" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "502": { $ref: "#/components/responses/UpstreamError" },
          "504": { $ref: "#/components/responses/GatewayTimeout" },
        },
      },
    },
    [STATUS_PATH]: {
      get: statusOperation,
      head: metadataOnlyOperation(
        statusOperation,
        "Check service status headers without a response body",
        "headServiceStatus",
      ),
    },
    "/api/audit/schema": {
      get: {
        ...auditSchemaOperation,
        summary: "Read the current audit response schema through the legacy alias",
        operationId: "getCurrentAuditSchema",
        deprecated: true,
      },
      head: metadataOnlyOperation(
        { ...auditSchemaOperation, deprecated: true },
        "Check the current audit schema headers through the legacy alias",
        "headCurrentAuditSchema",
      ),
    },
    [AUDIT_SCHEMA_PATH]: {
      get: auditSchemaOperation,
      head: metadataOnlyOperation(
        auditSchemaOperation,
        "Check the audit schema headers without a response body",
        "headAuditSchema",
      ),
    },
    [AUDIT_EXPORT_SCHEMA_ALIAS_PATH]: {
      get: {
        ...exportSchemaOperation(AUDIT_EXPORT_VERSION),
        summary: "Read the current audit export schema through its stable alias",
        operationId: "getCurrentAuditExportSchema",
        deprecated: true,
      },
      head: metadataOnlyOperation(
        { ...exportSchemaOperation(AUDIT_EXPORT_VERSION), deprecated: true },
        "Check the current export schema headers through its stable alias",
        "headCurrentAuditExportSchema",
      ),
    },
    [LEGACY_AUDIT_EXPORT_SCHEMA_PATH]: {
      get: exportSchemaOperation(1),
      head: metadataOnlyOperation(
        exportSchemaOperation(1),
        "Check legacy export schema headers without a response body",
        "headLegacyAuditExportSchema",
      ),
    },
    [AUDIT_EXPORT_SCHEMA_PATH]: {
      get: exportSchemaOperation(AUDIT_EXPORT_VERSION),
      head: metadataOnlyOperation(
        exportSchemaOperation(AUDIT_EXPORT_VERSION),
        "Check export schema headers without a response body",
        "headAuditExportSchema",
      ),
    },
    [OPENAPI_PATH]: {
      get: openApiOperation,
      head: metadataOnlyOperation(
        openApiOperation,
        "Check OpenAPI description headers without a response body",
        "headOpenApiDocument",
      ),
    },
  },
  components: {
    headers: {
      RequestId: {
        description:
          "Opaque UUID generated by Constellation for this API response. Safe to record in integration logs; it does not encode the requested login or other user data.",
        schema: { type: "string", format: "uuid" },
      },
    },
    schemas: {
      Error: errorSchema,
      ServiceStatus: {
        type: "object",
        additionalProperties: false,
        required: [
          "status",
          "service",
          "auditSchemaVersion",
          "auditExportVersion",
          "dependencies",
          "contracts",
          "checkedAt",
        ],
        properties: {
          status: { type: "string", const: "ok" },
          service: { type: "string", const: "constellation" },
          auditSchemaVersion: { type: "integer", const: AUDIT_SCHEMA_VERSION },
          auditExportVersion: { type: "integer", const: AUDIT_EXPORT_VERSION },
          dependencies: {
            type: "object",
            additionalProperties: false,
            required: ["github"],
            properties: {
              github: { type: "string", const: "not-checked" },
            },
          },
          contracts: {
            type: "object",
            additionalProperties: false,
            required: ["auditSchema", "exportSchema", "openApi", "documentation"],
            properties: {
              auditSchema: { type: "string", format: "uri" },
              exportSchema: { type: "string", format: "uri" },
              openApi: { type: "string", format: "uri" },
              documentation: { type: "string", format: "uri" },
            },
          },
          checkedAt: { type: "string", format: "date-time" },
        },
      },
    },
    responses: {
      BadRequest: {
        description: "The login or query parameters are invalid.",
        headers: requestIdResponseHeaders,
        content: jsonErrorContent,
      },
      NotFound: {
        description: "The requested GitHub profile was not found.",
        headers: requestIdResponseHeaders,
        content: jsonErrorContent,
      },
      RateLimited: {
        description: "GitHub temporarily limited the required profile request.",
        headers: {
          ...requestIdResponseHeaders,
          "Retry-After": {
            description: "When the request can be retried, when supplied by GitHub.",
            schema: { type: "string" },
          },
        },
        content: jsonErrorContent,
      },
      UpstreamError: {
        description: "GitHub did not provide a usable required profile response.",
        headers: requestIdResponseHeaders,
        content: jsonErrorContent,
      },
      GatewayTimeout: {
        description: "The required GitHub profile request timed out.",
        headers: requestIdResponseHeaders,
        content: jsonErrorContent,
      },
    },
  },
  externalDocs: {
    description: "Constellation integration guide",
    url: `${PUBLIC_SITE_URL}${API_DOCS_PATH}`,
  },
} as const;
