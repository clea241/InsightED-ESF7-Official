# Rules to enforce server-side

Read at pipeline step 5. Authority: `docs/living/BUSINESS_LOGIC.md` (re-read it; it may have grown). For each rule, find the server check (file:line) or report "client-only".

- Workload save is atomic per teacher (one transaction) and idempotent (a retry replaces the term rows, never adds). The saved term is replaced even when its last block was removed. 200 is sent only after COMMIT.
- A teaching teacher with no assigned grade levels cannot have teaching blocks saved: 422 `NO_CLASSES_ASSIGNED`. Admin/relieving blocks and non-teaching personnel are exempt.
- Draft save is version-checked: a save based on an older version is rejected with 409 and never overwrites the newer copy.
- Access control: every `/api` route except health, auth, room-profiling and salary-matrix needs a verified JWT. A request may only name the user's own school (admin and division/region office exceptions are checked on the server).
- Class sections: stable key = row id, then school + canonical school year ("SY 26-27") + grade level + section name. Sections live in the normalized tables; a draft is only an unsaved overlay.
- Personnel are written before sections so `adviser_id` FKs resolve.
- Schedule conflicts and overload: see `server/utils/scheduleValidator.js`; confirm the save path calls it instead of trusting the client.

Do not add DepEd/MATATAG rules that the user has not documented.
