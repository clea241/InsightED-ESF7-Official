---
name: esf7-icon-architect
description: Master iconography and visual design agent for the InsightED ESF7 repository. Enforces React-Icons Feather (`react-icons/fi`) icon system, canonical view-to-icon mappings, size tokens, color schemes, and prohibits emojis or mismatched icon libraries.
---

# ESF7 Icon Architect Agent Skill

Master specification and design authority for all icons, glyphs, and visual indicators across the **InsightED ESF7 Official** application.

## 🎯 Role & Capabilities

1. **Repository Icon System Authority**: Enforces `react-icons/fi` (Feather Icons) as the single, cohesive icon library across the entire codebase.
2. **Canonical Mapping Knowledge**: Maintains the authoritative dictionary mapping every DepEd ESF7 module, action, status indicator, modal, and badge to its exact approved Feather icon.
3. **Design Token & Styling Consistency**: Standardizes icon sizes (`14px`, `16px`, `18px`, `20px`, `24px`), stroke widths, flex alignments, and semantic color palettes (DepEd Blue, Emerald, Amber, Crimson, Slate).
4. **Emoji & Icon Drift Prevention**: Blocks random multi-colored emojis, unstyled raw SVGs, and foreign icon libraries (`react-icons/fa`, `react-icons/bi`, `lucide-react`, etc.) to maintain a sleek, unified, professional enterprise design.
5. **Automated Icon Audit**: Runs automated static analysis across all `client/src` files to verify 100% compliance with icon rules.

---

## 📖 Iconography Catalog & Reference

Detailed technical reference of all icon mappings, sizing standards, color tokens, and anti-patterns:
* **[Icon Catalog & Visual Guidelines](file:///e:/InsightED%20-%20ESF7%20Official/esf7_agents/esf7-icon-architect/references/icon_catalog_and_guidelines.md)**

---

## 🧭 Canonical Repository Icon Map

| Category / View | Approved Feather Icon (`react-icons/fi`) | Purpose / Usage |
|---|---|---|
| **Dashboard / Home** | `FiHome`, `FiSliders`, `FiLayers`, `FiBarChart2`, `FiPieChart` | Executive stats, KPIs, and overview tabs |
| **School Profile** | `FiBookOpen`, `FiShield`, `FiTarget`, `FiStar`, `FiMapPin` | School meta, accreditation, curricular offerings |
| **Organized Classes** | `FiGrid`, `FiUsers`, `FiClock`, `FiBook`, `FiTarget` | Grade sections, learner count, advisory tracking |
| **Personnel Roster** | `FiUsers`, `FiUser`, `FiPlus`, `FiTag`, `FiLink` | Teacher list, national plantilla matching |
| **Personnel Profile** | `FiUser`, `FiCreditCard`, `FiBriefcase`, `FiAward`, `FiZap`, `FiCopy`, `FiSave` | Identity, service records, degrees, L&D |
| **Official Designations** | `FiBookmark`, `FiShield`, `FiFolder`, `FiSearch` | Ancillary roles, SDS approvals |
| **Workload / Timetable** | `FiClock`, `FiCalendar`, `FiList`, `FiBriefcase`, `FiLock` | Teaching load, advisory minutes, schedule grid |
| **Room Profiling & QR** | `FiMaximize`, `FiSmartphone`, `FiRefreshCw`, `FiInbox`, `FiBell`, `FiKey`, `FiEye`, `FiEyeOff` | QR generation, single-scan profiling, passcodes |
| **Request Center** | `FiMail`, `FiSend`, `FiInbox` | Inter-school clustering, reassignment requests |
| **Workload Transfer** | `FiRepeat`, `FiClipboard` | Relieving duty, teacher absence substitutions |
| **Allowances** | `FiDollarSign`, `FiMap`, `FiAward` | PERA, hardship allowance, uniform stipend |
| **Overload Management** | `FiTrendingUp`, `FiDollarSign`, `FiCalendar`, `FiClock`, `FiUserX`, `FiBarChart2` | Excess hours, 3-Term pay, deduction tracker |
| **Validation Center** | `FiShield`, `FiCheckCircle`, `FiPrinter`, `FiRepeat`, `FiUploadCloud`, `FiEdit3` | ESF7 sanity checks, LIS sync audit, printable eSF7 |
| **NodeMap / Flow** | `FiMap`, `FiLock`, `FiUnlock`, `FiPlay`, `FiUploadCloud`, `FiArrowRight` | Step-by-step ESF7 completion progression |
| **Submission Queue** | `FiUploadCloud`, `FiCheckCircle`, `FiAlertCircle` | Certified e-sign queue, PostgreSQL ingestion |
| **Actions: Add / Save** | `FiPlus`, `FiSave`, `FiCheck`, `FiCheckCircle` | Primary action triggers, successful commit |
| **Actions: Edit / Delete** | `FiEdit2`, `FiEdit3`, `FiTrash2`, `FiX` | Modification, destructive triggers |
| **Status: Alerts & Info** | `FiAlertTriangle` (Warning), `FiAlertCircle` (Danger), `FiInfo` (Notice) | Callouts, notifications, helper hints |
| **Auth & Security** | `FiLock`, `FiUnlock`, `FiKey`, `FiLogOut` | PIN modals, role authorization, session logout |

---

## 🛑 Strict Icon Rules & Anti-Patterns

1. **Exclusive Library**: Only import from `react-icons/fi`. Never import from `react-icons/fa`, `react-icons/bi`, `react-icons/md`, `react-icons/hi`, or `lucide-react`.
2. **No Casual Emojis**: Do NOT use emojis (`📊`, `📌`, `⚠️`, `✅`, `🔥`, `🚀`) in UI buttons, tabs, tables, or header components. Use clean Feather icons or professional minimal sidebar glyphs (`⌂`, `🏛`, `☷`, `✎`, `⚜`, `▦`, `◷`, `⛶`, `✉`, `⇄`, `👤`, `ⓘ`).
3. **Consistent Sizing**:
   - Micro / In-text badge: `size={13}` or `size={14}`
   - Standard Button / Table action: `size={16}` or `size={18}`
   - Header / Card Title: `size={20}` or `size={22}`
   - Hero / Empty State Illustration: `size={32}` to `size={48}`
4. **Color Tokens**:
   - Active / Accent: `var(--primary-color, #2563EB)` or `#3B82F6`
   - Success / Verified: `#10B981` / `#059669`
   - Warning / Caution: `#F59E0B` / `#D97706`
   - Error / Destructive: `#EF4444` / `#DC2626`
   - Neutral / Subtle: `#64748B` / `#94A3B8`

---

## 🛠 Helper Scripts

Run the static icon audit script to check for non-compliant icon imports across the repository:
```bash
node esf7_agents/esf7-icon-architect/scripts/audit_icons.js
```
