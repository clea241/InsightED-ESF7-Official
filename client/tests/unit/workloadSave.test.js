// Run with: npm run test:unit
import { test, expect, vi } from "vitest";
import {
  isTransientSaveError,
  retryTransient,
  verifySavedRows,
  editedSinceSent,
} from "../../src/services/workloadSave.js";

const P = "PER-1";
const b = (id, start, over = {}) => ({
  id,
  term: "1st",
  subject: "MATHEMATICS",
  sectionId: "S1",
  gradeLevel: "Grade 1",
  startTime: start,
  endTime: "10:00",
  days: ["M"],
  ...over,
});
const err = (status, message = "x") =>
  Object.assign(new Error(message), { status });

test("502/503/504, timeouts and dropped connections are transient; validation answers are not", () => {
  for (const s of [502, 503, 504, 408, 429])
    expect(isTransientSaveError(err(s))).toBe(true);
  expect(
    isTransientSaveError(
      Object.assign(new Error("Failed to fetch"), { name: "TypeError" }),
    ),
  ).toBe(true);
  expect(
    isTransientSaveError(
      Object.assign(new Error("The user aborted a request."), {
        name: "AbortError",
      }),
    ),
  ).toBe(true);
  for (const s of [400, 401, 403, 404, 409, 422, 500])
    expect(isTransientSaveError(err(s))).toBe(false);
  expect(isTransientSaveError(new Error("Something unrelated broke"))).toBe(
    false,
  );
});

test("retries a transient failure with backoff and returns the first success", async () => {
  const sleep = vi.fn().mockResolvedValue();
  const task = vi
    .fn()
    .mockRejectedValueOnce(err(502))
    .mockRejectedValueOnce(err(504))
    .mockResolvedValue("saved");
  expect(await retryTransient(task, { sleep, delays: [10, 20, 30] })).toBe(
    "saved",
  );
  expect(task).toHaveBeenCalledTimes(3);
  expect(sleep.mock.calls.map((c) => c[0])).toEqual([10, 20]);
});

test("gives up after the last retry and throws the last error", async () => {
  const task = vi.fn().mockRejectedValue(err(502, "busy"));
  await expect(
    retryTransient(task, { sleep: () => Promise.resolve(), delays: [1, 1] }),
  ).rejects.toThrow("busy");
  expect(task).toHaveBeenCalledTimes(3);
});

test("a 422 is reported at once, without retrying, with the server message untouched", async () => {
  const task = vi
    .fn()
    .mockRejectedValue(err(422, "This teacher has no classes assigned."));
  await expect(
    retryTransient(task, { sleep: () => Promise.resolve() }),
  ).rejects.toThrow("This teacher has no classes assigned.");
  expect(task).toHaveBeenCalledTimes(1);
});

test("verification passes when the server returned exactly the blocks that were sent, whatever ids it used", () => {
  const sent = [
    b("new-1", "08:00"),
    b("r-2", "09:00"),
    b("r-3", "08:00", { term: "2nd" }),
  ];
  const saved = [
    b("WKL-1", "08:00"),
    b("r-2", "09:00"),
    b("r-3", "08:00", { term: "2nd" }),
  ];
  expect(verifySavedRows(P, sent, saved, ["1st", "2nd"])).toEqual({
    ok: true,
    mismatchedTerms: [],
  });
});

test("verification fails (and names the term) when a block is missing or altered", () => {
  const sent = [b("r-1", "08:00"), b("r-2", "09:00")];
  expect(verifySavedRows(P, sent, [b("r-1", "08:00")], ["1st"])).toEqual({
    ok: false,
    mismatchedTerms: ["1st"],
  });
  expect(
    verifySavedRows(P, sent, [b("r-1", "08:00"), b("r-2", "09:30")], ["1st"])
      .ok,
  ).toBe(false);
});

test("a replaced term with no sent blocks must come back empty", () => {
  expect(verifySavedRows(P, [], [], ["1st"]).ok).toBe(true);
  expect(verifySavedRows(P, [], [b("left-over", "08:00")], ["1st"]).ok).toBe(
    false,
  );
});

