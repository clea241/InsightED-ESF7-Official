# esf7_requests payload verification: PASS

Database `esf7_local`, 2026-10-10T14:18:29.015Z. Rows at start 3208, at end 3208; legacy rows checked 3208; already new format 0.

| Check | Result |
|---|---|
| Row count stable and every row read | true |
| Every payload key and value held by a typed column or by extras | true (0 unaccounted keys in 0 rows) |
| raw_payload identical to the backed-up state | true |

Keys: 20171 = 15490 held by typed columns + 4681 held by extras + 0 unaccounted. Average per row: payload 214 B vs extras 53 B.

| Payload key | Typed column | Equal to column | Held in extras | Unaccounted |
|---|---|---|---|---|
| personnelId | personnel_id | 1781 | 1427 | 0 |
| requestType | request_type | 3208 | 0 | 0 |
| personnelName | personnel_name | 3196 | 12 | 0 |
| targetSchoolId | target_school_id | 3176 | 32 | 0 |
| requesterSchoolId | requester_school_id | 3192 | 2 | 0 |
| requesterId | (no typed column) | 0 | 1950 | 0 |
| allAssignedSchools | (no typed column) | 0 | 1258 | 0 |
| remarks | remarks | 937 | 0 | 0 |
