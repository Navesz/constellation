export const AUDIT_REFRESH_WINDOW_MS = 15_000;
export const AUDIT_REFRESH_MAX_SKEW_MS = 5 * 60_000;

export type AuditRefreshRequest = {
  login: string;
  token: string;
};

export function createAuditRefreshToken(nowMs = Date.now()) {
  return Math.floor(nowMs / AUDIT_REFRESH_WINDOW_MS).toString(36);
}

export function isValidAuditRefreshToken(
  token: string | null | undefined,
  nowMs = Date.now(),
) {
  if (!token || !/^[0-9a-z]+$/.test(token)) return false;

  const tokenBucket = Number.parseInt(token, 36);
  if (!Number.isSafeInteger(tokenBucket) || tokenBucket < 0) return false;

  const currentBucket = Math.floor(nowMs / AUDIT_REFRESH_WINDOW_MS);
  const allowedSkewBuckets = Math.ceil(AUDIT_REFRESH_MAX_SKEW_MS / AUDIT_REFRESH_WINDOW_MS);
  return Math.abs(tokenBucket - currentBucket) <= allowedSkewBuckets;
}

export function hasSupportedAuditQueryParameters(searchParams: URLSearchParams) {
  const supportedNames = new Set(["login", "refresh"]);
  return [...searchParams.keys()].every((name) => supportedNames.has(name))
    && searchParams.getAll("login").length <= 1
    && searchParams.getAll("refresh").length <= 1;
}

export function buildAuditRequestUrl(login: string, refreshToken?: string | null) {
  const searchParams = new URLSearchParams({ login });
  if (refreshToken) searchParams.set("refresh", refreshToken);
  return `/api/audit?${searchParams.toString()}`;
}

export function auditRefreshTokenForLogin(
  request: AuditRefreshRequest | null,
  login: string | null | undefined,
) {
  return request && login && request.login.toLowerCase() === login.toLowerCase()
    ? request.token
    : null;
}

export function canPreserveAuditAfterRefresh(
  audit: { profile: { login: string } } | null,
  requestedLogin: string,
  refreshToken?: string | null,
) {
  return Boolean(
    refreshToken
    && audit
    && audit.profile.login.toLowerCase() === requestedLogin.toLowerCase(),
  );
}
