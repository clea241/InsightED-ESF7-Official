# esf7_admin_task payload verification: PASS

Database `esf7_local`, 2026-10-10T14:18:31.910Z. Rows at start 15313, at end 15313; legacy rows checked 15313; already new format 0.

| Check | Result |
|---|---|
| Row count stable and every row read | true |
| Every payload key and value held by a typed column or by extras | true (0 unaccounted keys in 0 rows) |
| raw_payload identical to the backed-up state | true |

Keys: 80973 = 65660 held by typed columns + 15313 held by extras + 0 unaccounted. Average per row: payload 136 B vs extras 17 B.

| Payload key | Typed column | Equal to column | Held in extras | Unaccounted |
|---|---|---|---|---|
| task | task_name | 15313 | 0 | 0 |
| days | days | 11670 | 0 | 0 |
| term | term | 11670 | 0 | 0 |
| endTime | end_time | 11670 | 0 | 0 |
| startTime | start_time | 11670 | 0 | 0 |
| hours | (no typed column) | 0 | 11669 | 0 |
| id | id | 1 | 3643 | 0 |
| dates | dates | 3644 | 0 | 0 |
| status | status | 1 | 0 | 0 |
| endDate | end_date | 1 | 0 | 0 |
| category | task_category | 1 | 0 | 0 |
| end_date | end_date | 1 | 0 | 0 |
| end_time | end_time | 1 | 0 | 0 |
| schoolId | school_id | 1 | 0 | 0 |
| taskName | task_name | 1 | 0 | 0 |
| school_id | school_id | 1 | 0 | 0 |
| startDate | start_date | 1 | 0 | 0 |
| task_name | task_name | 1 | 0 | 0 |
| rawPayload | (no typed column) | 0 | 1 | 0 |
| schoolYear | school_year | 1 | 0 | 0 |
| start_date | start_date | 1 | 0 | 0 |
| start_time | start_time | 1 | 0 | 0 |
| personnelId | personnel_id | 1 | 0 | 0 |
| school_year | school_year | 1 | 0 | 0 |
| personnel_id | personnel_id | 1 | 0 | 0 |
| taskCategory | task_category | 1 | 0 | 0 |
| termTotalHours | term_total_hours | 1 | 0 | 0 |
| durationMinutes | duration_minutes | 1 | 0 | 0 |
| duration_minutes | duration_minutes | 1 | 0 | 0 |
| isDesignationSynced | is_designation_synced | 1 | 0 | 0 |
| is_designation_synced | is_designation_synced | 1 | 0 | 0 |
