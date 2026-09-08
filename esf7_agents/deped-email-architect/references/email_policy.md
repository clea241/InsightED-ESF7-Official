# DepEd Email Technical Policy & Validation Reference

## 1. Background & DepEd ICTS Realities
DepEd utilizes Google Workspace for Education for all permanent and nationally-funded personnel. Across the Philippines' 47,000+ public schools and 800,000+ teachers:
- Standard format: `firstname.lastname@deped.gov.ph`
- **Married Personnel**: Many female educators marry after account creation. Their maiden surname is legally registered as their Middle Name on the eSF7 plantillas, while their DepEd email often retains their maiden name (e.g. `maria.santos@deped.gov.ph` for `Maria Santos Reyes`).
- **Disambiguation**: In common names, DepEd ICT issues accounts with middle names (`juan.bautista.cruz@deped.gov.ph`), middle initials (`juan.b.cruz@deped.gov.ph`), or numerical suffixes (`maria.reyes1@deped.gov.ph`).
- **Compound First Names**: "Mary Jane", "John Paul", "Ma. Theresa" may use whole names or individual tokens (e.g. `maryjane.reyes`, `mary.reyes`, `jane.reyes`).

## 2. Policy Matrix

| Case | Legal First | Legal Middle | Legal Last | DepEd Email | Validity | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Standard | Juan | Bautista | Dela Cruz | `juan.delacruz@deped.gov.ph` | Valid | Standard format |
| Married (Maiden email) | Maria | Santos | Reyes | `maria.santos@deped.gov.ph` | Valid | Maiden surname used as Middle Name |
| Married (Combined) | Maria | Santos | Reyes | `maria.santos.reyes@deped.gov.ph` | Valid | Both maiden and married surnames |
| Married (Initial) | Maria | Santos | Reyes | `maria.s.reyes@deped.gov.ph` | Valid | Initial with married surname |
| Multi-word First Name | Mary Grace | Lopez | Santos | `grace.santos@deped.gov.ph` | Valid | First name token match |
| Number Suffix | Jose | Protacio | Rizal | `jose.rizal001@deped.gov.ph` | Valid | Disambiguation suffix |
| Non-DepEd Domain | Juan | Bautista | Dela Cruz | `juan.delacruz@gmail.com` | Invalid | Strictly requires `@deped.gov.ph` |
| Multiple Suffixes | Juan | Bautista | Dela Cruz | `juan@deped.gov.ph@deped.gov.ph` | Invalid | Duplicate domain detected |
| Non-Matching Person | Juan | Bautista | Dela Cruz | `pedro.penduko@deped.gov.ph` | Invalid | Neither first nor last/middle match |

## 3. Exemptions
- **Nationally-Funded Teaching & Non-Teaching**: DepEd email is **MANDATORY**.
- **Non-Nationally Funded Non-Teaching** (e.g. MOOE Utility, LGU-paid, PTA-paid, JO/Contract of Service): DepEd email can be marked as `'N/A'`.
