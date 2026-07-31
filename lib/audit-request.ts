export function buildAuditRequestUrl(login: string, refreshToken?: string | null) {
  const searchParams = new URLSearchParams({ login });
  if (refreshToken) searchParams.set("refresh", refreshToken);
  return `/api/audit?${searchParams.toString()}`;
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
