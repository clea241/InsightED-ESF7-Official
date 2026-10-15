import { test, expect } from "@playwright/test";
import {
  API,
  bearer,
  dbQuery,
  draftBody,
  newTenant,
  person,
  profileRowsWithMarker,
  saveDraft,
} from "./helpers";

const personnelIds = async (schoolId: string) =>
  (
    await dbQuery(
      "SELECT id FROM esf7_personnel_profile WHERE school_id::text = $1 ORDER BY id",
      [schoolId],
    )
  ).map((r) => r.id);
const draftVersion = async (schoolId: string) =>
  Number(
    (
      await dbQuery("SELECT version FROM school_drafts WHERE school_id = $1", [
        schoolId,
      ])
    )[0]?.version,
  );

test.describe("save by id", () => {
  test("FP-07 a save with fewer records never wipes the others; only an explicit delete list removes a record", async ({
    request,
  }) => {
    const t = newTenant("fp07");
    const three = [1, 2, 3].map((i) => person(t, i));
    const first = await saveDraft(request, t, "fp07-a", undefined, {
      personnel: three,
    });
    expect(first.ok()).toBeTruthy();
    expect(await personnelIds(t.schoolId)).toHaveLength(3);

    // A save carrying only one record (a partial or stale client state) must not shrink the table.
    const reduced = await saveDraft(request, t, "fp07-b", 1, {
      personnel: [three[0]],
    });
    if (reduced.ok())
      expect(
        await personnelIds(t.schoolId),
        "a save with fewer records must not delete the rest",
      ).toHaveLength(3);
    else expect([400, 409, 422]).toContain(reduced.status());

    // An empty list (what a failed load would send) must not wipe the school either.
    const emptied = await saveDraft(
      request,
      t,
      "fp07-c",
      reduced.ok() ? 2 : 1,
      { personnel: [] },
    );
    if (emptied.ok())
      expect(
        await personnelIds(t.schoolId),
        "an empty save must not delete everything",
      ).toHaveLength(3);

    // The server tells the client the true count, so a mismatch is detectable.
    if (emptied.ok())
      expect((await emptied.json()).entity_counts.personnel).toBe(3);

    // An explicit delete of one id (what the roster's confirmed delete sends) removes exactly that record.
    const del = await request.delete(`${API}/api/personnel/${three[1].id}`, {
      headers: bearer(t),
    });
    expect(
      del.ok(),
      `explicit delete must be accepted (got ${del.status()})`,
    ).toBeTruthy();
    expect(await personnelIds(t.schoolId)).toEqual([three[0].id, three[2].id]);
  });
});

test.describe("version conflicts", () => {
  test("FP-08 a stale second session is refused with the real current version, and the first session's data is kept", async ({
    request,
  }) => {
    const t = newTenant("fp08a");
    // Session A saves three times: the stored version is now 3.
    expect((await saveDraft(request, t, "fp08-v1")).ok()).toBeTruthy();
    expect((await saveDraft(request, t, "fp08-v2", 1)).ok()).toBeTruthy();
    expect((await saveDraft(request, t, "fp08-v3", 2)).ok()).toBeTruthy();
    expect(await draftVersion(t.schoolId)).toBe(3);

    // Session B still holds version 1 and tries to save its own edit.
    const stale = await saveDraft(request, t, "fp08-from-B", 1);
    expect(stale.status(), "a stale save must be refused, not applied").toBe(
      409,
    );
    const body = await stale.json();
    expect(body.conflict).toBe(true);
    // Both versions are kept: A's stays on the server untouched; B's stays with B (the client) and the user is asked.
    expect(await profileRowsWithMarker(t.schoolId, "fp08-v3")).not.toHaveLength(
      0,
    );
    expect(await profileRowsWithMarker(t.schoolId, "fp08-from-B")).toHaveLength(
      0,
    );
    // The refusal must tell B the REAL current version, so B can rebase and resubmit.
    expect(
      body.currentVersion,
      "409 must carry the actual stored version",
    ).toBe(3);
    const rebased = await saveDraft(
      request,
      t,
      "fp08-from-B",
      body.currentVersion,
    );
    expect(
      rebased.ok(),
      "resubmitting on the reported version must succeed",
    ).toBeTruthy();
  });

  test("FP-08 a session that loads the draft and saves on the version it was given is not told it conflicts with itself", async ({
    request,
  }) => {
    const t = newTenant("fp08b");
    expect((await saveDraft(request, t, "fp08b-v1")).ok()).toBeTruthy();
    expect((await saveDraft(request, t, "fp08b-v2", 1)).ok()).toBeTruthy();
    const loaded = await (
      await request.get(`${API}/api/school/draft`, { headers: bearer(t) })
    ).json();
    expect(loaded.payload, "the draft loads").toBeTruthy();
    const stored = await draftVersion(t.schoolId);
    expect(
      loaded.version,
      `the load must report the stored version (${stored}), or every save after a reload conflicts`,
    ).toBe(stored);
    const next = await request.put(`${API}/api/school/draft`, {
      headers: bearer(t),
      data: draftBody(t, "fp08b-v3", loaded.version),
    });
    expect(
      next.status(),
      "saving on the loaded version must not conflict",
    ).toBe(200);
  });
});
