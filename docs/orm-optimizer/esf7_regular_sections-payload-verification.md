# esf7_regular_sections payload verification: PASS

Database `esf7_local`, 2026-10-10T14:18:35.646Z. Rows at start 139797, at end 139797; legacy rows checked 139797; already new format 0.

| Check | Result |
|---|---|
| Row count stable and every row read | true |
| Every payload key and value held by a typed column or by extras | true (0 unaccounted keys in 0 rows) |
| raw_payload identical to the backed-up state | true |

Keys: 1663154 = 1286336 held by typed columns + 376818 held by extras + 0 unaccounted. Average per row: payload 318 B vs extras 62 B.

| Payload key | Typed column | Equal to column | Held in extras | Unaccounted |
|---|---|---|---|---|
| id | id | 139203 | 594 | 0 |
| gradeLevel | grade_level | 139797 | 0 | 0 |
| sectionName | section_name | 130642 | 9155 | 0 |
| sectionType | section_type | 132939 | 6858 | 0 |
| grade_level | grade_level | 120217 | 210 | 0 |
| advisorId | adviser_id | 96616 | 3134 | 0 |
| numberOfLearners | number_of_learners | 75736 | 2021 | 0 |
| femaleLearners | female_learners | 70248 | 6919 | 0 |
| maleLearners | male_learners | 70088 | 7077 | 0 |
| adviserRemarks | (no typed column) | 0 | 75740 | 0 |
| adviser_remarks | (no typed column) | 0 | 75740 | 0 |
| hgpMinutes | (no typed column) | 0 | 71730 | 0 |
| advisoryMinutes | (no typed column) | 0 | 71730 | 0 |
| section_name | section_name | 57089 | 11011 | 0 |
| section_type | section_type | 67942 | 158 | 0 |
| sizeStatus | size_status | 63739 | 0 | 0 |
| size_status | size_status | 63739 | 0 | 0 |
| adviserId | adviser_id | 29323 | 2941 | 0 |
| adviser_id | adviser_id | 23955 | 2859 | 0 |
| tutorId | (no typed column) | 0 | 4821 | 0 |
| aralBasis | (no typed column) | 0 | 4821 | 0 |
| aralToolKey | (no typed column) | 0 | 4821 | 0 |
| aralLearners | (no typed column) | 0 | 4821 | 0 |
| aralProfileLevel | (no typed column) | 0 | 4821 | 0 |
| aralGrade | (no typed column) | 0 | 4055 | 0 |
| schoolId | school_id | 2519 | 0 | 0 |
| schoolYear | school_year | 2519 | 0 | 0 |
| aralTool | (no typed column) | 0 | 766 | 0 |
| school_id | school_id | 5 | 0 | 0 |
| updatedAt | (no typed column) | 0 | 5 | 0 |
| advisor_id | (no typed column) | 0 | 5 | 0 |
| rawPayload | (no typed column) | 0 | 5 | 0 |
| school_year | school_year | 5 | 0 | 0 |
| male_learners | male_learners | 5 | 0 | 0 |
| female_learners | female_learners | 5 | 0 | 0 |
| number_of_learners | number_of_learners | 5 | 0 | 0 |
