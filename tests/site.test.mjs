import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_SITE_URL, resolveSiteOrigin } from "../lib/site.ts";

test("uses the canonical production origin for trusted deployment headers", () => {
  assert.equal(resolveSiteOrigin(new Headers({
    "x-forwarded-host": "constellation-profile.leonardonavesworking.chatgpt.site",
    "x-forwarded-proto": "https",
  })), PUBLIC_SITE_URL);
  assert.equal(resolveSiteOrigin(new Headers()), PUBLIC_SITE_URL);
});

test("preserves explicit loopback origins for local development", () => {
  assert.equal(
    resolveSiteOrigin(new Headers({ host: "localhost:3001" })),
    "http://localhost:3001",
  );
  assert.equal(resolveSiteOrigin(new Headers({
    "x-forwarded-host": "127.0.0.1:8787",
    "x-forwarded-proto": "http",
  })), "http://127.0.0.1:8787");
});

test("falls back to production for untrusted or malformed forwarded origins", () => {
  for (const headers of [
    { "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" },
    { "x-forwarded-host": "localhost.attacker.example", "x-forwarded-proto": "http" },
    { "x-forwarded-host": "attacker.example, constellation-profile.leonardonavesworking.chatgpt.site" },
    { "x-forwarded-host": "constellation-profile.leonardonavesworking.chatgpt.site:444" },
    { "x-forwarded-host": "not a host" },
  ]) {
    assert.equal(resolveSiteOrigin(new Headers(headers)), PUBLIC_SITE_URL);
  }
});
