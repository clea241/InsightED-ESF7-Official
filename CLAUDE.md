# Project Instructions

## Scope of this file vs. docs/

**This file (`CLAUDE.md`) is a global standard** — the process rules,
workflow, and protections in it (database protection, git hygiene, token
efficiency, communication style, scope discipline, the frozen/AI-maintained
distinction, folder architecture *principles*) are meant to be reused
across every app you build. It's safe to copy this file into a new
project as-is.

**Everything in `docs/` is project-specific** — describes *this specific
app*: its purpose, its users, its actual folder layout, its actual
component library, its actual data flows. Do not treat any file in
`docs/` as a template to copy into another project. If asked to set up
a new project using this one as a reference, copy this `CLAUDE.md` (and
its Antigravity counterpart) as the starting standard, but generate a
fresh `docs/` folder for the new project rather than duplicating this
one's contents.

The rule is location-based, so it's easy to apply without memorizing a
list: **everything inside `docs/` is project-specific; everything
outside `docs/` (project root or `.agent/`) is global.**

**Global (copy into every new project):** `CLAUDE.md`,
`.agent/rules/antigravity-brain.md`, `.agent/workflows/sync-specs.md`.

**Project-specific, organized into three subfolders inside `docs/`:**

- `docs/product/` — `PRODUCT_OVERVIEW.md`, `ARCHITECTURE.md`
- `docs/ux/` — `DESIGN_CONTRACT.md`, `UI_DESIGN_SYSTEM.md`,
  `COMPONENT_LIBRARY.md`, `CHART_PATTERNS.md`, `INTERACTION_PATTERNS.md`,
  `LAYOUT_STRUCTURE.md`, `TABLE_BEHAVIORS.md`, `MODAL_PATTERNS.md`,
  `SETTINGS_PATTERNS.md`, `HEADER_FOOTER_PATTERNS.md`, `NAVIGATION_FLOW.md`
- `docs/living/` — `BUSINESS_LOGIC.md`, `DATA_FLOW_MAP.md`,
  `DECISIONS.md`, `CHANGELOG.md`, `PROGRESS.md`, `DEVIATIONS.md`

`docs/product/` and `docs/ux/` are frozen. `docs/living/` is
AI-maintained. See "Frozen standards vs. AI-maintained docs" below —
note it now also maps cleanly onto the subfolders themselves.

Read the relevant docs before starting work. Do not duplicate their
content here — if something needs to change, update the doc, not this
file.

## Self-protection: this file is frozen too

- This file (`CLAUDE.md` / `antigravity-brain.md`) is frozen with respect to itself — do not edit it unless the user explicitly instructs a change to this specific file.
- This applies even if a rule seems outdated, unclear, contradictory, or improvable based on something learned during the session. Flag the suggestion to the user in conversation instead of editing directly.
- The only edits allowed without a fresh explicit instruction each time are:
  1. Cross-tool sync — mirroring a change the user just approved in one brain file over to its counterpart, in the same session.
  2. Project initialization — creating this file's counterpart if it doesn't exist yet in a new repo.
- Any other change to this file requires the user to explicitly say so in that moment — a general instruction like "make this project better" or "clean things up" does not count as permission to edit this file.

## Cross-tool compatibility

This project may be worked on with either Claude Code or Google
Antigravity interchangeably. At the start of a session, check whether
the counterpart file exists:

- If `CLAUDE.md` exists at the project root but `.agent/rules/antigravity-brain.md`
  does not, create the `.agent/rules/` folder if needed and create
  `antigravity-brain.md` with the same process rules as `CLAUDE.md`.
- If `.agent/rules/antigravity-brain.md` exists but `CLAUDE.md` does not,
  create `CLAUDE.md` at the project root with the same process rules.

Keep the two files equivalent in content going forward — if the user
asks to change a rule in one, apply the same change to the other in the
same session so switching tools never produces different behavior.
Frozen vs. AI-maintained file distinctions apply identically regardless
of which tool is in use.

## Project initialization

At the start of a session, check whether `docs/` exists in this project.

**If `docs/` does not exist at all** (a fresh repo where only this brain
file has been imported), treat this as first-time setup:

1. Create the folder structure: `docs/product/`, `docs/ux/`,
   `docs/living/`.
2. Generate a template file for each item listed in "Project-specific"
   above, using its stated purpose (from that list) as the file's intro.
   Each template should have clear section headers and bracketed
   placeholders (`[fill in: ...]`) rather than invented content — do not
   guess at this app's actual purpose, colors, component names, or
   folder layout.
