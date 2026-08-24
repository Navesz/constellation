import assert from "node:assert/strict";
import test from "node:test";
import {
  DISABLED_BROWSER_CAPABILITIES,
  SECURITY_CONTENT_POLICY,
  SECURITY_PERMISSIONS_POLICY,
  SECURITY_RESPONSE_HEADERS,
  withSecurityHeaders,
} from "../lib/security-headers.ts";

test("denies unused browser capabilities while preserving same-origin sharing", () => {
  assert.deepEqual(DISABLED_BROWSER_CAPABILITIES, [
    "accelerometer",
    "camera",
    "display-capture",
    "geolocation",
    "gyroscope",
    "magnetometer",
    "microphone",
    "payment",
    "usb",
    "xr-spatial-tracking",
  ]);
  assert.equal(new Set(DISABLED_BROWSER_CAPABILITIES).size, DISABLED_BROWSER_CAPABILITIES.length);

  for (const capability of DISABLED_BROWSER_CAPABILITIES) {
    assert.match(SECURITY_PERMISSIONS_POLICY, new RegExp(`(?:^|, )${capability}=\\(\\)(?:,|$)`));
  }
  assert.match(SECURITY_PERMISSIONS_POLICY, /(?:^|, )web-share=\(self\)$/);
});

test("prevents the application from being framed by another document", () => {
  assert.match(SECURITY_CONTENT_POLICY, /(?:^|; )frame-ancestors 'none'(?:;|$)/);
  assert.equal(SECURITY_RESPONSE_HEADERS["X-Frame-Options"], "DENY");
});

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
