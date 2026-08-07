import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIT_REFRESH_MAX_SKEW_MS,
  AUDIT_REFRESH_WINDOW_MS,
  auditRefreshTokenForLogin,
  buildAuditRequestUrl,
  canPreserveAuditAfterRefresh,
  createAuditRefreshToken,
  hasSupportedAuditQueryParameters,
  isValidAuditRefreshToken,
} from "../lib/audit-request.ts";

test("builds the stable audit URL used by an initial reading", () => {
  assert.equal(buildAuditRequestUrl("octocat"), "/api/audit?login=octocat");
  assert.equal(buildAuditRequestUrl("Octo_Cat", ""), "/api/audit?login=Octo_Cat");
});

test("adds a refresh bucket only for an explicit refresh", () => {
  const token = createAuditRefreshToken(1_800_000_000_000);
  const requestUrl = buildAuditRequestUrl("hubot", token);
  const parsed = new URL(requestUrl, "https://constellation.example");

  assert.equal(parsed.pathname, "/api/audit");
  assert.equal(parsed.searchParams.get("login"), "hubot");
  assert.equal(parsed.searchParams.get("refresh"), token);
});

test("scopes a pending refresh token to its intended profile", () => {
  const request = { login: "OctoCat", token: "refresh-1" };

  assert.equal(auditRefreshTokenForLogin(request, "octocat"), "refresh-1");
  assert.equal(auditRefreshTokenForLogin(request, "hubot"), null);
  assert.equal(auditRefreshTokenForLogin(request, null), null);
  assert.equal(auditRefreshTokenForLogin(null, "octocat"), null);
});

test("groups manual refreshes into bounded time windows", () => {
  const now = 1_800_000_000_000;
  const token = createAuditRefreshToken(now);

  assert.equal(createAuditRefreshToken(now + AUDIT_REFRESH_WINDOW_MS - 1), token);
  assert.notEqual(createAuditRefreshToken(now + AUDIT_REFRESH_WINDOW_MS), token);
  assert.equal(isValidAuditRefreshToken(token, now), true);
  assert.equal(
    isValidAuditRefreshToken(createAuditRefreshToken(now - AUDIT_REFRESH_MAX_SKEW_MS), now),
    true,
  );
  assert.equal(
    isValidAuditRefreshToken(
      createAuditRefreshToken(now + AUDIT_REFRESH_MAX_SKEW_MS + AUDIT_REFRESH_WINDOW_MS),
      now,
    ),
    false,
  );
  assert.equal(isValidAuditRefreshToken("not/a/token", now), false);
  assert.equal(isValidAuditRefreshToken("", now), false);
});

test("accepts only supported, non-repeated audit query parameters", () => {
  assert.equal(hasSupportedAuditQueryParameters(new URLSearchParams("login=octocat")), true);
  assert.equal(
    hasSupportedAuditQueryParameters(new URLSearchParams("login=octocat&refresh=abc123")),
    true,
  );
  assert.equal(
    hasSupportedAuditQueryParameters(new URLSearchParams("login=octocat&nonce=random")),
    false,
  );
  assert.equal(
    hasSupportedAuditQueryParameters(new URLSearchParams("login=octocat&login=hubot")),
    false,
  );
  assert.equal(
    hasSupportedAuditQueryParameters(new URLSearchParams("login=octocat&refresh=a&refresh=b")),
    false,
  );
});

test("preserves only a matching previous audit during an explicit refresh", () => {
  const audit = { profile: { login: "OctoCat" } };

  assert.equal(canPreserveAuditAfterRefresh(audit, "octocat", "fresh-1"), true);
  assert.equal(canPreserveAuditAfterRefresh(audit, "hubot", "fresh-1"), false);
  assert.equal(canPreserveAuditAfterRefresh(audit, "octocat"), false);
  assert.equal(canPreserveAuditAfterRefresh(null, "octocat", "fresh-1"), false);
});
