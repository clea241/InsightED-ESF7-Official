# Scoring model

`scripts/score.js` computes everything below deterministically. Do not score by hand.

## Weights and credit

| Severity | Weight |
|---|---|
| critical | 10 |
| high | 5 |
| medium | 3 |
| low | 1 |

| Status | Credit | Notes |
|---|---|---|
| `pass` | 1 | Needs cited evidence |
| `partial` | 0.5 | Needs cited evidence |
| `fail` | 0 | Needs cited evidence |
| `unknown` | 0 | Counts as a fail; flagged in the report. Use when it cannot be verified (including "skipped in safe mode") |
| `na` | excluded | Removed from numerator **and** denominator; needs a justification in `note` |

`score % = sum(weight x credit) / sum(weight of non-na checks) x 100`, rounded to one decimal. The same formula gives each category score and the overall score.

## Verdict

1. Any `critical` check with `fail` or `unknown` -> **NO-GO (critical blockers)**, whatever the score.
2. Otherwise: `>= 90` **GO**; `80-89.9` **GO with conditions**; `60-79.9` **NOT READY**; `< 60` **BLOCKED**.

## Fix priority

`fail` and `unknown` checks: critical -> P0, high -> P1, medium -> P2, low -> P3. Every `partial` check is P3. Within a tier, items sort by weight (high to low) then by ID.

## Projections

- **After P0:** every critical `fail`/`unknown` becomes `pass`; everything else unchanged.
- **After P0 + P1:** additionally every high `fail`/`unknown` becomes `pass`.
- **After all:** every non-`na` check becomes `pass` (100, if anything applies).
Projected verdicts use the same rules; remaining critical blockers still force NO-GO.

## Worked example

Five checks: A critical `pass`, B high `partial`, C medium `fail`, D low `na`, E high `unknown`.

- Possible = 10 + 5 + 3 + 5 = 23 (D excluded).
- Earned = 10x1 + 5x0.5 + 3x0 + 5x0 = 12.5.
- Score = 12.5 / 23 = 54.3 -> no critical blocker, below 60 -> **BLOCKED**.
- Fixes: C is P2, E is P1, B is P3. After P0 (nothing to fix): 54.3. After P0 + P1: E becomes pass -> 17.5 / 23 = 76.1 (NOT READY). After all: 100.

## Evidence coverage

A low score can come from sections that safe mode skipped (staging probes, database schema, `npm audit`, `nginx -t`, rate-limit probe). `report.md` and `score.json` list those sections and the flag that enables each, so the reader can tell "failed" from "not measured".
