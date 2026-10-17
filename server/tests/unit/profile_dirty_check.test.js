import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(
  new URL("../../../client/src/pages/PersonnelProfile.jsx", import.meta.url),
  "utf8",
);

// Pull the real canonicalValue (and its helpers) out of the component file so the rules under
// test are the shipped ones, not a copy.
const start = src.indexOf("const VOLATILE_ROW_KEYS");
const end = src.indexOf("const toCamelCase");
const canonicalValue = new Function(
  `${src.slice(start, end)}; return canonicalValue;`,
)();
const same = (a, b) =>
  JSON.stringify(canonicalValue(a)) === JSON.stringify(canonicalValue(b));

describe("dirty-check normalization", () => {
  it("treats type and empty-value mismatches as equal", () => {
    expect(same("false", false)).toBe(true);
    expect(same("0", 0)).toBe(true);
    expect(same(null, "")).toBe(true);
    expect(same(undefined, "")).toBe(true);
    expect(same(null, undefined)).toBe(true);
  });

  it("ignores N/A and 0 defaults the form injects into rows", () => {
    const saved = [{ id: "t1", title: "Reading Seminar", hours: 8 }];
    const formInitialized = [
      {
        id: "t1",
        title: "Reading Seminar",
        hours: 8,
        conductor: "N/A",
        days: "0",
      },
    ];
    expect(same(saved, formInitialized)).toBe(true);
  });

  it("still detects a real edit inside a row", () => {
    const saved = [{ id: "t1", title: "Reading Seminar", hours: 8 }];
    expect(
      same(saved, [{ id: "t1", title: "Reading Seminar", hours: 16 }]),
    ).toBe(false);
    expect(
      same(saved, [
        { id: "t1", title: "Reading Seminar", hours: 8, days: "3" },
      ]),
    ).toBe(false);
  });

  it("compares rows with ids by id, not position, and ignores generated keys", () => {
    const a = [
      { id: "b", title: "B" },
      { id: "a", title: "A" },
    ];
    const b = [
      { id: "a", title: "A", clientKey: "x1" },
      { id: "b", title: "B", clientKey: "x2" },
    ];
    expect(same(a, b)).toBe(true);
  });
});

describe("Personnel Profile no longer trusts browser copies", () => {
  it("no localStorage draft_personnel_ / draft_learning_areas_ reads or writes remain", () => {
    expect(src).not.toMatch(
      /localStorage\.(get|set|remove)Item\(\s*`draft_(personnel|learning_areas)_/,
    );
  });

  it("the baseline comes from a fresh API fetch and nothing is dirty before it loads", () => {
    expect(src).toMatch(/api\s*\.getPersonnelById\(id\)/);
    expect(src).toMatch(/baselineReady\s*&&/);
    expect(src).not.toMatch(/otherDraftDiffs/);
  });

  it("the restore question runs once per load, after the fetch, and asks before applying", () => {
    const i = src.indexOf("isDraftPromptResolved(parts)");
    const body = src.slice(i - 200, i + 3200);
    expect(body).toMatch(/!baselineReady/);
    expect(body).toMatch(/markDraftPromptResolved\(parts\)/);
    expect(body).toMatch(/draft\.baseVersion !== serverVersion/);
    expect(body).toMatch(/await showConfirm\(/);
    expect(body).toMatch(/draftChoicePendingRef\.current = true/);
    expect(body).toMatch(/checkAndPromptOutboxOnSectionOpen\(/);
  });
});

describe("profileDraft store", () => {
  let store;
  beforeEach(async () => {
    const mem = new Map();
    const fake = {
      get length() {
        return mem.size;
      },
      key: (i) => [...mem.keys()][i] ?? null,
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    };
    globalThis.window = { sessionStorage: fake, localStorage: fake };
    store = await import("../../../client/src/services/profileDraft.js");
  });

  const parts = { user: "u1", schoolId: "300488", personnelId: "P1" };

  it("stores only the delta with its base version, per user + school + record", () => {
    store.saveProfileDraft(parts, "v1", { firstName: "ANA" });
    const d = store.readProfileDraft(parts);
    expect(d.delta).toEqual({ firstName: "ANA" });
    expect(d.baseVersion).toBe("v1");
    expect(store.readProfileDraft({ ...parts, user: "u2" })).toBeNull();
    expect(store.readProfileDraft({ ...parts, personnelId: "P2" })).toBeNull();
  });

  it("an empty delta removes the draft", () => {
    store.saveProfileDraft(parts, "v1", { firstName: "ANA" });
    store.saveProfileDraft(parts, "v1", {});
    expect(store.readProfileDraft(parts)).toBeNull();
  });

  it("logout clears every draft, including legacy browser copies", () => {
    store.saveProfileDraft(parts, "v1", { firstName: "ANA" });
    window.localStorage.setItem("draft_personnel_P1", "{}");
    window.localStorage.setItem("draft_learning_areas_P1", "{}");
    store.clearAllProfileDrafts();
    expect(store.readProfileDraft(parts)).toBeNull();
    expect(window.localStorage.getItem("draft_personnel_P1")).toBeNull();
    expect(window.localStorage.getItem("draft_learning_areas_P1")).toBeNull();
  });

  it("uses updated_at as the record version when the server sends it", () => {
    expect(
      store.recordVersion({ updated_at: "2026-10-17T01:00:00.000Z" }, (x) => x),
    ).toBe("2026-10-17T01:00:00.000Z");
  });
});
