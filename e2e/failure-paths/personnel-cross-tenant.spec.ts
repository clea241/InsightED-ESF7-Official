import { test, expect } from "@playwright/test";
import { API, bearer, dbQuery, person, saveDraft, twoTenants } from "./helpers";

// Added for the personnel-by-id routes (PUT/DELETE /api/personnel/:id): the id in the URL belongs to another school.
test.describe("cross-tenant personnel by id", () => {
  test("FP-11 tenant A cannot update or delete tenant B's personnel record by id", async ({
    request,
  }) => {
    const [a, b] = twoTenants();
    const victim = person(b, 1);
    expect(
      (
        await saveDraft(request, b, "fp11p-b", undefined, {
          personnel: [victim],
        })
      ).ok(),
    ).toBeTruthy();
    const row = async () =>
      (
        await dbQuery(
          "SELECT id, first_name, last_name FROM esf7_personnel_profile WHERE id = $1",
          [victim.id],
        )
      )[0];
    // Rows of every child table that hangs off this person (employment, education, workload, ...), counted per table.
    const childCounts = async () => {
      const tables = await dbQuery(
        "SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'personnel_id' ORDER BY table_name",
      );
      const out: Record<string, number> = {};
      for (const { table_name } of tables) {
        out[table_name] = (
          await dbQuery(
            `SELECT count(*)::int AS n FROM "${table_name}" WHERE personnel_id = $1`,
            [victim.id],
          )
        )[0].n;
      }
      return out;
    };
    const childrenBefore = await childCounts();
    const before = await row();
    expect(before, "tenant B's record exists").toBeTruthy();

    const del = await request.delete(`${API}/api/personnel/${victim.id}`, {
      headers: bearer(a),
    });
    expect
      .soft(
        [403, 404],
        `A deleting B's record must be refused (got ${del.status()})`,
      )
      .toContain(del.status());
    expect(
      await row(),
      "B's record must still exist after A's delete",
    ).toBeTruthy();
    // The delete route also writes a tombstone for the record's school: B's roster must still list the person and B must have no tombstone.
    const roster =
      (
        await (
          await request.get(`${API}/api/personnel`, { headers: bearer(b) })
        ).json()
      ).data || [];
    expect(
      roster.map((p: { id: string }) => p.id),
      "B's roster must still list the record after A's delete",
    ).toContain(victim.id);
    const tombstones = await dbQuery(
      "SELECT id FROM esf7_deleted_personnel WHERE school_id::text = $1",
      [b.schoolId],
    );
    expect(
      tombstones,
      "A's delete must not leave a deletion tombstone on B's school",
    ).toHaveLength(0);
    expect(
      await childCounts(),
      "A's delete must not remove B's employment, education or workload rows",
    ).toEqual(childrenBefore);

    const put = await request.put(`${API}/api/personnel/${victim.id}`, {
      headers: bearer(a),
      data: {
        ...victim,
        firstName: "Hijacked",
        lastName: "ByTenantA",
        schoolId: a.schoolId,
      },
    });
    expect
      .soft(
        [403, 404],
        `A updating B's record must be refused (got ${put.status()})`,
      )
      .toContain(put.status());
    const after = await row();
    expect(after, "B's record must be unchanged").toEqual(before);

    // The owner can still delete it (the guard is about ownership, not a blanket refusal).
    const own = await request.delete(`${API}/api/personnel/${victim.id}`, {
      headers: bearer(b),
    });
    expect(
      own.ok(),
      `the owner's own delete works (got ${own.status()})`,
    ).toBeTruthy();
  });
});
