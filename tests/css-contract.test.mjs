import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("defines every application-owned CSS custom property before using it", () => {
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

test("preserves essential visual states in forced-colors mode", () => {
  const start = css.indexOf("@media (forced-colors: active)");
  const end = css.indexOf("@media (max-width: 860px)", start);

  assert.ok(start >= 0);
  assert.ok(end > start);
  const forcedColors = css.slice(start, end);

  assert.match(forcedColors, /outline-color:\s*Highlight/);
  assert.match(forcedColors, /\.recent-orbits a\.is-current/);
  assert.match(forcedColors, /button\[aria-pressed="true"\]/);
  assert.match(forcedColors, /\.progress\s*\{[\s\S]*border:\s*1px solid CanvasText/);
  assert.match(forcedColors, /\.progress\.is-indeterminate\s*\{[\s\S]*border-style:\s*dashed/);
  assert.match(forcedColors, /li\.is-unavailable \.evidence-status i\s*\{[\s\S]*border-style:\s*dashed/);
});
