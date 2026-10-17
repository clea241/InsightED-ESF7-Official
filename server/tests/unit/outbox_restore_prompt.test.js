import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRequire } from "node:module";

// A scripted stand-in for the SweetAlert2 dialog: each test sets what the user "clicks".
const swal = { answer: { isConfirmed: false }, calls: 0 };
// sweetalert2 is installed under client/, so mock it by its real resolved path (that is what outbox.js loads).
const clientRequire = createRequire(
  new URL("../../../client/package.json", import.meta.url),
);
const swalPath = clientRequire.resolve("sweetalert2");
const defaultFire = async () => {
  swal.calls += 1;
  return swal.answer;
};
const fakeSwal = { fire: defaultFire };

const makeStorage = () => {
  const mem = new Map();
  return {
    get length() {
      return mem.size;
    },
    key: (i) => [...mem.keys()][i] ?? null,
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear(),
  };
};

let outbox;
const scope = {
  schoolId: "300488",
  user: "head1",
  term: "1st",
  module: "personnel_profile",
  personnelId: "P1",
};

beforeEach(async () => {
  const ls = makeStorage();
  // No IndexedDB in node: the outbox falls back to localStorage, which is what we inspect here.
  globalThis.window = {
    localStorage: ls,
    sessionStorage: makeStorage(),
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
  };
  globalThis.localStorage = ls;
  globalThis.indexedDB = undefined;
  globalThis.BroadcastChannel = undefined;
  vi.resetModules();
  vi.doMock(swalPath, () => ({ default: fakeSwal }));
  outbox = await import("../../../client/src/services/outbox.js");
  outbox.resetOutboxPromptState();
  swal.calls = 0;
  swal.answer = { isConfirmed: false };
  fakeSwal.fire = defaultFire;
});

const seed = async (over = {}) =>
  outbox.upsertOutboxEntry({
    kind: "unsaved",
    ...scope,
    endpoint: "/api/personnel",
    payload: { id: "P1", firstName: "ANA" },
    baseVersion: "v1",
    ...over,
  });

const count = async () => (await outbox.getOutboxEntries({})).length;

const open = (extra = {}) =>
  outbox.checkAndPromptOutboxOnSectionOpen({
    ...scope,
    baseVersion: "v1",
    differsFromBaseline: () => true,
    onLoadPayload: extra.onLoadPayload || (() => {}),
    ...extra,
  });

describe("Unsent Changes Available prompt", () => {
  it("Keep Database Version deletes the entry, so it cannot come back", async () => {
    await seed();
    swal.answer = { isConfirmed: false, isDismissed: true };
    const loaded = vi.fn();
    expect(await open({ onLoadPayload: loaded })).toBe(false);
    expect(loaded).not.toHaveBeenCalled();
    expect(await count()).toBe(0);

    // A later open (even after the per-load flag is reset) finds nothing to ask about.
    outbox.resetOutboxPromptState();
    swal.calls = 0;
    await open();
    expect(swal.calls).toBe(0);
  });

  it("Load Unsent Changes applies the payload once and consumes the entry", async () => {
    await seed();
    swal.answer = { isConfirmed: true };
    const loaded = vi.fn();
    expect(await open({ onLoadPayload: loaded })).toBe(true);
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(loaded).toHaveBeenCalledWith({ id: "P1", firstName: "ANA" });
    expect(await count()).toBe(0);
  });

  it("asks only once per load, even when the effect runs again (remount / Strict Mode)", async () => {
    await seed();
    swal.answer = { isConfirmed: false };
    await Promise.all([open(), open(), open()]);
    await open();
    expect(swal.calls).toBe(1);
  });

  it("does not ask for a no-op draft that matches the database, and removes it", async () => {
    await seed();
    expect(await open({ differsFromBaseline: () => false })).toBe(false);
    expect(swal.calls).toBe(0);
    expect(await count()).toBe(0);
  });

  it("drops a draft made against a different version of the record without asking", async () => {
    await seed({ baseVersion: "OLD" });
    await open({ baseVersion: "NEW" });
    expect(swal.calls).toBe(0);
    expect(await count()).toBe(0);
  });

  it("never offers one employee's draft to another", async () => {
    await seed({ personnelId: "P2", payload: { id: "P2", firstName: "BEN" } });
    await open({ personnelId: "P1" });
    expect(swal.calls).toBe(0);
    expect(await count()).toBe(1); // P2's draft is untouched
  });

  it("drops an unattributed older snapshot instead of offering it to someone", async () => {
    await outbox.upsertOutboxEntry({
      kind: "unsaved",
      schoolId: scope.schoolId,
      user: scope.user,
      term: scope.term,
      module: scope.module,
      endpoint: "/api/personnel",
      payload: { firstName: "WHO" },
    });
    await open();
    expect(swal.calls).toBe(0);
    expect(await count()).toBe(0);
  });

  it("pauses the crash-safety writer while the question is open", async () => {
    await seed();
    let writtenDuringPrompt = null;
    swal.answer = { isConfirmed: false };
    const origFire = fakeSwal.fire;
    fakeSwal.fire = async (...a) => {
      // the form is dirty and the page tries to snapshot it right now
      writtenDuringPrompt = await seed({
        payload: { id: "P1", firstName: "NEW" },
      });
      return origFire(...a);
    };
    await open();
    expect(writtenDuringPrompt).toBeNull();
    expect(await count()).toBe(0);
  });

  it("a save clears the entry even if it was stored without an employee id", async () => {
    await outbox.upsertOutboxEntry({
      kind: "unsaved",
      schoolId: scope.schoolId,
      user: scope.user,
      term: scope.term,
      module: scope.module,
      endpoint: "/api/personnel",
      payload: { firstName: "OLD" },
    });
    await outbox.removeOutboxEntryByModule({ ...scope });
    expect(await count()).toBe(0);
  });
});
