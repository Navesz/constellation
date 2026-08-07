import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWeakEntityTag,
  createConditionalTextHandler,
  matchesIfNoneMatch,
} from "../lib/http-validators.ts";

test("creates stable weak validators from the exact response body", async () => {
  const first = await buildWeakEntityTag("constellation\n");
  const repeated = await buildWeakEntityTag("constellation\n");
  const changed = await buildWeakEntityTag("constellation changed\n");

  assert.match(first, /^W\/"sha256-[0-9a-f]{64}"$/);
  assert.equal(first, repeated);
  assert.notEqual(first, changed);
});

test("uses weak comparison across validator lists without splitting quoted commas", () => {
  const entityTag = 'W/"sha256-current"';

  assert.equal(matchesIfNoneMatch(null, entityTag), false);
  assert.equal(matchesIfNoneMatch("*", entityTag), true);
  assert.equal(matchesIfNoneMatch('"sha256-current"', entityTag), true);
  assert.equal(matchesIfNoneMatch('W/"older", "sha256-current"', entityTag), true);
  assert.equal(matchesIfNoneMatch('W/"older,still-older", W/"different"', entityTag), false);
  assert.equal(matchesIfNoneMatch('W/"unterminated', entityTag), false);
});

test("returns the same metadata with an empty 304 response when unchanged", async () => {
  const handle = createConditionalTextHandler("{\"ok\":true}\n", {
    "Cache-Control": "public, max-age=60",
    "Content-Type": "application/json; charset=utf-8",
    Link: "</contract>; rel=describedby",
  });
  const initial = await handle(new Request("https://example.test/contract"));
  const entityTag = initial.headers.get("etag");

  assert.equal(initial.status, 200);
  assert.match(entityTag ?? "", /^W\/"sha256-/);
  assert.equal(await initial.text(), "{\"ok\":true}\n");

  const unchanged = await handle(new Request("https://example.test/contract", {
    headers: { "If-None-Match": `W/"old", ${entityTag}` },
  }));
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.headers.get("etag"), entityTag);
  assert.equal(unchanged.headers.get("cache-control"), "public, max-age=60");
  assert.equal(unchanged.headers.get("link"), "</contract>; rel=describedby");
  assert.equal(await unchanged.text(), "");
});
