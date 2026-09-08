---
name: deped-email-architect
description: Master agent skill for DepEd Google Workspace Email (@deped.gov.ph) validation rules, married personnel maiden surname matching, middle name & initial handling, compound name tokenization, and multi-school uniqueness enforcement. Use whenever modifying, auditing, or debugging DepEd email logic across client/src/context/AppContext.jsx, client/src/pages/Roster.jsx, client/src/pages/PersonnelProfile.jsx, or client/src/pages/RoomProfiling.jsx.
---

# DepEd Email Architect Agent Skill

Master specification, policy, and validation agent for **DepEd Official Google Workspace Accounts (`@deped.gov.ph`)** in InsightED ESF7.

## 🎯 Role & Responsibilities

1. **DepEd Domain & Syntax Enforcement**: Ensures all entered official emails strictly end with single `@deped.gov.ph`, contain valid alphanumeric and dot sequences, and reject non-DepEd domains or duplicates.
2. **Married Personnel & Maiden Surname Recognition**: Accommodates female personnel who marry and change their legal surname on eSF7 while retaining their maiden surname (now recorded as Middle Name) in their DepEd Google Workspace email (e.g. `firstname.maidenname@deped.gov.ph` or `firstname.middlename.lastname@deped.gov.ph`).
3. **Disambiguation & Initial Support**: Accommodates national ICT disambiguation schemes where middle initials or numerical suffixes (e.g. `first.m.last@deped.gov.ph`, `juan.bautista.cruz@deped.gov.ph`, `maria.reyes001@deped.gov.ph`) are issued due to duplicate names across 800k+ DepEd employees.
4. **Funding & Category Exemption Rules**: Enforces mandatory DepEd emails for all Teaching, Teaching-Related, and Nationally-Funded Non-Teaching staff, while permitting `N/A` for Non-Nationally Funded Non-Teaching staff (e.g., MOOE-funded Utility, Contract of Service/JO).
5. **Cross-Component Synchronization**: Guarantees consistent validation across:
   - `client/src/context/AppContext.jsx` (`validateDepEdEmail`, `getPersonnelValidationIssues`)
   - `client/src/pages/Roster.jsx` (Add Personnel modal & live input guard)
   - `client/src/pages/PersonnelProfile.jsx` (Basic Information email input & Validation Checklist modal)
   - `client/src/pages/RoomProfiling.jsx` (Faculty room QR single-scan profiling)
   - `client/src/components/DepEdEmailInfoModal.jsx` (User-facing policy guide)

---

## 📜 Official DepEd Email Validation Logic Contract

```javascript
validateDepEdEmail(email, firstName = '', lastName = '', middleName = '')
```

### Return Signature
- `{ isValid: true, error: null }`
- `{ isValid: false, error: "..." }`

### Matching Rules
1. **Empty / N/A handling**: If `!email` or `email === 'N/A'`, returns valid (requiredness is validated separately based on category/fundSource).
2. **Domain Checks**:
   - Must strictly end with `@deped.gov.ph`.
   - Reject multiple `@` or duplicate `@deped.gov.ph` substrings.
3. **Local Part Matching**:
   - `firstName` match: Local part must contain at least one token from `firstName` (handles multi-word first names like "Mary Jane" -> "mary" or "jane").
   - `surname` match: Surnames accept **EITHER**:
     - The legal `lastName` (e.g. "Reyes") OR
     - The `middleName` / maiden surname (e.g. "Santos") OR
     - Both combined with middle initial (e.g. "maria.s.reyes").

---

## 🛠 Automated Verification

Execute the test suite to verify all email validation edge cases:
```bash
node esf7_agents/deped-email-architect/scripts/audit_email_validation.js
```
