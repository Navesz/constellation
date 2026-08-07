import assert from "node:assert/strict";
import test from "node:test";
import {
  PUBLIC_API_EXPOSED_HEADERS,
  PUBLIC_API_ALLOWED_METHODS,
  PUBLIC_API_REQUEST_ID_HEADER,
  PUBLIC_API_REQUEST_ID_PATTERN,
  createPublicApiRequestId,
  publicApiHeadResponse,
  publicApiOptionsResponse,
  withPublicApiRequestId,
} from "../lib/public-api.ts";

test("creates opaque UUID v4 request IDs and exposes their response header", () => {
  const first = createPublicApiRequestId();
  const second = createPublicApiRequestId();

  assert.match(first, PUBLIC_API_REQUEST_ID_PATTERN);
  assert.match(second, PUBLIC_API_REQUEST_ID_PATTERN);
  assert.notEqual(first, second);
  assert.match(PUBLIC_API_EXPOSED_HEADERS, new RegExp(PUBLIC_API_REQUEST_ID_HEADER));
});

test("preserves response metadata while removing HEAD bodies", async () => {
  const head = publicApiHeadResponse(new Response("metadata only", {
    status: 203,
    statusText: "Non-Authoritative Information",
    headers: { ETag: 'W/"contract"' },
  }));
  const options = publicApiOptionsResponse();

  assert.equal(head.status, 203);
  assert.equal(head.statusText, "Non-Authoritative Information");
  assert.equal(head.headers.get("etag"), 'W/"contract"');
  assert.equal(await head.text(), "");
  assert.equal(PUBLIC_API_ALLOWED_METHODS, "GET, HEAD, OPTIONS");
  assert.equal(options.headers.get("allow"), PUBLIC_API_ALLOWED_METHODS);
  assert.equal(
    options.headers.get("access-control-allow-methods"),
    PUBLIC_API_ALLOWED_METHODS,
  );
});

test("adds a validated request ID without losing response metadata or body", async () => {
  const requestId = "13c0a607-1f0a-4c82-9d74-cf91b578c727";
  const traced = withPublicApiRequestId(new Response("constellation", {
    status: 202,
    statusText: "Accepted",
    headers: { "Cache-Control": "no-store" },
  }), requestId);

  assert.equal(traced.status, 202);
  assert.equal(traced.statusText, "Accepted");
  assert.equal(traced.headers.get("cache-control"), "no-store");
  assert.equal(traced.headers.get(PUBLIC_API_REQUEST_ID_HEADER), requestId);
  assert.equal(await traced.text(), "constellation");
  assert.throws(
    () => withPublicApiRequestId(new Response(), "login-octocat"),
    /UUID v4/,
  );
});