3. For `docs/product/PRODUCT_OVERVIEW.md` specifically, ask the user for
   the essentials (purpose, target users, core objectives) rather than
   leaving it entirely blank — this file is too foundational to sit
   empty.
4. For `docs/ux/` spec files, leave them templated and empty until
   either the user fills them in, or provides a finished app to extract
   them from (see the extraction workflow: read the source app's code
   section by section and populate the relevant template rather than
   generating from scratch).
5. For `docs/living/` files, create them empty with just a header —
   they'll populate naturally as work happens.
6. Tell the user what was created and what still needs their input
   before continuing with feature work.

**If `docs/` already exists** (returning to an established project),
skip initialization and proceed normally — read the existing docs per
the rest of this file.

## Frozen standards vs. AI-maintained docs

Files in this project fall into two categories, which now map directly
onto the `docs/` subfolders. Know which one you're touching before
editing anything in `docs/`.

**Frozen — read-only unless the user explicitly commands a change:**
everything in `docs/product/` and `docs/ux/` — `PRODUCT_OVERVIEW.md`,
`ARCHITECTURE.md`, `DESIGN_CONTRACT.md`, and every UI/UX spec file.
These represent the user's standards — do not edit, soften, "sync," or
reinterpret them based on what the code currently does. If the code and
a frozen file disagree, the file wins; log the mismatch in
`docs/living/DEVIATIONS.md` instead of changing the file. Only edit a
frozen file when the user gives an explicit instruction to change that
specific file.

**AI-maintained — update proactively as part of normal work:**
everything in `docs/living/` — `BUSINESS_LOGIC.md`, `DATA_FLOW_MAP.md`,
`DECISIONS.md`, `CHANGELOG.md`, `PROGRESS.md`, `DEVIATIONS.md`. These
are expected to reflect current reality and should be kept current
without waiting for a specific instruction each time.

When a mismatch between the app and a frozen spec is found, or an
improvement to a frozen spec seems worth making, do not edit the frozen
file directly. Instead:

1. Log it in `docs/living/DEVIATIONS.md` (mismatch) or note it in
   `docs/living/CHANGELOG.md` / flag it in conversation (proposed
   improvement).
2. Present the proposed change to the user and describe what would need
   to change in the frozen file.
3. Only make the edit to the frozen file after the user explicitly
   approves it for that file.

## Binding UI/UX contract

This project's look, feel, and interaction behavior must match the specs
in `docs/ux/`. Start with `docs/ux/DESIGN_CONTRACT.md` — it indexes
everything else. These are **binding constraints, not suggestions**. Do
not freelance on colors, spacing, component behavior, or interaction
patterns if a spec file already defines them.

Business logic, data models, and API design are NOT covered by these
specs and are defined separately per feature/task.

## Product context

`docs/product/PRODUCT_OVERVIEW.md` defines this app's purpose, target
users, objectives, and success targets — separate from the UI/UX
contract. Reference it for anything touching scope, audience, or intent.

**If `docs/product/PRODUCT_OVERVIEW.md` does not exist, stop and alert
the user that it's missing before doing feature work that depends on
purpose, audience, or scope.** UI/UX-only tasks (matching a spec's
visual or interaction pattern) can proceed without it, but flag the gap
regardless.

## Required workflow per task

1. Identify which spec file(s) in `docs/ux/` apply to the feature being
   built (e.g., building a table → read `TABLE_BEHAVIORS.md` and
   `COMPONENT_LIBRARY.md`). Don't rely on having read them earlier in a
   long session — re-check.
2. Build to match the spec exactly, including literal values (hex codes,
   px, timing) where given.
3. After building, self-review against the spec and state explicitly
   whether it matches or deviates.
4. If a pattern can't be matched exactly (framework/library limitation),
   log it in `docs/living/DEVIATIONS.md` with: what was expected, what
   was built instead, and why. Do not silently approximate.

## What "done" looks like for a UI task

A feature is not complete until it has been checked against the relevant
spec file(s) and any deviation has been logged, not just built and left
unverified.

## Folder architecture

`docs/product/ARCHITECTURE.md` defines where code lives: `apps/frontend/`
and `apps/backend/` for code specific to each side, `shared/` for
anything used by both (types, constants, validation logic, utilities) so
it's never duplicated. Read it before creating new files, and place new
code according to it rather than inventing a parallel structure.

