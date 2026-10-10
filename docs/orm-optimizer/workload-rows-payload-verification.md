# esf7_workload_rows payload verification: PASS

Database `esf7_local`, 2026-10-10T13:52:32.823Z. Row count at start 651940, at end 651940; legacy rows checked 651940; rows already in the new format (empty raw_payload) 0.

| Check | Result |
|---|---|
| Row count stable during the run and every row read | true |
| Every payload key and value held by a typed column or by extras | true (0 unaccounted keys in 0 rows) |
| The 8 keys every old payload carried are rebuilt exactly (id, gradeLevel, sectionId, sectionName, subject, startTime, endTime, days) | true (0 mismatches) |
| raw_payload identical to the backed-up state | true |

Keys: 8663841 total = 6990259 held by typed columns + 1673582 held by extras + 0 unaccounted. Rows whose whole key set is reproduced exactly: 1408 of 651940 (the rest differ only by snake_case alias copies, see note in the JSON). Average size: payload 350 B vs extras 55 B per row.

| Payload key | Typed column | Equal to column | Held in extras | Unaccounted |
|---|---|---|---|---|
| id | id | 651940 | 0 | 0 |
| days | days | 651940 | 0 | 0 |
| endTime | end_time | 651898 | 42 | 0 |
| subject | subject | 648473 | 3467 | 0 |
| sectionId | section_id | 627661 | 24279 | 0 |
| startTime | start_time | 651907 | 33 | 0 |
| gradeLevel | grade_level | 643094 | 8846 | 0 |
| sectionName | section_name | 651940 | 0 | 0 |
| grade_level | grade_level | 351857 | 269 | 0 |
| section_name | section_name | 351225 | 901 | 0 |
| section_id | section_id | 330722 | 21403 | 0 |
| task | (no typed column) | 0 | 351574 | 0 |
| rowType | (no typed column) | 0 | 351574 | 0 |
| minsPerDay | (no typed column) | 0 | 351574 | 0 |
| subject_name | subject | 351284 | 290 | 0 |
| term | term | 299201 | 0 | 0 |
| category | (no typed column) | 0 | 191070 | 0 |
| subjectName | subject | 124598 | 294 | 0 |
| daySchedule | (no typed column) | 0 | 123142 | 0 |
| durationMinutes | (no typed column) | 0 | 123142 | 0 |
| trackStrand | (no typed column) | 0 | 105916 | 0 |
| remediationSubject | remediation_subject | 109 | 10875 | 0 |
| end_time | end_time | 596 | 13 | 0 |
| school_id | school_id | 0 | 609 | 0 |
| start_time | start_time | 598 | 11 | 0 |
| school_year | school_year | 0 | 609 | 0 |
| personnel_id | personnel_id | 0 | 609 | 0 |
| schoolId | school_id | 0 | 608 | 0 |
| subjectId | subject_id | 608 | 0 | 0 |
| rawPayload | (no typed column) | 0 | 608 | 0 |
| schoolYear | school_year | 0 | 608 | 0 |
| subject_id | subject_id | 608 | 0 | 0 |
| personnelId | personnel_id | 0 | 608 | 0 |
| remediation_subject | remediation_subject | 0 | 608 | 0 |

No unaccounted keys.
