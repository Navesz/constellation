import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuditRequestUrl,
  canPreserveAuditAfterRefresh,
} from "../lib/audit-request.ts";

test("builds the stable audit URL used by an initial reading", () => {
  assert.equal(buildAuditRequestUrl("octocat"), "/api/audit?login=octocat");
  assert.equal(buildAuditRequestUrl("Octo_Cat", ""), "/api/audit?login=Octo_Cat");
});

test("adds an encoded cache-busting token only for an explicit refresh", () => {
  const requestUrl = buildAuditRequestUrl("hubot", "2026-07-31 / manual");
  const parsed = new URL(requestUrl, "https://constellation.example");

  assert.equal(parsed.pathname, "/api/audit");
  assert.equal(parsed.searchParams.get("login"), "hubot");
  assert.equal(parsed.searchParams.get("refresh"), "2026-07-31 / manual");
});

test("preserves only a matching previous audit during an explicit refresh", () => {
  const audit = { profile: { login: "OctoCat" } };

  assert.equal(canPreserveAuditAfterRefresh(audit, "octocat", "fresh-1"), true);
  assert.equal(canPreserveAuditAfterRefresh(audit, "hubot", "fresh-1"), false);
  assert.equal(canPreserveAuditAfterRefresh(audit, "octocat"), false);
  assert.equal(canPreserveAuditAfterRefresh(null, "octocat", "fresh-1"), false);
});
