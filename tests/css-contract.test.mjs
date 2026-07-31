import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("defines every application-owned CSS custom property before using it", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const defined = new Set(
    [...css.matchAll(/--([a-z0-9-]+)\s*:/g)].map((match) => match[1]),
  );
  const external = new Set(["font-geist-sans", "font-geist-mono"]);
  const used = new Set(
    [...css.matchAll(/var\(--([a-z0-9-]+)/g)].map((match) => match[1]),
  );
  const missing = [...used].filter((name) => !defined.has(name) && !external.has(name)).sort();

  assert.deepEqual(missing, []);
});
