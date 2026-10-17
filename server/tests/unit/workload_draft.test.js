import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(
  new URL("../../../client/src/pages/Workload.jsx", import.meta.url),
  "utf8",
);

// Take the real normalization + delta helpers out of the page so the tests exercise shipped code.
const start = src.indexOf("export const normalizeSubjectName");
const mid = src.indexOf("export const normalizeWorkloadRowForComparison");
const end = src.indexOf("export const ADMIN_TASK_OPTIONS");
const helpers = new Function(
  `${src.slice(start, mid).replace(/export /g, "")}
   ${src.slice(mid, end).replace(/export /g, "")}
   return { buildWorkloadDraftDelta, applyWorkloadDraftDelta, normalizeRowsForComparison };`,
)();
const { buildWorkloadDraftDelta, applyWorkloadDraftDelta } = helpers;

const row = (id, subject, startTime, extra = {}) => ({
  id,
  term: "1st",
  subject,
  gradeLevel: "Grade 7",
  sectionName: "A",
  startTime,
  endTime: "09:00",
  days: ["M", "T"],
  ...extra,
});

const saved = [row("r1", "MATH", "08:00"), row("r2", "SCIENCE", "09:00")];

describe("workload draft delta", () => {
  it("is empty when nothing changed, even if the form added default fields", () => {
    const person = {
      workloadBaseRows: saved,
      workloadRows: saved.map((r) => ({
        ...r,
        category: "Elementary",
        note: "",
      })),
    };
    expect(buildWorkloadDraftDelta(person, "1st")).toBeNull();
  });

  it("stores only changed / added rows and removed ids", () => {
    const person = {
      workloadBaseRows: saved,
      workloadRows: [
        row("r1", "MATH", "10:00"), // changed
        row("new1", "ENGLISH", "11:00"), // added
      ], // r2 removed
    };
    const delta = buildWorkloadDraftDelta(person, "1st");
    expect(delta.workloadRows.map((r) => r.id).sort()).toEqual(["new1", "r1"]);
    expect(delta.removed.map((x) => x.id)).toEqual(["r2"]);
  });

  it("rebuilds the edited rows when applied to the same saved rows", () => {
    const edited = [
      row("r1", "MATH", "10:00"),
      row("new1", "ENGLISH", "11:00"),
    ];
    const delta = buildWorkloadDraftDelta(
      { workloadBaseRows: saved, workloadRows: edited },
      "1st",
    );
    const rebuilt = applyWorkloadDraftDelta(saved, delta, "1st");
    expect(rebuilt.map((r) => r.id).sort()).toEqual(["new1", "r1"]);
    expect(rebuilt.find((r) => r.id === "r1").startTime).toBe("10:00");
  });

  it("keeps terms apart", () => {
    const other = row("t2", "ARALING PANLIPUNAN", "08:00", { term: "2nd" });
    const person = {
      workloadBaseRows: [...saved, other],
      workloadRows: [...saved, { ...other, startTime: "13:00" }],
    };
    expect(buildWorkloadDraftDelta(person, "1st")).toBeNull();
    expect(buildWorkloadDraftDelta(person, "2nd").workloadRows).toHaveLength(1);
  });

  it("a person with every row deleted still produces a draft (not treated as no draft)", () => {
    const delta = buildWorkloadDraftDelta(
      { workloadBaseRows: saved, workloadRows: [] },
      "1st",
    );
    expect(delta.removed).toHaveLength(2);
    expect(applyWorkloadDraftDelta(saved, delta, "1st")).toEqual([]);
  });
});

describe("Workload tab no longer trusts browser copies", () => {
  it("has no localStorage draft_workload reads or writes", () => {
    expect(src).not.toMatch(
      /localStorage\.(get|set|remove)Item\(\s*[`"']draft_workload/,
    );
    expect(src).not.toMatch(/readMigratedLocalStorage\(/);
    expect(src).not.toMatch(/writeWithLegacyCleanup\(/);
  });

  it("drafts use the shared store, keyed per tab, and are version-gated before any restore", () => {
    expect(src).toMatch(/tab: `workload:\$\{term \|\| "1st"\}`/);
    const i = src.indexOf(
      "const draft = readTeacherWorkloadDraft(personId, term);",
    );
    const body = src.slice(i, i + 900);
    expect(body).toMatch(/draft\.baseVersion\) !==/);
    expect(body).toMatch(/clearAllDrafts\(\)/);
    // the restore prompt still decides whether the draft is applied
    expect(src).toMatch(/await showWorkloadRestoreModal\(/);
  });

  it("the editor starts from the saved record, never from a draft", () => {
    expect(src).not.toMatch(/draftRowsMayOverlay\(\s*dbPerson\.id/);
    expect(src).toMatch(/const person = dbPerson;/);
  });

  it("the server-unreachable path no longer falls back to a browser draft", () => {
    const i = src.indexOf(
      'restoreResolutions.set(resolutionKey(personId, term), "unreachable");',
    );
    expect(src.slice(i, i + 500)).not.toMatch(/localStorage/);
  });
});