`ARCHITECTURE.md` is a frozen file (see "Frozen standards vs.
AI-maintained docs" above) — it is the user's standard, not something to
adjust based on what's convenient for a given feature. If a new kind of
file doesn't clearly fit an existing location, ask the user where it
should go rather than guessing, and only add it to `ARCHITECTURE.md`
once they've confirmed — don't edit the file first and inform them
after.

## Catching contradictions

With access to `docs/product/PRODUCT_OVERVIEW.md`,
`docs/living/BUSINESS_LOGIC.md`, `docs/living/DECISIONS.md`, and the
`docs/ux/` specs, cross-reference new requests against what's already
documented. If a request conflicts with something already established —
contradicts a stated objective, reverses a logged decision, conflicts
with existing business logic, or is ambiguous about which of two
documented behaviors should apply — stop and ask the user for
clarification before proceeding. Do not silently pick one
interpretation, and do not silently update the docs to match the new
request without flagging the conflict first.

## Data flow map

Maintain `docs/living/DATA_FLOW_MAP.md`: a reference showing where data
actually gets saved in the database, and which specific user action
(button, form, screen) triggers each save. Update it whenever a feature
is built or changed that reads or writes data. Use it, alongside
`docs/product/PRODUCT_OVERVIEW.md` and `docs/living/BUSINESS_LOGIC.md`,
as a reference before making changes that touch data — helps catch
cases where a change would affect a save path that isn't obvious from
the current screen alone.

## Communication style

Assume the person you're talking to may not be technical. Explain things
in plain language by default — describe what something does and why it
matters before (or instead of) naming the technical concept. Use
technical terms only when necessary, and briefly explain them the first
time they come up rather than assuming familiarity. Favor concrete,
everyday analogies over jargon-heavy explanations. This applies to how
you talk through decisions, flag issues, and explain trade-offs — not
just to comments or docs.

## Database protection

The database must be protected at all times. These rules override token
efficiency, speed, or convenience — never shortcut around them.

- **Never truncate, drop, or delete real data** — no `TRUNCATE`, no bulk
  `DELETE`, no dropping tables/columns containing live data — without
  explicit, unambiguous confirmation from the user for that specific
  action. "Clean up the database" or "reset this" is not sufficient
  confirmation on its own — ask what exactly should be removed and confirm
  before executing.
- **Seed/mock data must never persist in production.** Seeding scripts
  are for local/dev/test environments only. Any seed step must check the
  environment and refuse to run if it detects production, and seed data
  must never be part of a production deployment or migration.
- **Migrations that alter or remove data must be reviewed before running**
  — summarize what the migration will do (especially destructive parts:
  dropped columns, changed types, removed constraints) and get
  confirmation before executing against any environment with real data.
- **No direct writes to production data** without going through
  reviewed, version-controlled migrations or application code — no ad hoc
  one-off scripts run straight against prod.
- **Back up before risky operations.** Before any migration or bulk
  operation that could be destructive, recommend (or take, if tooling
  allows) a backup/snapshot first.
- **Environment awareness is mandatory** — always confirm which
  environment (dev/staging/prod) an operation targets before running
  anything destructive or seed-related. Never assume based on convenience.
- **Default to the safest interpretation.** If a request is ambiguous
  about scope (e.g., "clear the users table") assume it applies to a
  non-production environment and ask before doing anything irreversible
  in production.

## Token efficiency

Be deliberate about context usage to avoid burning through quota
unnecessarily:

- Don't re-read files already read earlier in the same session unless
  they may have changed. Track what's already in context instead of
  re-fetching it "to be safe."
- When checking a spec file, read only the section relevant to the
  current task where the file structure allows it, rather than the
  whole file, for large spec files.
- Prefer targeted edits (diffs/patches) over regenerating entire files
  when only part of a file needs to change.
- Don't paste full file contents back in responses/explanations when a
  summary or a pointer to the file/line is sufficient.
- Batch related questions or small tasks into a single exchange rather
  than one exchange per micro-question, where doing so doesn't hurt
  quality.
- For large or multi-file features, work in stages (plan → confirm →
  implement) rather than generating large speculative amounts of code
  upfront that may need to be discarded or redone.
- Keep `docs/living/PROGRESS.md` and `docs/living/CHANGELOG.md` concise
  — enough to restore context quickly, not a full narrative — since
  these get re-read often.
- When unsure whether more context is needed, ask rather than
  defensively loading extra files "just in case."

**Do not cut corners to save tokens.** The code review pass, definition
of done checklist, error handling, and spec/business-logic verification
are never skipped or shortened to conserve quota — a bug shipped to save
tokens costs more (in tokens and time) to fix later than doing it right
the first time. If a task is large, split it into smaller well-reviewed
steps rather than rushing it through in one under-checked pass.

## Architecture decisions

Maintain `docs/living/DECISIONS.md` to log non-obvious technical choices
as they're made — e.g., "chose polling over websockets because X,"
"picked library Y over Z due to bundle size." Each entry: what was
decided, why, and what alternatives were considered. This is separate
from `docs/living/BUSINESS_LOGIC.md` (what the app does) and the
`docs/ux/` specs (how it looks/behaves) — this file is the reasoning
trail, so later sessions don't silently reverse a deliberate choice or
re-debate settled decisions.

## Session continuity

Maintain `docs/living/PROGRESS.md` as a running handoff note. At the end
of each work session (or before a major context switch), update it
with: what was just completed, what's half-finished, and what to pick up
next. Read it at the start of a new session before asking what to work
on.

Maintain `docs/living/CHANGELOG.md` alongside it — one entry per
feature/session, written for quick scanning, so past work doesn't need
to be re-discovered by reading the codebase.

## Code review pass

Building to spec is not the same as reviewing for quality. After a
feature is built and matches its spec, do a separate review pass over
the diff for: security issues, unhandled errors, obvious performance
problems, and hardcoded values that should be config. Specs describe
intended behavior — they don't catch implementation quality.

## Definition of done

Before marking a feature complete, confirm all of the following:

- Matches the relevant spec file(s) in `docs/ux/`
- `docs/living/BUSINESS_LOGIC.md` updated if new rules/permissions/calculations were introduced
- Any unmatched pattern logged in `docs/living/DEVIATIONS.md`
- Basic error states handled (not just the happy path)
- No hardcoded values that should be config
- `docs/living/CHANGELOG.md` and `docs/living/PROGRESS.md` updated

## Scope discipline

Only implement what was explicitly asked for. Do not make unrelated
"improvements," refactors, or stylistic changes in the same pass unless
requested. If an improvement is noticed, suggest it separately and wait
for confirmation rather than including it unprompted.

## Git hygiene

- One feature or fix per commit/PR — avoid bundling unrelated changes.
- Write commit messages that describe what changed and why, not just
  "update files."
- Never commit directly to main/master — use a feature branch.
- Recommend a commit/checkpoint before starting a significant AI-driven
  change (not just after), so there's a clean revert point if the
  change goes wrong.

## Business logic generation and upkeep

On first working on this project, read `docs/ux/DESIGN_CONTRACT.md` and
`docs/product/PRODUCT_OVERVIEW.md` in full, then generate a base
`docs/living/BUSINESS_LOGIC.md` from what they imply: validation rules,
permissions, calculations, and edge cases that follow from the stated
purpose, users, objectives, and features. If `BUSINESS_LOGIC.md` already
exists, do not overwrite it — read it first and treat it as current
state.

As the project progresses, keep `docs/living/BUSINESS_LOGIC.md` up to
date in the same session as any change that affects it:

- New feature work that introduces a rule, permission, or calculation →
  add it.
- A change to `docs/product/PRODUCT_OVERVIEW.md` (objectives, users,
  scope) that affects existing logic → update the corresponding section.
- A logic change made directly in code without a prior spec → reflect it
  back into the file so the doc never trails the implementation.

Treat `BUSINESS_LOGIC.md` as a living document, not a one-time
generation.

## Keeping specs in sync

UI/UX spec files in `docs/ux/` are frozen (see "Frozen standards vs.
AI-maintained docs" above). Do not edit them automatically when a UI/UX
change is made in code. Instead:

- Log the mismatch in `docs/living/DEVIATIONS.md`.
- Note the change in `docs/living/CHANGELOG.md` as normal.
- Tell the user the spec is now out of sync and ask whether to update
  the spec file to match the new implementation.
- Only edit the spec file itself once the user explicitly approves it.

This applies even when the change was requested by the user in the same
conversation — a request to change how something looks/behaves in the
app is not automatically permission to rewrite the spec file; confirm
which one (or both) they mean if it's unclear.
