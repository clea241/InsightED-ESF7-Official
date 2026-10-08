# Workspace Rules & Knowledge Memory Integration

## Prompt Refinement & Knowledge Base
- **Knowledge Memory Location**: `.agents/memory/`
- **Memory Files**:
  - `preferences.md`: Contains coding styles, architectural guidelines, and UI preferences.
  - `domain_knowledge.md`: Contains domain terms, ESF7 rules, DB structures, and business context.
  - `prompt_rules.md`: Directives on how prompts should be constructed.

## 🚨 CRITICAL DATABASE INTEGRITY RULES (RULE #1)
1. **NEVER TOUCH, QUERY, TRUNCATE, OR MODIFY OTHER DATABASES IN THE CLUSTER**:
   - All ESF7 development and operations are strictly isolated to `insighted_esf7`.
   - **NEVER** touch, truncate, drop, or alter other databases (`insightEd`, `STRIDE`, `OpDash`, `AGAP`, `dpa_database`, `hq_database`, `tlo_database`, `siif_database`, `users_database`, `chat_database`, `cloud_database`, `gmis_items`, `Infra_Database`, etc.).
2. **NEVER TOUCH, DROP, TRUNCATE, OR OVERWRITE `esf7_database` TABLE**:
   - The `esf7_database` table holds historical/official production data and MUST NEVER be dropped, truncated, or modified during testing, resets, or migrations.
3. **NEVER TRUNCATE SALARY MATRIX**:
   - `salary_matrix` (or `esf7_salary_matrix`) contains standard DepEd salary grades and steps and must be preserved across any database maintenance.

## Instructions for Agents
1. Before commencing any feature development or architectural task, inspect `.agents/memory/` files to ensure full alignment with user preferences and domain rules.
2. If a prompt supplied by the user contains new domain guidelines or specific user preferences, update the corresponding file in `.agents/memory/` so future interactions inherit that knowledge.

## Collaborative Brainstorming & Prompt Generation
1. When the user asks to **brainstorm, throw ideas around, or explore designs** before coding, engage in **Interactive Co-Pilot Mode**:
   - Ask clarifying questions about UI layout, business logic, DB schema, or edge cases.
   - Offer 2-3 architectural options or design ideas.
   - Once the user says "done" or "create prompt", synthesize the entire conversation into a clear, battle-tested **Antigravity Prompt Spec**.
