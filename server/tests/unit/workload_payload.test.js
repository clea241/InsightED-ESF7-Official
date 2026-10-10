import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildExtras,
  splitLegacyPayload,
  unaccountedKeys,
  reconstructPayload,
  sameAsColumn,
} = require("../../utils/workloadPayload");

const row = {
  id: "w1",
  personnel_id: "P1",
  school_id: "S1",
  school_year: "SY",
  grade_level: "Grade 7",
  section_id: null,
  section_name: "Rose",
  subject: "MATH",
  subject_id: null,
  remediation_subject: null,
  start_time: "08:00:00",
  end_time: "09:00:00",
  days: ["M", "W"],
  term: "1st",
};

describe("workloadPayload", () => {
  test("keeps only keys the typed columns do not hold", () => {
    const extras = buildExtras(
      {
        id: "w1",
        gradeLevel: "Grade 7",
        sectionId: null,
        subjectName: "MATH",
        startTime: "08:00",
        days: ["M", "W"],
        task: "Advisory",
        minsPerDay: 60,
        rawPayload: { a: 1 },
      },
      row,
    );
    expect(extras).toEqual({ task: "Advisory", minsPerDay: 60 });
  });

  test("an alias with a different or empty value is kept, so nothing is lost", () => {
    const extras = buildExtras(
      { gradeLevel: "Grade 8", sectionName: "", subject_name: "SCIENCE" },
      row,
    );
    expect(extras).toEqual({
      gradeLevel: "Grade 8",
      sectionName: "",
      subject_name: "SCIENCE",
    });
  });

  test("time values compare as HH:MM or HH:MM:SS", () => {
    expect(sameAsColumn("time", "08:00", "08:00:00")).toBe(true);
    expect(sameAsColumn("time", "08:00:00", "08:00:00")).toBe(true);
    expect(sameAsColumn("time", "8:00", "08:00:00")).toBe(false);
    expect(sameAsColumn("time", "", null)).toBe(false);
    expect(sameAsColumn("time", null, null)).toBe(true);
  });

  test("legacy split fills empty typed columns and the result accounts for every payload key", () => {
    const payload = {
      id: "w1",
      remediationSubject: "Reading",
      sectionId: "",
      task: "T",
      rowType: "teaching",
      gradeLevel: "Grade 7",
      startTime: "08:00",
    };
    const { fills, extras } = splitLegacyPayload(payload, row);
    expect(fills).toEqual({ remediation_subject: "Reading" });
    expect(extras).toEqual({ sectionId: "", task: "T", rowType: "teaching" });
    const after = { ...row, ...fills, extras };
    expect(unaccountedKeys(payload, after)).toEqual([]);
    expect(unaccountedKeys({ ...payload, mystery: 1 }, after)).toEqual([
      "mystery",
    ]);
  });

  test("reconstructPayload rebuilds the keys every old payload carried", () => {
    const p = reconstructPayload({
      ...row,
      extras: { task: "T", gradeLevel: "Grade 8" },
    });
    expect(p).toMatchObject({
      id: "w1",
      gradeLevel: "Grade 8",
      sectionName: "Rose",
      subject: "MATH",
      startTime: "08:00",
      endTime: "09:00",
      days: ["M", "W"],
      task: "T",
    });
  });
});
