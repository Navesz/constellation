import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuditSharePayload,
  shareAudit,
} from "../lib/audit-sharing.ts";

test("builds honest share copy for one profile and a comparison", () => {
  assert.deepEqual(
    buildAuditSharePayload("octocat", null, "https://example.test/?login=octocat"),
    {
      title: "Constellation — @octocat",
      text: "Veja a auditoria de sinais públicos de @octocat no Constellation.",
      url: "https://example.test/?login=octocat",
    },
  );
  assert.deepEqual(
    buildAuditSharePayload(
      "octocat",
      "hubot",
      "https://example.test/?login=octocat&compare=hubot",
    ),
    {
      title: "Constellation — @octocat × @hubot",
      text: "Compare os sinais públicos de @octocat e @hubot no Constellation.",
      url: "https://example.test/?login=octocat&compare=hubot",
    },
  );
});

test("prefers the native share sheet with the complete payload", async () => {
  const payload = buildAuditSharePayload("octocat", null, "https://example.test/?login=octocat");
  let received;
  let copied = false;

  const result = await shareAudit(payload, {
    share: async (value) => {
      received = value;
    },
    clipboard: {
      writeText: async () => {
        copied = true;
      },
    },
  });

  assert.equal(result, "shared");
  assert.deepEqual(received, payload);
  assert.equal(copied, false);
});

test("copies only the canonical URL when native sharing is unavailable or fails", async () => {
  const payload = buildAuditSharePayload("octocat", null, "https://example.test/?login=octocat");
  const copied = [];
  const clipboard = {
    writeText: async (value) => copied.push(value),
  };

  assert.equal(await shareAudit(payload, { clipboard }), "copied");
  assert.equal(await shareAudit(payload, {
    share: async () => {
      throw new Error("Native share failed");
    },
    clipboard,
  }), "copied");
  assert.deepEqual(copied, [payload.url, payload.url]);
});

test("distinguishes a user cancellation from an unavailable share path", async () => {
  const payload = buildAuditSharePayload("octocat", null, "https://example.test/?login=octocat");
  let clipboardCalled = false;

  assert.equal(await shareAudit(payload, {
    share: async () => {
      throw { name: "AbortError" };
    },
    clipboard: {
      writeText: async () => {
        clipboardCalled = true;
      },
    },
  }), "cancelled");
  assert.equal(clipboardCalled, false);

  assert.equal(await shareAudit(payload, {
    clipboard: {
      writeText: async () => {
        throw new Error("Clipboard denied");
      },
    },
  }), "unavailable");
  assert.equal(await shareAudit(payload, {}), "unavailable");
});
