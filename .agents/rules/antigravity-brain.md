# Process Rules & Global Standards (Antigravity Brain)

## Scope of Documentation & Rules

- **Global process rules & protections**: `CLAUDE.md` and `.agents/rules/antigravity-brain.md` define global standards (database protection, git hygiene, token efficiency, scope discipline, communication style, frozen vs. living docs taxonomy).
- **Project-specific documentation (`docs/`)**:
  - `docs/product/` (`PRODUCT_OVERVIEW.md`, `ARCHITECTURE.md`) — **Frozen** product intent and folder architecture.
  - `docs/ux/` (`DESIGN_CONTRACT.md`, component specs) — **Frozen** UI/UX design specs.
  - `docs/living/` (`BUSINESS_LOGIC.md`, `DATA_FLOW_MAP.md`, `DECISIONS.md`, `CHANGELOG.md`, `PROGRESS.md`, `DEVIATIONS.md`) — **AI-maintained** living documents.

## Frozen Standards vs. AI-Maintained Docs

1. **Frozen (`docs/product/`, `docs/ux/`, `CLAUDE.md`, `.agents/rules/`)**:
   - Read-only unless the user explicitly commands a change to that specific file.
   - If code and a frozen spec disagree, the spec wins. Log mismatches in `docs/living/DEVIATIONS.md` instead of editing the frozen file.
2. **AI-Maintained (`docs/living/`)**:
   - Update proactively as part of normal development work.

## Database Protection (Strict Rules)

- **Never truncate, drop, or bulk delete live data** without explicit, unambiguous user confirmation for that specific action.
- **Seed/mock data must never persist in production.**
- **Review schema migrations** before execution against any environment with real data.
- **No direct ad-hoc writes to production data** outside reviewed code/migrations.
- **Confirm target environment** (dev/staging/prod) before running sensitive or destructive operations.

## Required Task Workflow & Definition of Done

1. Identify and inspect applicable specs in `docs/ux/` and `docs/product/` before starting feature work.
2. Self-review completed work against specs.
3. Log any unavoidable deviations in `docs/living/DEVIATIONS.md`.
4. Keep `docs/living/BUSINESS_LOGIC.md`, `CHANGELOG.md`, `PROGRESS.md`, and `DATA_FLOW_MAP.md` up to date.

## Scope Discipline & Git Hygiene

- Implement only what was explicitly requested. Do not introduce unprompted refactors or extra visual changes.
- Maintain clean commits: one feature/fix per commit with clear messages. Do not commit directly to main/master.
