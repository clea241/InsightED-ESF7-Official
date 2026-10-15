import { test, expect } from "@playwright/test";
import {
  API,
  SCHOOL_YEAR,
  bearer,
  draftBody,
  saveDraft,
  twoTenants,
  profileRowsWithMarker,
} from "./helpers";

test.describe("cross-tenant access", () => {
  test("FP-11 tenant A's token cannot read or write tenant B's records, and a client-supplied tenant id is ignored", async ({
    request,
  }) => {
    const [a, b] = twoTenants();
    const markerB = `FP11-B-${Date.now()}`;
    const markerA = `FP11-A-${Date.now()}`;

    // Tenant B saves real data.
    const saved = await saveDraft(request, b, markerB);
    expect(saved.ok(), "tenant B's own save must work").toBeTruthy();
    expect(
      await profileRowsWithMarker(b.schoolId, markerB),
      "B's data must be committed",
    ).not.toHaveLength(0);

    // Reads: A asks for B through every channel a client controls (query, header, path).
    const attempts = [
      request.get(
        `${API}/api/school/draft?school_id=${b.schoolId}&schoolYear=${encodeURIComponent(SCHOOL_YEAR)}`,
        { headers: bearer(a) },
      ),
      request.get(`${API}/api/school/draft?schoolId=${b.schoolId}`, {
        headers: bearer(a),
      }),
      request.get(`${API}/api/school/draft`, {
        headers: { ...bearer(a), "x-school-id": b.schoolId },
      }),
      request.get(`${API}/api/schools/${b.schoolId}`, { headers: bearer(a) }),
      request.get(`${API}/api/reports/esf7/${b.schoolId}`, {
        headers: bearer(a),
      }),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(
        [403, 404],
        `${res.url()} must be refused, got ${res.status()}`,
      ).toContain(res.status());
      expect(
        await res.text(),
        "no tenant B data in the response",
      ).not.toContain(markerB);
    }
    // Even when the tenant id is only in a header, A must never receive B's data (the id is derived from the token).
    const viaHeader = await request.get(`${API}/api/school/draft`, {
      headers: { ...bearer(a), "x-school-id": b.schoolId },
    });
    expect(await viaHeader.text()).not.toContain(markerB);

    // Writes: A tries to overwrite B (explicit body id, query id, header id).
    const body = draftBody(b, markerA); // payload says it is school B
    const writes = [
      request.put(`${API}/api/school/draft`, {
        headers: bearer(a),
        data: body,
      }),
      request.put(`${API}/api/school/draft?school_id=${b.schoolId}`, {
        headers: bearer(a),
        data: draftBody(a, markerA),
      }),
      request.put(`${API}/api/school/draft`, {
        headers: { ...bearer(a), "x-school-id": b.schoolId },
        data: draftBody(a, markerA),
      }),
    ];
    for (const res of await Promise.all(writes)) {
      if (res.ok()) {
        // A write that is accepted must have landed on A, never on B.
        expect(
          await profileRowsWithMarker(b.schoolId, markerA),
          "tenant B must not receive A's data",
        ).toHaveLength(0);
      } else {
        expect([403, 404]).toContain(res.status());
      }
    }
    // Assertion in the database, not just the HTTP layer: B's data is intact and A's marker is not in B's rows.
    expect(
      await profileRowsWithMarker(b.schoolId, markerB),
      "tenant B's data must be unchanged",
    ).not.toHaveLength(0);
    expect(
      await profileRowsWithMarker(b.schoolId, markerA),
      "tenant B must not hold tenant A's marker",
    ).toHaveLength(0);
  });
});