test("edits made while the save was in flight are detected, and a re-ordered or re-id-ed list is not an edit", () => {
  const sent = [b("r-1", "08:00"), b("r-2", "09:00")];
  expect(editedSinceSent(sent, [b("r-2", "09:00"), b("WKL-9", "08:00")])).toBe(
    false,
  );
  expect(editedSinceSent(sent, [...sent, b("r-3", "11:00")])).toBe(true);
  expect(
    editedSinceSent(sent, [
      b("r-1", "08:00"),
      b("r-2", "09:00", { subject: "SCIENCE" }),
    ]),
  ).toBe(true);
});

test("normalizeRowsForComparison ignores row order, generated ids, and timestamps", async () => {
  const { normalizeRowsForComparison } =
    await import("../../src/pages/Workload.jsx");
  const dbRows = [
    {
      id: "WKL-300488-001",
      term: "1st",
      subject: "MATHEMATICS",
      sectionName: "FLOUNDER",
      gradeLevel: "Grade 9",
      startTime: "07:30:00",
      endTime: "08:30:00",
      days: ["M", "T", "W", "TH", "F"],
      created_at: "2026-10-09",
    },
    {
      id: "WKL-300488-002",
      term: "1st",
      subject: "ADVISORY",
      sectionName: "FLOUNDER",
      gradeLevel: "Grade 9",
      startTime: "08:30:00",
      endTime: "09:30:00",
      days: ["M"],
      created_at: "2026-10-09",
    },
  ];
  // Reordered, different generated IDs, different timestamp/date formats
  const editorRows = [
    {
      id: "wk-adv-generated-999",
      term: "1st",
      subject: "ADVISORY",
      sectionName: "FLOUNDER",
      gradeLevel: "Grade 9",
      startTime: "08:30",
      endTime: "09:30",
      days: ["M"],
    },
    {
      id: "new-workload-xyz-123",
      term: "1st",
      subject: "MATHEMATICS",
      sectionName: "FLOUNDER",
      gradeLevel: "Grade 9",
      startTime: "07:30",
      endTime: "08:30",
      days: ["M", "T", "W", "TH", "F"],
    },
  ];

  const dbNorm = normalizeRowsForComparison(dbRows, "1st");
  const editorNorm = normalizeRowsForComparison(editorRows, "1st");
  expect(JSON.stringify(editorNorm)).toEqual(JSON.stringify(dbNorm));
});

test("normalizeRowsForComparison detects real differences in schedule", async () => {
  const { normalizeRowsForComparison } =
    await import("../../src/pages/Workload.jsx");
  const dbRows = [
    {
      id: "WKL-300488-001",
      term: "1st",
      subject: "MATHEMATICS",
      sectionName: "FLOUNDER",
      gradeLevel: "Grade 9",
      startTime: "07:30:00",
      endTime: "08:30:00",
      days: ["M", "T", "W", "TH", "F"],
    },
  ];
  const changedTimeRows = [
    {
      id: "new-1",
      term: "1st",
      subject: "MATHEMATICS",
      sectionName: "FLOUNDER",
      gradeLevel: "Grade 9",
      startTime: "08:00",
      endTime: "09:00",
      days: ["M", "T", "W", "TH", "F"],
    },
  ];
  const changedSubjectRows = [
    {
      id: "new-1",
      term: "1st",
      subject: "SCIENCE",
      sectionName: "FLOUNDER",
      gradeLevel: "Grade 9",
      startTime: "07:30",
      endTime: "08:30",
      days: ["M", "T", "W", "TH", "F"],
    },
  ];

  const dbNorm = normalizeRowsForComparison(dbRows, "1st");
  expect(
    JSON.stringify(normalizeRowsForComparison(changedTimeRows, "1st")),
  ).not.toEqual(JSON.stringify(dbNorm));
  expect(
    JSON.stringify(normalizeRowsForComparison(changedSubjectRows, "1st")),
  ).not.toEqual(JSON.stringify(dbNorm));
});
