import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(
  new URL("../../../client/src/pages/RoomQR.jsx", import.meta.url),
  "utf8",
);

describe("Room QR Approve & Merge handlers", () => {
  it("no longer claims the merge went to a local draft", () => {
    expect(src).not.toMatch(/into local draft/i);
    expect(src).not.toMatch(/Local Draft Roster/);
  });

  it("all three handlers use the blocking save alert and the double-click lock", () => {
    for (const fn of [
      "const handleCommitAllSubmissions",
      "const handleCommitSingle",
      "const handleCommitReview",
    ]) {
      const i = src.indexOf(fn);
      expect(i).toBeGreaterThan(-1);
      const body = src.slice(i, i + 2500);
      expect(body).toMatch(/acceptLockRef\.current/);
      expect(body).toMatch(/beginSaveFlow\(/);
    }
  });

  it("local state is only changed from the server response", () => {
    const i = src.indexOf("const applyAcceptResult");
    const body = src.slice(i, i + 700);
    expect(body).toMatch(/res\.updatedPersonnel/);
    expect(body).toMatch(/throw new Error/);
  });
});
