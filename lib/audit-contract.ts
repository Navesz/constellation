import {
  AUDIT_SCHEMA_VERSION,
  type AchievementProgress,
  type AuditResponse,
  type AuditSourceDiagnostic,
} from "./achievements.ts";

export const INCOMPATIBLE_AUDIT_RESPONSE_MESSAGE =
  "A API do Constellation retornou uma resposta incompatível. Atualize a página e tente novamente.";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOnlyKeys(value: UnknownRecord, keys: readonly string[]) {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function stringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function nullableCount(value: unknown): value is number | null {
  return value === null || count(value);
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
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function sourceDiagnostic(value: unknown): value is AuditSourceDiagnostic | null {
  if (value === null) return true;
  if (!record(value)) return false;
  const reasons = new Set([
    "timeout",
    "rate-limit",
    "not-found",
    "upstream-error",
    "invalid-response",
    "network",
  ]);

  return (
    hasOnlyKeys(value, ["reason", "message", "retryAt"]) &&
    typeof value.reason === "string" &&
    reasons.has(value.reason) &&
    typeof value.message === "string" &&
    (value.retryAt === undefined || validDate(value.retryAt))
  );
}

function achievement(value: unknown): value is AchievementProgress {
  if (!record(value)) return false;
  const badgeStatuses = new Set(["visible", "not-visible", "unavailable"]);
  const measurementKinds = new Set([
    "measured",
    "confirmed-minimum",
    "not-public",
    "unavailable",
  ]);

  return (
    hasOnlyKeys(value, [
      "name",
      "slug",
      "description",
      "nextAction",
      "thresholds",
      "metric",
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
    ]) &&
    typeof value.name === "string" &&
    typeof value.slug === "string" &&
    /^[a-z0-9-]+$/.test(value.slug) &&
    typeof value.description === "string" &&
    typeof value.nextAction === "string" &&
    Array.isArray(value.thresholds) &&
    value.thresholds.length <= 20 &&
    value.thresholds.every((threshold) => count(threshold) && threshold > 0) &&
    (value.metric === undefined || value.metric === "mergedPullRequests" || value.metric === "topRepositoryStars") &&
    (value.catalogStatus === "modeled" || value.catalogStatus === "discovered") &&
    (value.earningStatus === "active" || value.earningStatus === "historical" || value.earningStatus === "unknown") &&
    (value.documentationUrl === null || webUrl(value.documentationUrl)) &&
    typeof value.unlocked === "boolean" &&
    count(value.tier) &&
    nullableCount(value.current) &&
    nullableCount(value.nextThreshold) &&
    typeof value.progressLabel === "string" &&
    typeof value.badgeStatus === "string" &&
    badgeStatuses.has(value.badgeStatus) &&
    typeof value.measurementKind === "string" &&
    measurementKinds.has(value.measurementKind) &&
    typeof value.currentIsMinimum === "boolean" &&
    typeof value.confidenceLabel === "string"
  );
}

export function isAuditResponse(value: unknown): value is AuditResponse {
  if (!record(value) || value.schemaVersion !== AUDIT_SCHEMA_VERSION) return false;
  const { profile, metrics, sources, sourceDiagnostics } = value;
  if (!record(profile) || !record(metrics) || !record(sources) || !record(sourceDiagnostics)) {
    return false;
  }

  const topRepository = metrics.topRepository;
  const validTopRepository = topRepository === null || (
    record(topRepository) &&
    hasOnlyKeys(topRepository, ["name", "description", "stars", "forks", "url"]) &&
    typeof topRepository.name === "string" &&
    stringOrNull(topRepository.description) &&
    count(topRepository.stars) &&
    count(topRepository.forks) &&
    webUrl(topRepository.url)
  );
  const availability = (source: unknown) => source === "available" || source === "unavailable";

  return (
    hasOnlyKeys(value, [
      "schemaVersion",
      "profile",
      "metrics",
      "sources",
      "sourceDiagnostics",
      "visibleAchievementCount",
      "achievements",
      "warnings",
      "generatedAt",
    ]) &&
    hasOnlyKeys(profile, [
      "login",
      "name",
      "bio",
      "avatarUrl",
      "htmlUrl",
      "followers",
      "following",
      "publicRepos",
    ]) &&
    hasOnlyKeys(metrics, ["mergedPullRequests", "topRepository"]) &&
    hasOnlyKeys(sources, ["achievements", "mergedPullRequests", "repositories"]) &&
    hasOnlyKeys(sourceDiagnostics, ["achievements", "mergedPullRequests", "repositories"]) &&
    typeof profile.login === "string" &&
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(profile.login) &&
    stringOrNull(profile.name) &&
    stringOrNull(profile.bio) &&
    webUrl(profile.avatarUrl) &&
    webUrl(profile.htmlUrl) &&
    count(profile.followers) &&
    count(profile.following) &&
    count(profile.publicRepos) &&
    nullableCount(metrics.mergedPullRequests) &&
    validTopRepository &&
    availability(sources.achievements) &&
    availability(sources.mergedPullRequests) &&
    availability(sources.repositories) &&
    sourceDiagnostic(sourceDiagnostics.achievements) &&
    sourceDiagnostic(sourceDiagnostics.mergedPullRequests) &&
    sourceDiagnostic(sourceDiagnostics.repositories) &&
    nullableCount(value.visibleAchievementCount) &&
    Array.isArray(value.achievements) &&
    value.achievements.length <= 100 &&
    value.achievements.every(achievement) &&
    Array.isArray(value.warnings) &&
    value.warnings.length <= 50 &&
    value.warnings.every((warning) => typeof warning === "string") &&
    validDate(value.generatedAt)
  );
}

export type AuditErrorResponse = {
  error: string;
  retryAt?: string;
};

export function parseAuditErrorResponse(value: unknown): AuditErrorResponse | null {
  if (!record(value) || typeof value.error !== "string" || value.error.trim().length === 0) {
    return null;
  }
  if (value.retryAt !== undefined && !validDate(value.retryAt)) return null;
  return {
    error: value.error,
    ...(typeof value.retryAt === "string" ? { retryAt: value.retryAt } : {}),
  };
}

export async function readAuditApiResponse(response: Response, fallbackError: string) {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(response.ok ? INCOMPATIBLE_AUDIT_RESPONSE_MESSAGE : fallbackError);
  }

  if (!response.ok) {
    throw new Error(parseAuditErrorResponse(payload)?.error ?? fallbackError);
  }
  if (!isAuditResponse(payload)) throw new Error(INCOMPATIBLE_AUDIT_RESPONSE_MESSAGE);
  return payload;
}
