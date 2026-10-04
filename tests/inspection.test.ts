import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { load, removeWorkspace } from "../server/store.js";
import { setSession, deleteWorkspaceSessions } from "../server/sessions.js";
import { readInspection, saveInspection } from "../server/inspection.js";

test("persisted inspection draft is session-bound, editable, idempotent and cannot save after expiry", async () => {
  const workspace = randomBytes(24).toString("hex");
  const draftId = crypto.randomUUID();
  const draft = { summary: "Used 4 of 30 days", usage: 4, limit: 30, days: 30 };
  const expires = Date.now() + 60000;
  const close = async () => {};
  try {
    await load(workspace);
    await setSession(
      workspace,
      "inspection",
      {
        id: "fake-browser",
        subscriptionId: "notion",
        expires,
        liveViewUrl: "https://example.test/view",
      },
      expires,
    );
    await setSession(
      workspace,
      "inspection-draft",
      {
        id: draftId,
        browserId: "fake-browser",
        subscriptionId: "notion",
        draft,
      },
      expires,
    );
    const read = await readInspection(workspace, "notion");
    assert.deepEqual(read.draft, draft);
    assert.equal(read.draftId, draftId);
    assert.deepEqual(await readInspection(workspace, "spotify"), {});
    const evidence = {
      ...draft,
      draftId,
      metric: "days" as const,
      unit: "active day",
    };
    await assert.rejects(
      saveInspection(
        workspace,
        "notion",
        { ...evidence, draftId: crypto.randomUUID() },
        close,
      ),
      /expired/,
    );
    await saveInspection(workspace, "notion", { ...evidence, usage: 5 }, close);
    await saveInspection(workspace, "notion", { ...evidence, usage: 5 }, close);
    const saved = (await load(workspace)).subscriptions
      .find((s) => s.id === "notion")!
      .evidence.filter((e) => e.id === draftId);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].usage, 5);
    assert.equal(saved[0].source, "Self-reported");
    assert.equal(saved[0].confidence, "Medium");
    await setSession(
      workspace,
      "inspection",
      { id: "new-browser", subscriptionId: "notion", expires },
      expires,
    );
    await assert.rejects(
      saveInspection(workspace, "notion", evidence, close),
      /expired/,
    );
    await setSession(
      workspace,
      "inspection",
      { id: "fake-browser", subscriptionId: "notion", expires: 1 },
      1,
    );
    await assert.rejects(
      saveInspection(workspace, "notion", evidence, close),
      /expired/,
    );
  } finally {
    await deleteWorkspaceSessions(workspace);
    await removeWorkspace(workspace);
  }
});
