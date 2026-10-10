# esf7_personnel_allowances payload verification: PASS

Database `esf7_local`, 2026-10-10T14:18:28.538Z. Rows at start 63980, at end 63980; legacy rows checked 37682; already new format 26298.

| Check | Result |
|---|---|
| Row count stable and every row read | true |
| Every payload key and value held by a typed column or by extras | true (0 unaccounted keys in 0 rows) |
| raw_payload identical to the backed-up state | true |

Keys: 150728 = 75364 held by typed columns + 75364 held by extras + 0 unaccounted. Average per row: payload 101 B vs extras 43 B.

| Payload key | Typed column | Equal to column | Held in extras | Unaccounted |
|---|---|---|---|---|
| isGranted | (no typed column) | 0 | 37682 | 0 |
| schoolYear | school_year | 37682 | 0 | 0 |
| personnelId | personnel_id | 37682 | 0 | 0 |
| allowanceKey | (no typed column) | 0 | 37682 | 0 |
