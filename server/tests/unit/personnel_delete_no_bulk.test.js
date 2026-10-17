import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

// Slice a function body out of a source file by its start marker.
const slice = (src, start, len = 7000) => {
  const i = src.indexOf(start);
  expect(i).toBeGreaterThan(-1);
  return src.slice(i, i + len);
};

describe("personnel delete never triggers the roster bulk save", () => {
  const ctx = read("../../../client/src/context/AppContext.jsx");
  const del = slice(ctx, "const deletePersonnel = async (id)");
  const body = del.slice(0, del.indexOf("const resolveBorrowedPersonnel"));

  it("deletePersonnel does not call the bulk save path", () => {
    expect(body).not.toMatch(/saveBulkPersonnel|personnel\/bulk/);
  });

  it("deletePersonnel sends exactly one DELETE request", () => {
    expect(body.match(/api\.deletePersonnel\(/g)).toHaveLength(1);
  });

  it("Roster delete handler resyncs the baseline instead of saving", () => {
    const roster = read("../../../client/src/pages/Roster.jsx");
    const h = slice(roster, "const handleGulpComplete", 3500);
    expect(h).toMatch(/syncCleanRosterSnapshot/);
    expect(h).not.toMatch(/saveBulkPersonnel|runRosterSave|executeRosterSave/);
  });

  it("server delete runs its cascade in one transaction and releases the client", () => {
    const srv = read("../../controllers/personnel/roster.js");
    const h = slice(srv, 'router.delete("/:id"', 9000);
    expect(h).toMatch(/db.getClient()/);
    expect(h).toMatch(/"BEGIN"/);
    expect(h).toMatch(/"COMMIT"/);
    expect(h).toMatch(/client\.release\(\)/);
  });
});

describe("delete is not optimistic", () => {
  const ctx = read("../../../client/src/context/AppContext.jsx");
  const del = slice(ctx, "const deletePersonnel = async (id)");
  const body = del.slice(0, del.indexOf("const resolveBorrowedPersonnel"));

  it("the server call happens before any local state change", () => {
    const apiAt = body.indexOf("api.deletePersonnel(");
    const stateAt = body.indexOf("setPersonnel(");
    expect(apiAt).toBeGreaterThan(-1);
    expect(stateAt).toBeGreaterThan(apiAt);
  });

  it("failures propagate to the caller instead of being swallowed", () => {
    expect(body).not.toMatch(/Backend deletePersonnel notice/);
    expect(body).not.toMatch(/showToast\("Personnel deleted successfully/);
  });

  it("Roster shows the blocking alert and keeps the row until confirmed", () => {
    const roster = read("../../../client/src/pages/Roster.jsx");
    const h = slice(roster, "const handleGulpComplete", 3500);
    expect(h).toMatch(/runSaveFlow\(/);
    expect(h).toMatch(/await deletePersonnel\(pId\)/);
    expect(h).toMatch(/if \(flow\.ok\)/);
    expect(h).toMatch(/setGulpDeleteState\(null\)/);
  });
});
