import { AUDIT_SCHEMA_VERSION } from "./achievements.ts";

export const AUDIT_SCHEMA_PATH = "/api/audit/schema/2";
export const AUDIT_SCHEMA_LINK_HEADER =
  `<${AUDIT_SCHEMA_PATH}>; rel="describedby"; type="application/schema+json"`;

const countSchema = { type: "integer", minimum: 0 } as const;
const nullableCountSchema = {
  anyOf: [countSchema, { type: "null" }],
} as const;
const nullableStringSchema = {
  anyOf: [{ type: "string" }, { type: "null" }],
} as const;

export const auditResponseJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://constellation-profile.leonardonavesworking.chatgpt.site/api/audit/schema/2",
  title: "Constellation audit response v2",
  description: "A public GitHub profile audit produced by Constellation.",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "profile",
    "metrics",
    "sources",
    "sourceDiagnostics",
    "visibleAchievementCount",
    "achievements",
    "warnings",
    "generatedAt",
  ],
  properties: {
    schemaVersion: { const: AUDIT_SCHEMA_VERSION },
    profile: { $ref: "#/$defs/profile" },
    metrics: { $ref: "#/$defs/metrics" },
    sources: { $ref: "#/$defs/sources" },
    sourceDiagnostics: { $ref: "#/$defs/sourceDiagnostics" },
    visibleAchievementCount: nullableCountSchema,
    achievements: {
      type: "array",
      maxItems: 100,
      items: { $ref: "#/$defs/achievement" },
    },
    warnings: {
      type: "array",
      maxItems: 50,
      items: { type: "string" },
    },
    generatedAt: { type: "string", format: "date-time" },
  },
  $defs: {
    profile: {
      type: "object",
      additionalProperties: false,
      required: [
        "login",
        "name",
        "bio",
        "avatarUrl",
        "htmlUrl",
        "followers",
        "following",
        "publicRepos",
      ],
      properties: {
        login: {
          type: "string",
          pattern: "^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$",
        },
        name: nullableStringSchema,
        bio: nullableStringSchema,
        avatarUrl: { type: "string", format: "uri", pattern: "^https?://" },
        htmlUrl: { type: "string", format: "uri", pattern: "^https?://" },
        followers: countSchema,
        following: countSchema,
        publicRepos: countSchema,
      },
    },
    repository: {
      type: "object",
      additionalProperties: false,
      required: ["name", "description", "stars", "forks", "url"],
      properties: {
        name: { type: "string" },
        description: nullableStringSchema,
        stars: countSchema,
        forks: countSchema,
        url: { type: "string", format: "uri", pattern: "^https?://" },
      },
    },
    metrics: {
      type: "object",
      additionalProperties: false,
      required: ["mergedPullRequests", "topRepository"],
      properties: {
        mergedPullRequests: nullableCountSchema,
        topRepository: {
          anyOf: [{ $ref: "#/$defs/repository" }, { type: "null" }],
        },
      },
    },
    sources: {
      type: "object",
      additionalProperties: false,
      required: ["achievements", "mergedPullRequests", "repositories"],
      properties: {
        achievements: { $ref: "#/$defs/sourceAvailability" },
        mergedPullRequests: { $ref: "#/$defs/sourceAvailability" },
        repositories: { $ref: "#/$defs/sourceAvailability" },
      },
    },
    sourceAvailability: {
      type: "string",
      enum: ["available", "unavailable"],
    },
    sourceDiagnostic: {
      type: "object",
      additionalProperties: false,
      required: ["reason", "message"],
      properties: {
        reason: {
          type: "string",
          enum: [
            "timeout",
            "rate-limit",
            "not-found",
            "upstream-error",
            "invalid-response",
            "network",
          ],
        },
        message: { type: "string" },
        retryAt: { type: "string", format: "date-time" },
      },
    },
    nullableSourceDiagnostic: {
      anyOf: [{ $ref: "#/$defs/sourceDiagnostic" }, { type: "null" }],
    },
    sourceDiagnostics: {
      type: "object",
      additionalProperties: false,
      required: ["achievements", "mergedPullRequests", "repositories"],
      properties: {
        achievements: { $ref: "#/$defs/nullableSourceDiagnostic" },
        mergedPullRequests: { $ref: "#/$defs/nullableSourceDiagnostic" },
        repositories: { $ref: "#/$defs/nullableSourceDiagnostic" },
      },
    },
    achievement: {
      type: "object",
      additionalProperties: false,
      required: [
        "name",
        "slug",
        "description",
        "nextAction",
        "thresholds",
        "catalogStatus",
        "earningStatus",
        "documentationUrl",
        "unlocked",
        "tier",
        "current",
        "nextThreshold",
        "progressLabel",
        "badgeStatus",
        "measurementKind",
        "currentIsMinimum",
        "confidenceLabel",
      ],
      properties: {
        name: { type: "string" },
        slug: { type: "string", pattern: "^[a-z0-9-]+$" },
        description: { type: "string" },
        nextAction: { type: "string" },
        thresholds: {
          type: "array",
          maxItems: 20,
          items: { type: "integer", minimum: 1 },
        },
        metric: {
          type: "string",
          enum: ["mergedPullRequests", "topRepositoryStars"],
        },
        catalogStatus: { type: "string", enum: ["modeled", "discovered"] },
        earningStatus: { type: "string", enum: ["active", "historical", "unknown"] },
        documentationUrl: {
          anyOf: [
            { type: "string", format: "uri", pattern: "^https?://" },
            { type: "null" },
          ],
        },
        unlocked: { type: "boolean" },
        tier: countSchema,
        current: nullableCountSchema,
        nextThreshold: nullableCountSchema,
        progressLabel: { type: "string" },
        badgeStatus: {
          type: "string",
          enum: ["visible", "not-visible", "unavailable"],
        },
        measurementKind: {
          type: "string",
          enum: ["measured", "confirmed-minimum", "not-public", "unavailable"],
        },
        currentIsMinimum: { type: "boolean" },
        confidenceLabel: { type: "string" },
      },
    },
  },
} as const;
