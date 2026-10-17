import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("Room QR /roster uses the shared personnel data path", () => {
  const src = readFileSync(
    new URL("../../controllers/room_profiling/index.js", import.meta.url),
    "utf8",
  );
  const i = src.indexOf("async function loadRoomRosterFromDb");
  const h = src.slice(i, i + 4500);

  it("selects service dates, trainings and learning areas", () => {
    expect(h).toMatch(/first_service_date/);
    expect(h).toMatch(/esf7_personnel_ld_trainings/);
    expect(h).toMatch(/esf7_personnel_learning_areas/);
    expect(h).toMatch(/step_increment/);
  });

  it("formats rows with the same formatter as Personnel Profiling", () => {
    expect(h).toMatch(/formatPersonnelRecord/);
  });
});

describe("Room QR verify-passcode and accept protect saved data", () => {
  const src = readFileSync(
    new URL("../../controllers/room_profiling/index.js", import.meta.url),
    "utf8",
  );
  it("verify-passcode returns the full record from the shared loader", () => {
    const i = src.indexOf('"/verify-passcode"');
    expect(src.slice(i, i + 1500)).toMatch(/loadRoomRosterFromDb/);
  });
  it("accept only deletes L&D rows for people whose submission carries rows", () => {
    expect(src).toMatch(/trainingReplaceIds/);
    expect(src).not.toMatch(
      /DELETE FROM esf7_personnel_ld_trainings\s+WHERE personnel_id = ANY\(\$1::varchar\[\]\)\s*`,\s*\[personnelIdsInBatch\]/,
    );
  });
});

describe("Room QR accept persists the learning area matrix", () => {
  const src = readFileSync(
    new URL("../../controllers/room_profiling/index.js", import.meta.url),
    "utf8",
  );
  it("upserts esf7_personnel_learning_areas inside the accept transaction", () => {
    expect(src).toMatch(
      /"esf7_personnel_learning_areas",\s*\[\s*"id",\s*"personnel_id",\s*"matrix_data"/,
    );
    expect(src).toMatch(/learningAreaUpsertRows/);
  });
});
