import assert from "node:assert/strict";
import test from "node:test";
import {
  SECURITY_RESPONSE_HEADERS,
  withSecurityHeaders,
} from "../lib/security-headers.ts";

test("adds baseline browser protections without losing response metadata or body", async () => {
  const secured = withSecurityHeaders(new Response("constellation", {
    status: 202,
    statusText: "Accepted",
    headers: {
      "Cache-Control": "public, max-age=60",
      "Content-Type": "text/plain;charset=utf-8",
      "Referrer-Policy": "unsafe-url",
    },
  }));

  assert.equal(secured.status, 202);
  assert.equal(secured.statusText, "Accepted");
  assert.equal(secured.headers.get("cache-control"), "public, max-age=60");
  assert.equal(secured.headers.get("content-type"), "text/plain;charset=utf-8");
  assert.equal(await secured.text(), "constellation");
  for (const [name, value] of Object.entries(SECURITY_RESPONSE_HEADERS)) {
    assert.equal(secured.headers.get(name), value);
  }
});
