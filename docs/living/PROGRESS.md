# PROGRESS

## 2026-09-09
- Optimized `/api/dashboard/stats` (Executive Dashboard) load time by reusing a
  singleton `pg.Pool` for the cross-DB `insightEd` fallback queries instead of
  creating/tearing one down per request, and parallelizing the two
  independent fallback queries. See `DEVIATIONS.md` (2026-09-09) for two
  related issues found but left open pending a product decision: an
  unfiltered cross-school query in the qualifications fetch, and whether the
  cross-DB fallback path should still run live on every request.
- Weekly Schedule Editor: grade-band filtering (via `getSubjectsForGrade`
  against `MASTER_SUBJECTS_CATALOG`) now applies to both places a
  subject+section pairing gets picked, closing the gap where the MATATAG
  policy warning was the only thing catching a mismatch, and only after
  save:
  - Block Inspector's "Class Section & Grade Level" dropdown
    (`client/src/pages/Workload.jsx` ~line 4893).
  - Docked sidebar's "Organized Classes at This School" list used by the
    drag-first flow (subject picked from "Subjects Taught" first, section
    dragged after) — was reported by the user as still showing all
    sections after the Block Inspector fix, since it's a separate list
    with its own render path (~line 4666).
  Next: consider applying the same filter to the other section/subject
  pickers in the workload table's inline list/grid row editors (~lines
  9445, 9847) if the user wants consistency there too — out of scope for
  this fix since it wasn't part of either reported flow.
