import { describe, it, expect, beforeEach } from "vitest";
import {
  upsertOutboxEntry,
  getOutboxEntries,
  removeOutboxEntry,
  removeOutboxEntryByModule,
  hasFailedEntries,
  reconcileOutboxWithDatabase,
  resolveOutboxConflict,
  markOutboxAttempt,
} from "../../src/services/outbox";

describe("Outbox Service Layer", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("upserts and retrieves outbox entries coalescing by stable key", async () => {
    const entry1 = await upsertOutboxEntry({
      schoolId: "302261",
      user: "teacher1",
      term: "1st",
      module: "school_profile",
      kind: "failed",
      payload: { schoolName: "Sample High" },
      lastError: "Network timeout",
    });

    expect(entry1).toBeDefined();
    expect(entry1.stableKey).toBe("302261::teacher1::1st::school_profile");
    expect(entry1.kind).toBe("failed");

    // Second upsert with same stable key should update in-place, not create duplicate
    const entry2 = await upsertOutboxEntry({
      schoolId: "302261",
      user: "teacher1",
      term: "1st",
      module: "school_profile",
      kind: "failed",
      payload: { schoolName: "Sample High Updated" },
      lastError: "HTTP 500",
    });

    expect(entry2).toBeDefined();
    const entries = await getOutboxEntries({
      schoolId: "302261",
      user: "teacher1",
    });
    expect(entries.length).toBe(1);
    expect(entries[0].payload.schoolName).toBe("Sample High Updated");
    expect(entries[0].lastError).toBe("HTTP 500");
  });

  it("hasFailedEntries correctly checks for failed entries", async () => {
    let hasFailed = await hasFailedEntries("302261", "teacher1");
    expect(hasFailed).toBe(false);

    await upsertOutboxEntry({
      schoolId: "302261",
      user: "teacher1",
      term: "1st",
      module: "organized_classes",
      kind: "failed",
      payload: [{ id: "sec-1" }],
    });

    hasFailed = await hasFailedEntries("302261", "teacher1");
    expect(hasFailed).toBe(true);

    // Filter by different user should be false
    expect(await hasFailedEntries("302261", "otherUser")).toBe(false);
  });

  it("marks attempt count and last error", async () => {
    const entry = await upsertOutboxEntry({
      schoolId: "302261",
      user: "teacher1",
      term: "1st",
      module: "school_profile",
      kind: "unsaved",
      payload: { test: true },
    });

    await markOutboxAttempt(entry.id, {
      error: new Error("Simulated failure"),
    });
    const list = await getOutboxEntries({
      schoolId: "302261",
      user: "teacher1",
    });
    expect(list[0].attempts).toBe(1);
    expect(list[0].lastError).toBe("Simulated failure");
    expect(list[0].kind).toBe("failed");
  });

  it("removes entries by id and by module", async () => {
    const entryA = await upsertOutboxEntry({
      schoolId: "302261",
      user: "teacher1",
      term: "1st",
      module: "workload",
      recordId: "teacher-123",
      kind: "unsaved",
      payload: [{ id: "row-1" }],
    });

    const entryB = await upsertOutboxEntry({
      schoolId: "302261",
      user: "teacher1",
      term: "1st",
      module: "school_profile",
      kind: "unsaved",
      payload: { name: "Test" },
    });

    let entries = await getOutboxEntries({
      schoolId: "302261",
      user: "teacher1",
    });
    expect(entries.length).toBe(2);

    // Remove by direct ID
    await removeOutboxEntry(entryB.id);
    entries = await getOutboxEntries({ schoolId: "302261", user: "teacher1" });
    expect(entries.length).toBe(1);
    expect(entries[0].id).toBe(entryA.id);

    // Remove by module
    await removeOutboxEntryByModule({
      schoolId: "302261",
      user: "teacher1",
      term: "1st",
      module: "workload",
      recordId: "teacher-123",
    });

    entries = await getOutboxEntries({ schoolId: "302261", user: "teacher1" });
    expect(entries.length).toBe(0);
  });

  it("reconciles with database baseline deleting identical items", async () => {
    await upsertOutboxEntry({
      schoolId: "302261",
      user: "teacher1",
      term: "1st",
      module: "school_profile",
      payload: { name: "Identical School" },
    });

    const remaining = await reconcileOutboxWithDatabase({
      schoolId: "302261",
      user: "teacher1",
      dbBaseline: {
        school_profile: { name: "Identical School" },
      },
    });

    expect(remaining.length).toBe(0);
    const inOutbox = await getOutboxEntries({
      schoolId: "302261",
      user: "teacher1",
    });
    expect(inOutbox.length).toBe(0);
  });

  it("reconciles with database flagging conflicts if server version changed", async () => {
    const entry = await upsertOutboxEntry({
      schoolId: "302261",
      user: "teacher1",
      term: "1st",
      module: "school_profile",
      baseVersion: 1,
      payload: { name: "Local Edits" },
    });
    expect(entry).toBeDefined();

    const remaining = await reconcileOutboxWithDatabase({
      schoolId: "302261",
      user: "teacher1",
      dbBaseline: {
        school_profile: { name: "Server Baseline Edits" },
      },
      currentServerVersions: {
        school_profile: 2,
      },
    });

    expect(remaining.length).toBe(1);
    expect(remaining[0].inConflict).toBe(true);
  });

  it("resolves conflict with keep_server (removes) or keep_queued (clears flag)", async () => {
    const entry = await upsertOutboxEntry({
      schoolId: "302261",
      user: "teacher1",
      term: "1st",
      module: "school_profile",
      inConflict: true,
      payload: { name: "My Version" },
    });

    // keep_queued
    await resolveOutboxConflict(entry.id, "keep_queued");
    let list = await getOutboxEntries({ schoolId: "302261", user: "teacher1" });
    expect(list[0].inConflict).toBe(false);

    // keep_server
    await resolveOutboxConflict(entry.id, "keep_server");
    list = await getOutboxEntries({ schoolId: "302261", user: "teacher1" });
    expect(list.length).toBe(0);
  });
});
