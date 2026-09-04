# InsightED ESF7 Icon Catalog & Visual Guidelines

This document serves as the single source of truth for all iconography, glyphs, and visual indicators in the **InsightED - ESF7 Official** repository.

---

## 1. Icon Library Standard

- **Canonical Library**: `react-icons/fi` ([Feather Icons](https://feathericons.com/))
- **Why Feather?**: 
  - Ultra-clean 2px uniform geometric stroke width.
  - Neutral and authoritative enterprise appearance aligned with DepEd and school administrative tools.
  - Zero heavy solid fills that distract from dense administrative tables and schedules.
- **Import Syntax Standard**:
  ```jsx
  import { FiHome, FiUsers, FiClock, FiCheckCircle } from 'react-icons/fi';
  ```

---

## 2. Comprehensive View & Component Icon Reference

### 2.1 Navigation & Global Shell
| Component / Element | Icon | Purpose |
|---|---|---|
| Sidebar: School Profile | `FiBookOpen` | Curricular profile, school identifiers |
| Sidebar: Organized Classes | `FiGrid` | Grade sections & classroom matrix |
| Sidebar: Personnel Roster | `FiUsers` | Faculty roster, plantilla verification |
| Sidebar: Personnel Profile | `FiUserCheck` | Detailed teacher service & identity profiling |
| Sidebar: Official Designations | `FiBookmark` | Ancillary roles, SDS approvals |
| Sidebar: Workload / Schedule | `FiClock` | Daily teaching minutes, advisory time |
| Sidebar: Room Profiling / QR | `FiMaximize` | QR Code scanner, teacher station check |
| Sidebar: Request Center | `FiMail` | Inter-school transfer/clustering requests |
| Sidebar: Workload Transfer | `FiRepeat` | Relieving duty, teacher substitute transfer |
| Sidebar: Allowances | `FiDollarSign` | PERA, hardship, clothing, chalk allowance |
| Sidebar: Overload Pay & Monitor | `FiTrendingUp` | Overload computation, deduction tracker |
| Sidebar: Validation Center | `FiShield` | Cross-table eSF7 rule audits |
| Sidebar: Logout | `FiLogOut` | Terminate session |
| Header: Back button | `FiArrowLeft` | Return to previous view |
| Header: Reset / Sync | `FiRotateCcw` | Reset view / Refresh context |
| Header: Node Map button | `FiMap` | Launch progression roadmap |

---

### 2.2 Dashboard
| Section | Icon | Usage |
|---|---|---|
| Total Personnel Card | `FiUsers` | Active plantilla count |
| Teaching Load Distribution | `FiSliders` | Load balancing KPI |
| Total Subject Areas | `FiBookOpen` | Curriculum breadth |
| ESF7 Form Summary | `FiFileText` | Official report snapshot |
| Class Sections Aggregate | `FiLayers` | Total sections count |
| Compliance Check | `FiCheckCircle` | 100% compliant badge |
| Deficiency Alert | `FiAlertCircle` | Out-of-field or underload warning |
| Certified Personnel | `FiUserCheck` | LIS/PRC verified teachers |
| Target Milestones | `FiTarget` | Completion targets |
| Statistics Distribution | `FiPieChart`, `FiBarChart2` | Analytics charts |
| Achievements & Accreditations | `FiAward`, `FiStar` | Recognition badges |

---

### 2.3 Personnel Profile (All 7 Tabs)
| Tab / Element | Icon | Usage |
|---|---|---|
| Tab 1: Personal & Identity | `FiUser` | Name, PRN, PhilSys, TIN, civil status |
| Tab 2: Employment & Status | `FiBriefcase` | Position, salary step, deployment, fund source |
| Tab 3: Education & Eligibility | `FiAward` | Degrees, PRC license, RA 1080 |
| Tab 4: L&D Trainings | `FiBook` | NEAP seminars, TESDA certificates |
| Tab 5: Learning Area Matrix | `FiLayers` | Subject expertise grid |
| Tab 6: Official Designations | `FiBookmark` | Coordinatorship, SDS designation |
| Tab 7: Workload Schedules | `FiClock` | Active timetable slots |
| Actions: Quick Search | `FiSearch` | Search teachers |
| Actions: Quick Copy PRN | `FiCopy` | Copy identifier to clipboard |
| Actions: Save Profile | `FiSave` | Commit draft changes |
| Actions: Link / Reassign | `FiLink` | Attach to national station |
| Actions: Delete Record | `FiTrash2` | Remove teacher draft |
| Badges: Certified / Verified | `FiCheckCircle` | PRC / LIS verified mark |
| Badges: Locked / E-Signed | `FiLock` | Certified submission lock |
| Fast Actions: Quick Action | `FiZap` | Trigger automated rule fix |

---

### 2.4 Overload Management & Absence Tracking
| Element | Icon | Usage |
|---|---|---|
| Term Overload Pay Card | `FiTrendingUp`, `FiDollarSign` | Total accumulated overload compensation |
| Schedule Hours | `FiClock` | Teaching minutes vs 360-min standard |
| Academic Calendar & Terms | `FiCalendar` | DepEd 3-Term dates, no-work days |
| Teacher Absences Log | `FiUserX` | Leave days affecting overload pay |
| Tardiness / Late Records | `FiAlertTriangle` | Single-day disqualification log |
| Workload Substitution / Relief | `FiRepeat`, `FiClipboard` | Relieving duty hours |
| Print Official Payroll Sheet | `FiPrinter` | Exportable DepEd eSF7 Overload annex |
| Recalculate Pay Formula | `FiRefreshCw` | Re-run formula calculation |

---

### 2.5 Room Profiling & QR Single-Scan
| Element | Icon | Usage |
|---|---|---|
| QR Scanner Frame | `FiMaximize` | Scanner viewfinder |
| Mobile Teacher Device | `FiSmartphone` | Mobile browser client |
| Room Passcode / Auth | `FiKey` | 10-minute dynamic faculty passcode |
| Queue / Ingestion Monitor | `FiInbox` | Real-time teacher submission queue |
| Incoming Submission Sound/Alert | `FiBell` | Real-time audio-visual ping |
| Password Visibility Toggle | `FiEye`, `FiEyeOff` | Mask/unmask passcode |
| Print Room QR Poster | `FiPrinter` | Printable QR badge for faculty doors |

---

### 2.6 Validation Center & Submission Queue
| Element | Icon | Usage |
|---|---|---|
| Validation Audit Shield | `FiShield` | Top-level compliance score |
| Rule Passed | `FiCheckCircle`, `FiCheck` | Clean validation |
| Critical ESF7 Blocker | `FiAlertCircle` | Submission preventing error |
| Advisory / Warning | `FiAlertTriangle` | Non-blocking recommendation |
| Printable Report Generation | `FiPrinter` | Generate DepEd eSF7 PDF |
| Queue Ingestion & Cloud Sync | `FiUploadCloud` | Queue submission to backend |

---

## 3. Sizing & Spacing Standards

| Token | Size (px) | Usage Examples |
|---|---|---|
| **Micro** | `13px - 14px` | Pill tags, table row badges, inline text metadata |
| **Standard** | `16px - 18px` | Buttons, form input adornments, dropdown items, table actions |
| **Card Header** | `20px - 22px` | Section titles, modal headers, metric card labels |
| **Hero / Modal** | `28px - 36px` | Modal banners, feature callout boxes |
| **Empty State** | `48px - 64px` | Empty list placeholders, QR code hero displays |

### CSS Layout Guidelines for Icons
```css
/* Standard Button Icon Alignment */
.btn-with-icon {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* Icon Container Badge */
.icon-badge-primary {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(37, 99, 235, 0.1);
  color: #2563EB;
}
```

---

## 4. Semantic Color Tokens for Icons

```css
/* Success / Verification */
--icon-success: #10B981; /* Tailwind emerald-500 */
--icon-success-bg: rgba(16, 185, 129, 0.12);

/* Warning / Caution */
--icon-warning: #F59E0B; /* Tailwind amber-500 */
--icon-warning-bg: rgba(245, 158, 11, 0.12);

/* Danger / Critical Blocker */
--icon-danger: #EF4444; /* Tailwind red-500 */
--icon-danger-bg: rgba(239, 68, 68, 0.12);

/* Brand / Primary Action */
--icon-primary: #2563EB; /* DepEd / InsightED Blue */
--icon-primary-bg: rgba(37, 99, 235, 0.12);

/* Muted / Secondary Info */
--icon-muted: #64748B; /* Slate-500 */
--icon-muted-light: #94A3B8; /* Slate-400 */
```

---

## 5. Prohibited Anti-Patterns

1. ❌ **No Mixing Icon Libraries**: Never import from `@heroicons`, `react-icons/fa` (FontAwesome), `react-icons/ai` (Ant Design), `react-icons/bi` (Boxicons), or `lucide-react`. All icons must come from `react-icons/fi`.
2. ❌ **No Casual Emojis**: Emojis like ⚠️, ❌, ✅, 📊, 🚀, 👨‍🏫, 🏫 must never be hardcoded into UI buttons, section headers, badges, or error messages. Use `FiAlertTriangle`, `FiX`, `FiCheckCircle`, `FiBarChart2`, `FiUser`, `FiHome`.
3. ❌ **No Unstyled Raw SVGs**: Avoid copy-pasting raw `<svg>` code with hardcoded viewport dimensions or fill colors.
4. ❌ **No Inconsistent Stroke Widths**: Feather icons have an elegant 2px stroke. Do not artificially apply heavy CSS borders that distort the icon geometry.
