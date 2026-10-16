# Investigation method

Lessons from past incidents (data loss was the main harm). Follow them in order.

1. **Preserve evidence first.** Logs rotate and PM2 logs can be flushed. Copy before analysing. Tell users not to clear browser data and not to discard unsaved changes: drafts on their devices may be the only copy. Make sure a recent backup exists before any investigation that could lead to a fix.
2. **Investigate read-only first, then fix.** Diagnosis and fixing are separate steps with separate people and approvals. A "quick fix" during diagnosis destroys evidence and has caused further loss.
3. **Look at related symptoms together.** Wrong school id, a 403 loop, missing data and forced logouts have shared one cause before. Ask what else users reported, not only the headline symptom.
4. **Find other affected users with a query, not reports.** Reports only show who complained. Write or reuse a query that counts affected tenants and users, and export their internal ids.
5. **Do not promise "data is safe" until confirmed.** Say "we are checking". Confirmation means a query or backup comparison, not an absence of complaints.
6. **Avoid anchoring.** Write at least three hypotheses before testing any, including one unrelated to the first idea (infrastructure, client, data, change). Test each against the evidence and mark it supported, contradicted or inconclusive.
7. **Two independent pieces of evidence before "confirmed".** Independent means different kinds of source: a log sequence plus a database result, or a code path plus a reproduction. Two log lines from the same process are one piece. Otherwise write "probable" or "unknown".
8. **Separate cause, contributing factors and trigger.** Cause: the defect. Contributing: what allowed it to cause harm (no validation, no backup, shared Redis). Trigger: what set it off (a deploy, a secret rotation, a traffic spike).
9. **Staging is not proof for production.** A test passing on staging shows the fix works there. Re-measure on production with the same read-only queries after the fix.
10. **Measure before and after.** PM2 restart counts and the release marker must be identical at the start and end of the investigation; any change means something outside the skill touched production.
11. **Be blameless.** Refer to changes, commits and processes. Ask what made the mistake easy, not who made it.

## Order of work
Intake → guard → holding message → evidence → timeline → hypotheses → blast radius → data loss → root cause → local reproduction → reports → verification.

## Sizing the time window
Start one hour before the first report and end at now. Widen if the first error predates the window (the timeline's "first occurrence" table shows this).
