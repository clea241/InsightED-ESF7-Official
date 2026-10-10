# esf7_school_profile payload verification: PASS

Database `esf7_local`, 2026-10-10T14:18:30.052Z. Rows at start 14804, at end 14804; legacy rows checked 14804; already new format 0.

| Check | Result |
|---|---|
| Row count stable and every row read | true |
| Every payload key and value held by a typed column or by extras | true (0 unaccounted keys in 0 rows) |
| raw_payload identical to the backed-up state | true |

Keys: 426831 = 259610 held by typed columns + 167221 held by extras + 0 unaccounted. Average per row: payload 726 B vs extras 287 B.

| Payload key | Typed column | Equal to column | Held in extras | Unaccounted |
|---|---|---|---|---|
| region | (no typed column) | 0 | 14804 | 0 |
| district | (no typed column) | 0 | 14804 | 0 |
| division | (no typed column) | 0 | 14804 | 0 |
| schoolId | school_id | 14694 | 110 | 0 |
| schoolName | (no typed column) | 0 | 14804 | 0 |
| schoolYear | school_year | 14804 | 0 | 0 |
| numberOfShifts | (no typed column) | 0 | 14804 | 0 |
| curricularOffering | (no typed column) | 0 | 14804 | 0 |
| hasJhsInclusive | has_jhs_inclusive | 14566 | 0 | 0 |
| hasShsInclusive | has_shs_inclusive | 14566 | 0 | 0 |
| specialPrograms | (no typed column) | 0 | 14566 | 0 |
| hasElemInclusive | has_elem_inclusive | 14566 | 0 | 0 |
| inclusivePrograms | inclusive_programs | 14566 | 0 | 0 |
| jhsSpecialPrograms | jhs_special_programs | 14566 | 0 | 0 |
| shsCurriculumModel | shs_curriculum_model | 13037 | 1529 | 0 |
| jhsInclusivePrograms | jhs_inclusive_programs | 14566 | 0 | 0 |
| shsInclusivePrograms | shs_inclusive_programs | 14566 | 0 | 0 |
| elemInclusivePrograms | elem_inclusive_programs | 14566 | 0 | 0 |
| hasJhsSpecialPrograms | has_jhs_special_programs | 14566 | 0 | 0 |
| hasElemSpecialPrograms | has_elem_special_programs | 14566 | 0 | 0 |
| hasAls | has_als | 14283 | 0 | 0 |
| hasIped | has_iped | 14283 | 0 | 0 |
| hasSned | has_sned | 14283 | 0 | 0 |
| certifiedAt | (no typed column) | 0 | 14283 | 0 |
| certifiedBy | (no typed column) | 0 | 14283 | 0 |
| hasMadrasah | has_madrasah | 14283 | 0 | 0 |
| subjectsConfig | (no typed column) | 0 | 14283 | 0 |
| certifiedSignature | (no typed column) | 0 | 14283 | 0 |
| elemSpecialPrograms | elem_special_programs | 14283 | 0 | 0 |
| elemSpecialProgram | (no typed column) | 0 | 4580 | 0 |
| raw_payload | (no typed column) | 0 | 240 | 0 |
| designations_na | (no typed column) | 0 | 240 | 0 |
