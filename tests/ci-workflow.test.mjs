import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

function workflowActions(source) {
  return [...source.matchAll(
    /^\s*uses:\s+([^@\s]+)@([^\s#]+)\s+#\s+(v\d+\.\d+\.\d+)\s*$/gm,
  )].map((match) => ({
    source: match[1],
    reference: match[2],
    version: match[3],
  }));
}

test("pins every CI action to an immutable commit with release provenance", () => {
  const declaredActions = [...workflow.matchAll(/^\s*uses:\s+(.+)$/gm)];
  const pinnedActions = workflowActions(workflow);

  assert.ok(declaredActions.length > 0);
  assert.equal(pinnedActions.length, declaredActions.length);
  for (const action of pinnedActions) {
    assert.match(action.reference, /^[0-9a-f]{40}$/);
  }
});

test("keeps the core GitHub actions on the modern runtime generation", () => {
  const actions = new Map(
    workflowActions(workflow).map((action) => [action.source, action]),
  );

  for (const source of ["actions/checkout", "actions/setup-node"]) {
    const action = actions.get(source);
    assert.ok(action, `${source} must remain in the workflow`);
    assert.ok(Number(action.version.slice(1).split(".")[0]) >= 7);
  }
});
