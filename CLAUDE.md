# Project Instructions

## Scope

This file is a **global standard** — reuse it as-is in every project.
Everything in `docs/` is **project-specific** — never copy `docs/`
content into another project; generate it fresh each time.

`docs/` is split into three subfolders:
- `docs/product/` — `PRODUCT_OVERVIEW.md`, `ARCHITECTURE.md` (**frozen**)
- `docs/ux/` — `DESIGN_CONTRACT.md` + UI/UX spec files (**frozen**)
- `docs/living/` — `BUSINESS_LOGIC.md`, `DATA_FLOW_MAP.md`,
  `DECISIONS.md`, `CHANGELOG.md`, `PROGRESS.md`, `DEVIATIONS.md`
  (**AI-maintained**)

If `docs/` doesn't exist yet in a project, create the three subfolders
and generate placeholder files with `[fill in: ...]` markers — don't
invent this app's actual purpose, colors, or structure. Ask the user
directly for `PRODUCT_OVERVIEW.md` essentials rather than leaving it
blank.

## Frozen vs. AI-maintained

**Frozen** (`docs/product/`, `docs/ux/`): these are the user's
standards. Never edit, soften, or "sync" them based on what the code
currently does — only edit when the user explicitly instructs a change
to that specific file. If code and a frozen doc disagree, log it in
`docs/living/DEVIATIONS.md`, tell the user, and wait for their decision.

**AI-maintained** (`docs/living/`): update these proactively as normal
work happens — no need to ask first.

If a new request conflicts with something already documented (an
objective, a past decision, existing business logic), stop and ask
rather than silently picking an interpretation.

## UI/UX and product contract

Match `docs/ux/` specs exactly — colors, spacing, component behavior are
binding, not suggestions. `docs/product/PRODUCT_OVERVIEW.md` (purpose,
users, objectives) and `docs/product/ARCHITECTURE.md` (tech stack,
component library, folder structure) should be read before feature
work.

**Stop and alert the user before doing feature work that depends on
purpose, audience, or scope if:**
- `docs/product/PRODUCT_OVERVIEW.md` doesn't exist, or
- it exists but is still a template — still has `[fill in: ...]`
  placeholders instead of actual content.

A template file is functionally the same as a missing file; don't treat
its presence as "handled" just because it exists on disk. UI/UX-only
tasks (matching a spec's visual or interaction pattern) can proceed
without it, but flag the gap regardless.

## Folder architecture

Follow `docs/product/ARCHITECTURE.md` for the specifics of where code
lives in this project. The default structure, unless `ARCHITECTURE.md`
says otherwise:

```
apps/
  frontend/   # frontend-only code
  backend/    # backend-only code
shared/       # used by both — types, constants, validation, utilities
```

Frontend and backend code should not import from each other directly.
Anything needed by both sides goes in `shared/` instead of being
duplicated in both — this is the main reason to reach for `shared/`: if
you're about to retype or re-declare something that already exists on
the other side, it belongs there instead.

If a new kind of file doesn't clearly fit this structure, ask the user
rather than guessing.

## Database protection

- **Never truncate, drop, or bulk-delete real data** without explicit,
  specific confirmation from the user for that action. "Clean this up"
  is not sufficient confirmation on its own.
- **Seed/mock data must never persist in production** — seed scripts
  check the environment and refuse to run against production.
- **Destructive migrations get reviewed and confirmed before running**
  — summarize what will change, especially drops/type changes, before
  executing against real data.
- **No ad hoc direct writes to production** — go through reviewed,
  version-controlled migrations or application code.
- **Recommend a backup before risky operations.**
- **When scope is ambiguous, default to the safest (non-production)
  interpretation** and ask before anything irreversible.

## Git hygiene

- Commit to `main` by default.
- One feature or fix per commit — avoid bundling unrelated changes.
- Write commit messages that describe what changed and why.
- Recommend a commit/checkpoint before a significant AI-driven change,
  so there's a clean revert point if it goes wrong.

## Definition of done

Before calling a feature complete:
- Matches the relevant `docs/ux/` spec(s)
- `docs/living/BUSINESS_LOGIC.md` updated if new rules/permissions/calculations were introduced
- Any unmatched pattern logged in `docs/living/DEVIATIONS.md`
- Basic error states handled, no hardcoded values that should be config
- Reviewed for security issues and unhandled errors, not just spec match
- `docs/living/CHANGELOG.md` and `docs/living/PROGRESS.md` updated
- Only what was explicitly asked for was built — no unrequested
  refactors or "improvements"; suggest those separately instead

## Living docs

Keep `docs/living/` current as work happens, without waiting to be
asked: log new business rules in `BUSINESS_LOGIC.md`, non-obvious
technical choices in `DECISIONS.md`, and session handoff notes in
`PROGRESS.md`. On first working in a project, generate a base
`BUSINESS_LOGIC.md` from `PRODUCT_OVERVIEW.md` and `DESIGN_CONTRACT.md`
— don't overwrite it if it already exists.

`DATA_FLOW_MAP.md` needs more than "where data goes" — track which
specific user action (a button, form, or screen) triggers each save,
and where it actually lands. This is what catches bugs specs and
business logic don't: two different buttons quietly writing to the same
field in different ways, or a save that updates a record you didn't
expect. Update it whenever a feature reads or writes data, and check it
before changes that touch data.

## Communication style

Explain in plain language by default. Use technical terms only when
necessary, and briefly explain them the first time. Favor everyday
analogies over jargon.

## Token efficiency

Don't re-read unchanged files, don't paste full file contents back
unnecessarily, work in stages for large features, keep living docs
concise. Never skip a quality or safety check to save tokens — a bug
shipped to save tokens costs more to fix later.

## Cross-tool consistency

This project may also use `.agent/rules/antigravity-brain.md` (Google
Antigravity), which mirrors this file, and `.agent/workflows/sync-specs.md`
— an on-demand audit that checks `docs/ux/` against the current code and
proposes updates (never applies them without approval — see "Frozen vs.
AI-maintained" above). If the user changes a rule in one brain file,
apply the same change to the other in the same session.
