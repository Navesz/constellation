import assert from "node:assert/strict";
import test from "node:test";
import { comparisonFocusTarget } from "../lib/comparison-focus.ts";

test("focuses only an explicitly requested comparison after loading", () => {
  const base = {
    pendingLogin: "hubot",
    comparisonLogin: "Hubot",
    loading: false,
    hasResult: true,
    hasError: false,
  };

  assert.equal(comparisonFocusTarget(base), "result");
  assert.equal(comparisonFocusTarget({ ...base, loading: true }), null);
  assert.equal(comparisonFocusTarget({ ...base, pendingLogin: null }), null);
  assert.equal(comparisonFocusTarget({ ...base, comparisonLogin: "octocat" }), null);
});

test("prioritizes a comparison error over a preserved previous result", () => {
  assert.equal(comparisonFocusTarget({
    pendingLogin: "hubot",
    comparisonLogin: "hubot",
    loading: false,
    hasResult: true,
    hasError: true,
  }), "error");
});
