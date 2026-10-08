# BUSINESS LOGIC

## Draft saving rules (2026-10-08)
- "Saved" is shown only after the server confirmed the database write.
- A save based on an older server version is rejected (409) and never overwrites the newer copy; the user chooses, and both versions are kept.
- Logout is blocked until pending changes are saved (or the user explicitly chooses to keep a local copy).
- Cloud auto-save never runs while the initial load is failed/partial; an empty roster never replaces a populated one.

## Access control (2026-10-08)
- Every API request except health, login, room-profiling (public QR/passcode flow) and salary-matrix needs a valid login token. A request may only name the user's own school. Exceptions: Admin / Super Admin (any school); School Division Office (schools in the same division) and Regional Division Office (same region), checked on the server; denied when the lookup fails.
- Room Profiling's roster endpoints stay public (teachers use them without logging in); the general personnel and autofill endpoints they used to fall back to now require login.
