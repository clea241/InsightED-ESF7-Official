# esf7_related_task payload verification: PASS

Database `esf7_local`, 2026-10-10T14:18:30.994Z. Rows at start 15589, at end 15589; legacy rows checked 15589; already new format 0.

| Check | Result |
|---|---|
| Row count stable and every row read | true |
| Every payload key and value held by a typed column or by extras | true (0 unaccounted keys in 0 rows) |
| raw_payload identical to the backed-up state | true |

Keys: 171479 = 92736 held by typed columns + 78743 held by extras + 0 unaccounted. Average per row: payload 282 B vs extras 93 B.

| Payload key | Typed column | Equal to column | Held in extras | Unaccounted |
|---|---|---|---|---|
| task | task_name | 15589 | 0 | 0 |
| hours | (no typed column) | 0 | 15589 | 0 |
| cadence | (no typed column) | 0 | 15589 | 0 |
| isLocked | (no typed column) | 0 | 15589 | 0 |
| frequency | frequency | 15100 | 489 | 0 |
| task_name | task_name | 15589 | 0 | 0 |
| isSdsApproved | (no typed column) | 0 | 15589 | 0 |
| designatedBySds | (no typed column) | 0 | 15589 | 0 |
| durationMinutes | duration_minutes | 15280 | 309 | 0 |
| duration_minutes | duration_minutes | 15589 | 0 | 0 |
| isDesignationSynced | is_designation_synced | 15589 | 0 | 0 |
