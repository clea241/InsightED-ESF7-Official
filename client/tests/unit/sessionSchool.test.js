// The single authoritative school id: every API call takes it from the logged-in session (token payload).
import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  getSessionSchoolId,
  resolveSchoolId,
  getSchoolIdMismatches,
} from "../../src/services/session.js";

const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "");
const tokenFor = (claims) => `${b64({ alg: "HS256" })}.${b64(claims)}.sig`;

beforeEach(() => {
  globalThis.localStorage.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("resolveSchoolId", () => {
  test("uses the session school even when stale state asks for another one (school 100093 vs session 302261)", () => {
    localStorage.setItem(
      "token",
      tokenFor({ uid: "u1", role: "school", school_id: "302261" }),
    );
    localStorage.setItem("activeSchoolId", "100093"); // leftover from a previous login
    expect(getSessionSchoolId()).toBe("302261");
    expect(resolveSchoolId("100093")).toBe("302261");
    expect(resolveSchoolId(undefined)).toBe("302261");
    expect(resolveSchoolId("SCH-302261")).toBe("302261");
  });
  test("a mismatch is recorded so it can be reported", () => {
    localStorage.setItem(
      "token",
      tokenFor({ uid: "u1", role: "school", school_id: "302261" }),
    );
    const before = getSchoolIdMismatches().length;
    resolveSchoolId("100093");
    const all = getSchoolIdMismatches();
    expect(all.length).toBe(before + 1);
    expect(all[all.length - 1]).toMatchObject({
      sessionSchoolId: "302261",
      requestedSchoolId: "100093",
    });
  });
  test("Admin / office accounts may name another school explicitly", () => {
    localStorage.setItem(
      "token",
      tokenFor({ uid: "a1", role: "Admin", school_id: "302261" }),
    );
    expect(resolveSchoolId("100093")).toBe("100093");
    localStorage.setItem(
      "token",
      tokenFor({ uid: "s1", role: "School Division Office" }),
    );
    expect(resolveSchoolId("100093")).toBe("100093");
  });
  test("pilot/divtest uids carry their school", () => {
    localStorage.setItem(
      "token",
      tokenFor({ uid: "pilot-199999", role: "school" }),
    );
    expect(getSessionSchoolId()).toBe("199999");
  });
  test("after logout (no token) nothing from the old session is used", () => {
    localStorage.setItem(
      "token",
      tokenFor({ uid: "u1", role: "school", school_id: "302261" }),
    );
    expect(resolveSchoolId(null)).toBe("302261");
    localStorage.removeItem("token");
    localStorage.removeItem("activeSchoolId");
    expect(getSessionSchoolId()).toBe("");
    expect(resolveSchoolId(null)).toBe("");
  });
});
