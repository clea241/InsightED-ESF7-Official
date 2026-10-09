// Run with: npm run test:unit
import { test, expect, vi, beforeEach } from "vitest";

const saver = vi.hoisted(() => ({
  flushDrafts: vi.fn(),
  getDraftSaveState: vi.fn(),
}));
vi.mock("../../src/services/draftSaver", () => saver);

import {
  confirmServerDraftSaved,
  saveFailure,
} from "../../src/services/screenSave.js";

beforeEach(() => {
  saver.flushDrafts.mockReset();
  saver.getDraftSaveState.mockReset();
});

test("success only after the server confirmed the draft write", async () => {
  saver.getDraftSaveState.mockReturnValue({ dirty: true, status: "saved" });
  saver.flushDrafts.mockResolvedValue();
  expect(await confirmServerDraftSaved()).toEqual({ ok: true });
  expect(saver.flushDrafts).toHaveBeenCalledTimes(1);
});

test('waits for the saver to learn about a just-made change before flushing (no stale "saved")', async () => {
  let calls = 0;
  saver.getDraftSaveState.mockImplementation(() => ({
    dirty: ++calls > 3,
    status: "saved",
  })); // becomes dirty on the 4th look
  saver.flushDrafts.mockResolvedValue();
  const result = await confirmServerDraftSaved({
    waitForChangeMs: 1000,
    pollMs: 1,
  });
  expect(result.ok).toBe(true);
  expect(calls).toBeGreaterThanOrEqual(4);
});

test("does not wait forever when nothing changed", async () => {
  saver.getDraftSaveState.mockReturnValue({ dirty: false, status: "saved" });
  saver.flushDrafts.mockResolvedValue();
  const started = Date.now();
  expect(
    (await confirmServerDraftSaved({ waitForChangeMs: 60, pollMs: 5 })).ok,
  ).toBe(true);
  expect(Date.now() - started).toBeLessThan(500);
});

test("a failed save (502, timeout, 422...) comes back as a failure with the server message as-is", async () => {
  saver.getDraftSaveState.mockReturnValue({ dirty: true, status: "failed" });
  saver.flushDrafts.mockRejectedValue(
    Object.assign(
      new Error(
        "The server is busy or timed out (HTTP 502). Please try again shortly.",
      ),
      { status: 502 },
    ),
  );
  expect(await confirmServerDraftSaved()).toEqual({
    ok: false,
    title: "Not Saved to the Server",
    message:
      "The server is busy or timed out (HTTP 502). Please try again shortly.",
  });
});

test("a save that settles in a failed or conflict state is not reported as saved even if flush did not throw", async () => {
  saver.flushDrafts.mockResolvedValue();
  saver.getDraftSaveState.mockReturnValue({
    dirty: true,
    status: "conflict",
    lastError: new Error("A newer copy exists on the server."),
  });
  const r = await confirmServerDraftSaved({ waitForChangeMs: 0 });
  expect(r.ok).toBe(false);
  expect(r.message).toBe("A newer copy exists on the server.");
});

test("saveFailure builds the result shape every page uses", () => {
  expect(saveFailure("T", "M")).toEqual({
    ok: false,
    title: "T",
    message: "M",
  });
});
