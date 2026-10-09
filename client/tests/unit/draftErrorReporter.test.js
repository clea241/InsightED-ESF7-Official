// "Copy error details" report: contains what support needs, and never contains credentials.
import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  buildErrorReport,
  reportDraftError,
  clearDraftError,
  subscribeDraftError,
  setDraftErrorContext,
  copyTextToClipboard,
} from "../../src/services/draftErrorReporter.js";

const FAKE_JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzY2hvb2xfaWQiOiIzMDIyNjEifQ.c2lnbmF0dXJlLXZhbHVl";

beforeEach(() => {
  globalThis.localStorage.clear();
  // The session school comes from the token payload (the same id every API call uses).
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  globalThis.localStorage.setItem(
    "token",
    `${b64({ alg: "HS256" })}.${b64({ uid: "u", school_id: "302261" })}.sig`,
  );
  globalThis.localStorage.setItem("activeSchoolId", "100093"); // stale leftover from another login: must NOT be reported
  setDraftErrorContext({ userId: "user-42", role: "school_head" });
  clearDraftError();
});

const healthEntry = (error) => ({
  action: "Server health check (app locked)",
  error,
  timestamp: Date.UTC(2026, 9, 8, 3, 0, 0),
  count: 3,
});
const entryWith = (error) => ({
  action: "Draft auto-save",
  error,
  timestamp: Date.UTC(2026, 9, 8, 3, 0, 0),
  count: 2,
});

describe("report title follows the failing action", () => {
  test("server health lock is titled as a health check, not a draft save", () => {
    const r = buildErrorReport(
      healthEntry({
        name: "TypeError",
        message: "Failed to fetch",
        url: "/api/requests/incoming?schoolId=302261",
      }),
    );
    expect(r.split(String.fromCharCode(10))[0]).toBe(
      "InsightED eSF7 - Server Health Check Error Report",
    );
    expect(r).toContain("Failing action: Server health check (app locked)");
    expect(r).not.toMatch(/Draft/);
    expect(r).toContain("Occurrences since last success: 3");
  });
  test("draft actions keep the draft title, other actions get their own", () => {
    expect(
      buildErrorReport(entryWith({ message: "x" })).split(
        String.fromCharCode(10),
      )[0],
    ).toBe("InsightED eSF7 - Draft Save Error Report");
    expect(
      buildErrorReport({
        ...entryWith({ message: "x" }),
        action: "Requests refresh",
      }).split(String.fromCharCode(10))[0],
    ).toBe("InsightED eSF7 - Requests Refresh Error Report");
  });
  test("the report uses the session school, never a stale localStorage value", () => {
    const r = buildErrorReport(healthEntry({ message: "x" }));
    expect(r).toContain("School ID: 302261");
    expect(r).not.toContain("100093");
  });
  test("a health report carries no token or secret", () => {
    const r = buildErrorReport(
      healthEntry({
        name: "ApiError",
        message: `Authorization: Bearer ${FAKE_JWT}`,
        stack: `at x token=abc123secret ${FAKE_JWT}`,
        url: `/api/x?token=${FAKE_JWT}`,
      }),
    );
    expect(r).not.toContain(FAKE_JWT);
    expect(r).not.toContain("abc123secret");
  });
});

describe("buildErrorReport", () => {
  test("includes error, stack, action, URL, status, school, user, version and timestamp", () => {
    const report = buildErrorReport(
      entryWith({
        name: "ApiError",
        message: "Request failed (HTTP 504).",
        stack: "ApiError: x\n    at save (api.js:1:1)",
        url: "/insighted-esf7-prod/api/school/draft",
        status: 504,
      }),
    );
    expect(report).toContain("Draft auto-save");
    expect(report).toContain("ApiError: Request failed (HTTP 504).");
    expect(report).toContain("/insighted-esf7-prod/api/school/draft");
    expect(report).toContain("HTTP status: 504");
    expect(report).toContain("School ID: 302261");
    expect(report).toContain("user-42");
    expect(report).toContain("school_head");
    expect(report).toContain("2026-10-08T03:00:00.000Z");
    expect(report).toContain("App version:");
    expect(report).toContain("Stack trace:");
  });

  test("strips bearer tokens, JWTs, cookies and passwords from message, stack and URL", () => {
    const report = buildErrorReport(
      entryWith({
        name: "Error",
        message: `failed with Authorization: Bearer ${FAKE_JWT} and password=hunter2`,
        stack: `Error: boom\n  token=${FAKE_JWT}\n  cookie: session=abc123`,
        url: `/api/school/draft?token=${FAKE_JWT}&schoolYear=SY%2026-27`,
        status: 500,
      }),
    );
    expect(report).not.toContain(FAKE_JWT);
    expect(report).not.toContain("hunter2");
    expect(report).not.toContain("abc123");
    expect(report).not.toMatch(/token=eyJ/);
    expect(report).toContain("[redacted");
    expect(report).toContain("schoolYear="); // harmless query parameters are kept
  });

  test("never includes request payload content (only whitelisted fields are read)", () => {
    const report = buildErrorReport(
      entryWith({
        name: "Error",
        message: "x",
        payload: { personnel: [{ name: "SECRET PERSON" }] },
        body: "SECRET BODY",
      }),
    );
    expect(report).not.toContain("SECRET");
  });
});

describe("notice state (one notice, updated in place)", () => {
  test("repeated failures update a single entry instead of stacking", () => {
    const seen = [];
    const off = subscribeDraftError((e) => seen.push(e));
    reportDraftError("Draft auto-save", new Error("first"));
    reportDraftError("Draft auto-save", new Error("second"));
    reportDraftError("Draft auto-save", new Error("third"));
    expect(seen.at(-1).count).toBe(3);
    expect(seen.at(-1).error.message).toBe("third");
    off();
  });

  test("clears on the next success and keeps a retry callback if one was given", () => {
    const retry = vi.fn();
    const seen = [];
    subscribeDraftError((e) => seen.push(e));
    reportDraftError("Initial data load", new Error("x"), { retry });
    expect(seen.at(-1).retry).toBe(retry);
    clearDraftError();
    expect(seen.at(-1)).toBeNull();
  });
});

describe("copyTextToClipboard", () => {
  test("uses navigator.clipboard when available, in a secure context", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("window", { isSecureContext: true });
    await expect(copyTextToClipboard("report")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("report");
    vi.unstubAllGlobals();
  });

  test("falls back to a hidden textarea + execCommand on non-secure contexts", async () => {
    const textarea = {
      value: "",
      style: {},
      setAttribute: vi.fn(),
      select: vi.fn(),
    };
    const body = { appendChild: vi.fn(), removeChild: vi.fn() };
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", { isSecureContext: false });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => textarea),
      body,
      execCommand: vi.fn(() => true),
    });
    await expect(copyTextToClipboard("report")).resolves.toBe(true);
    expect(textarea.value).toBe("report");
    expect(body.removeChild).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
