import {
  takeRecentApiError,
  inlineDetailsHtml,
  markErrorHandled,
} from "./errorAlert";

// SweetAlert2 is loaded on demand (only when the unsaved-changes modal opens) to keep it out of the main bundle.

/**
 * Registry of active screen dirty guards.
 * screenId -> { isDirty: () => boolean | boolean, onDiscard: () => void, onSave?: () => Promise<{ ok: boolean, title?: string, message?: string }> }
 */
const guards = new Map();

let isBeforeUnloadAttached = false;

// Set just before the app reloads the page on purpose (e.g. after "Discard Changes"), so the browser does not ask again.
let allowUnload = false;
export const allowNextUnload = () => {
  allowUnload = true;
};

const beforeUnloadHandler = (e) => {
  if (!allowUnload && isAnyScreenDirty()) {
    e.preventDefault();
    e.returnValue = "";
    return "";
  }
};

const syncBeforeUnloadListener = () => {
  if (typeof window === "undefined") return;
  const hasDirty = isAnyScreenDirty();
  if (hasDirty && !isBeforeUnloadAttached) {
    window.addEventListener("beforeunload", beforeUnloadHandler);
    isBeforeUnloadAttached = true;
  } else if (!hasDirty && isBeforeUnloadAttached) {
    window.removeEventListener("beforeunload", beforeUnloadHandler);
    isBeforeUnloadAttached = false;
  }
};

/**
 * Register a dirty guard for a screen.
 * @param {string} screenId
 * @param {{ isDirty: () => boolean, onDiscard?: () => void, onSave?: () => Promise<{ ok: boolean, title?: string, message?: string }> }} config
 * @returns {() => void} unregister function
 */
export const registerDirtyGuard = (screenId, config) => {
  if (!screenId || !config) return () => {};
  guards.set(screenId, config);
  syncBeforeUnloadListener();
  return () => {
    guards.delete(screenId);
    syncBeforeUnloadListener();
  };
};

/**
 * Run registered onFlush / onCommit callbacks across all screens.
 * Ensures in-memory component state is flushed to context / local storage.
 */
export const flushAllDirtyGuards = async () => {
  for (const [screenId, config] of guards.entries()) {
    if (typeof config?.onFlush === "function") {
      try {
        await config.onFlush();
      } catch (err) {
        console.warn(
          `[dirtyGuard] Error running onFlush for screen ${screenId}:`,
          err,
        );
      }
    }
  }
};

import { upsertOutboxEntry } from "./outbox";

/**
 * Snapshot all dirty registered guards to the local outbox as crash-safety 'unsaved' entries.
 * Only writes dirty sections, never writes when clean.
 */
export const snapshotDirtyGuardsToOutbox = async (
  reason = "visibilitychange",
) => {
  for (const [screenId, config] of guards.entries()) {
    try {
      const isDirty =
        typeof config.isDirty === "function"
          ? config.isDirty()
          : Boolean(config.isDirty);
      if (isDirty && typeof config.getPayload === "function") {
        const payload = config.getPayload();
        const meta =
          typeof config.getMetadata === "function" ? config.getMetadata() : {};
        if (payload) {
          await upsertOutboxEntry({
            kind: "unsaved",
            module: screenId,
            payload,
            schoolId: meta.schoolId,
            user: meta.user,
            schoolYear: meta.schoolYear,
            term: meta.term,
            endpoint: meta.endpoint,
            baseVersion: meta.baseVersion,
            lastError: null,
          });
        }
      }
    } catch (err) {
      console.warn(
        `[dirtyGuard] Error snapshotting screen "${screenId}" to outbox (${reason}):`,
        err,
      );
    }
  }
};

// Primary crash-safety trigger: visibilitychange to hidden (pagehide/beforeunload are unreliable for async storage)
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      snapshotDirtyGuardsToOutbox("visibilitychange (hidden)").catch(() => {});
    }
  });
}

/**
 * Unregister a dirty guard.
 * @param {string} screenId
 */
export const unregisterDirtyGuard = (screenId) => {
  if (!screenId) return;
  guards.delete(screenId);
  loggedReasons.delete(screenId);
  syncBeforeUnloadListener();
};

// Development only: say WHICH fields made a screen dirty, so a false positive is spotted immediately.
const loggedReasons = new Map();
const logDirtyReasons = (id, config) => {
  let isDev = false;
  try {
    isDev = Boolean(import.meta.env.DEV);
  } catch (e) {
    /* not a Vite build */
  }
  if (!isDev) return;
  let reasons = null;
  try {
    reasons =
      typeof config.getDirtyReasons === "function"
        ? config.getDirtyReasons()
        : null;
  } catch (e) {
    /* ignore */
  }
  const signature = JSON.stringify(reasons);
  if (loggedReasons.get(id) === signature) return; // once per distinct set of differences, not on every check
  loggedReasons.set(id, signature);
  if (Array.isArray(reasons) && reasons.length > 0) {
    console.groupCollapsed(
      `[dirtyGuard] "${id}" is dirty - ${reasons.length} difference(s)`,
    );
    console.table(reasons);
    console.groupEnd();
  } else {
    console.warn(
      `[dirtyGuard] "${id}" is dirty but gave no reasons (add getDirtyReasons to useDirtyGuard to see what differs).`,
    );
  }
};

/**
 * Check if any registered screen currently has unsaved changes.
 * @returns {boolean}
 */
export const isAnyScreenDirty = () => {
  for (const [id, config] of guards.entries()) {
    try {
      const dirty =
        typeof config.isDirty === "function"
          ? config.isDirty()
          : Boolean(config.isDirty);
      if (dirty) {
        logDirtyReasons(id, config);
        return true;
      }
    } catch (err) {
      console.warn("[dirtyGuard] Error checking isDirty:", err);
    }
  }
  return false;
};

/**
 * Check if a specific screen is dirty.
 * @param {string} screenId
 * @returns {boolean}
 */
export const isScreenDirty = (screenId) => {
  const config = guards.get(screenId);
  if (!config) return false;
  try {
    return typeof config.isDirty === "function"
      ? config.isDirty()
      : Boolean(config.isDirty);
  } catch (err) {
    return false;
  }
};

/**
 * Discard unsaved changes across all registered screens and notify their onDiscard handlers.
 */
export const discardAllDirtyScreens = () => {
  for (const [, config] of guards.entries()) {
    try {
      if (typeof config.onDiscard === "function") {
        config.onDiscard();
      }
    } catch (err) {
      console.warn("[dirtyGuard] Error running onDiscard:", err);
    }
  }
  syncBeforeUnloadListener();
};

/**
 * Trigger listener synchronization (called when a screen's dirty state changes).
 */
export const notifyDirtyStateChanged = () => {
  syncBeforeUnloadListener();
};

/**
 * Escapes text for SweetAlert2's validation message (which renders HTML) and keeps line breaks.
 * @param {string} text
 */
const toSafeHtml = (text) =>
  String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");

const FIELD_LABEL_MAP = {
  // Personal / Identity
  firstName: "First Name",
  lastName: "Last Name",
  middleName: "Middle Name",
  nameExtension: "Name Extension",
  position: "Position / Designation",
  plantillaPosition: "Position / Designation",
  salaryGrade: "Salary Grade",
  salaryStep: "Step Increment",
  monthlySalary: "Monthly Salary",
  tin: "Tax Identification Number (TIN)",
  noTin: "Tax Identification Number (TIN)",
  no_tin: "Tax Identification Number (TIN)",
  tinNo: "Tax Identification Number (TIN)",
  tin_no: "Tax Identification Number (TIN)",
  philsysNo: "PhilSys National ID",
  noPhilsys: "PhilSys National ID",
  no_philsys: "PhilSys National ID",
  gsisBpn: "GSIS BP Number",
  noGsis: "GSIS BP Number",
  no_gsis: "GSIS BP Number",
  depedEmail: "DepEd Official Email",
  noDepedEmail: "DepEd Official Email",
  no_deped_email: "DepEd Official Email",
  email: "Email Address",
  personalEmail: "Personal Email Address",
  contactNumber: "Contact Number",
  contactNo: "Contact Number",
  sexAtBirth: "Sex at Birth",
  sex: "Sex at Birth",
  civilStatus: "Civil Status",
  birthDate: "Date of Birth",
  birthPlace: "Place of Birth",
  bloodType: "Blood Type",
  height: "Height (m)",
  weight: "Weight (kg)",
  residentialAddress: "Residential Address",
  permanentAddress: "Permanent Address",
  ethnicGroup: "Ethnic / IP Group",
  religion: "Religious Affiliation",
  soloParent: "Solo Parent Status",

  // Employment
  employmentStatus: "Employment Status",
  appointmentStatus: "Appointment Status",
  fundSource: "Fund Source",
  appointmentNature: "Nature of Appointment",
  natureOfAppointment: "Nature of Appointment",
  hiringArrangement: "Hiring Arrangement",
  firstDayOfService: "Date of First Day of Service",
  firstServiceDate: "Date of First Day of Service",
  firstDepedDate: "Date of First DepEd Appointment",
  originalAppointmentDate: "Date of Original Appointment",
  currentStationDate: "Date of Current Station Assignment",
  lastPromotionDate: "Date of Last Promotion",
  dailyRate: "Daily Rate",
  deploymentStatus: "Deployment Status",
  partnerSchoolId: "Partner School (Clustered / Shared)",
  reassignedSchoolId: "Reassigned School",
  employeeNo: "Employee Number",
  prsNumber: "Plantilla Item (PSI) Number",
  profilingCode: "Profiling Reference Number (PRN)",

  // Education & Teaching
  degree: "Educational Degree",
  major: "Degree Major / Specialization",
  minor: "Degree Minor",
  highestAttainment: "Highest Educational Attainment",
  highestEducationalAttainment: "Highest Educational Attainment",
  school: "School / University Graduated",
  graduateYear: "Year Graduated",
  postGraduateDegree: "Post-Graduate Degree",
  trainings: "Trainings & Seminars Attended",
  assignedGradeLevels: "Assigned Grade Levels",
  gradeLevelsTaught: "Assigned Grade Levels",
  learningArea: "Learning Area Specialization",
  learningAreas: "Learning Area Matrix",

  // School Profile & Classes
  hasElemSpecialPrograms: "Elementary Special Programs",
  hasJhsSpecialPrograms: "JHS Special Programs",
  hasElemInclusive: "Elementary Inclusive Programs",
  hasJhsInclusive: "JHS Inclusive Programs",
  hasShsInclusive: "SHS Inclusive Programs",
  shsCurriculumModel: "Senior High School Curriculum Model",
  hasShifts: "School Shifts Configuration",
  shiftStartTime: "Shift Start Time",
  shiftEndTime: "Shift End Time",
  shiftsConfig: "Shift Schedules",
  iern: "Institutional Entity Reference Number (IERN)",
  workloadRows: "Teaching & Workload Timetable",
  maleLearners: "Male Learners Count",
  femaleLearners: "Female Learners Count",
  numberOfLearners: "Total Learners Count",
  sectionName: "Section Name",
  gradeLevel: "Grade Level",
  classType: "Class Type",
};

const humanizeFieldName = (name) => {
  if (!name) return "Modified Data";
  if (FIELD_LABEL_MAP[name]) return FIELD_LABEL_MAP[name];
  if (typeof name !== "string") return "Modified Field";
  if (name.includes(".")) {
    const parts = name.split(".");
    const last = parts.pop();
    const label = FIELD_LABEL_MAP[last] || humanizeFieldName(last);
    return `${label} (${parts.join(".")})`;
  }
  const words = name
    .replace(/([A-Z])/g, " $1")
    .replace(/[-_]/g, " ")
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const humanizeScreenTitle = (screenId) => {
  const map = {
    workload: "Teaching & Workload Timetable",
    roster: "Personnel Roster",
    personnel_profile: "Personnel Profile & Specialization",
    school_profile: "School Profile & Curricular Configuration",
    organized_classes: "Organized Classes & Section Setup",
    deployment: "Deployment & Reassignment Center",
  };
  return map[screenId] || humanizeFieldName(screenId);
};

const formatDiffSubtitle = (from, to) => {
  if (from === undefined && to === undefined)
    return "Modified from saved baseline";
  const cleanVal = (v) => {
    if (v === null || v === undefined) return "None";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (typeof v === "object") {
      if (Array.isArray(v)) {
        if (v.length === 0) return "None";
        return v
          .map((item) =>
            typeof item === "string" ? item : JSON.stringify(item),
          )
          .join(", ");
      }
      return "custom data";
    }
    let s = String(v).trim();
    if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
      try {
        const parsed = JSON.parse(s);
        if (typeof parsed === "string") s = parsed;
      } catch (e) {}
    }
    if (s === "[]" || s === '""' || s === "") return "None";
    if (s.startsWith("[") && s.endsWith("]")) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          if (parsed.length === 0) return "None";
          return parsed
            .map((item) =>
              typeof item === "string" ? item : JSON.stringify(item),
            )
            .join(", ");
        }
      } catch (e) {}
    }
    return s.length > 28 ? s.slice(0, 28) + "..." : s;
  };
  const fromStr = cleanVal(from);
  const toStr = cleanVal(to);
  if (fromStr === "None" && toStr !== "None") return `Set to: "${toStr}"`;
  if (toStr === "None" && fromStr !== "None")
    return `Cleared (was "${fromStr}")`;
  if (fromStr && toStr && fromStr !== toStr)
    return `Changed: "${fromStr}" → "${toStr}"`;
  return "Modified from saved baseline";
};

export const getAllDirtyReasonsDetailed = () => {
  const details = [];
  for (const [screenId, config] of guards.entries()) {
    try {
      const isDirty =
        typeof config.isDirty === "function"
          ? config.isDirty()
          : Boolean(config.isDirty);
      if (!isDirty) continue;

      let rawReasons = [];
      if (typeof config.getDirtyReasons === "function") {
        try {
          rawReasons = config.getDirtyReasons() || [];
        } catch (e) {
          rawReasons = [];
        }
      }

      if (Array.isArray(rawReasons) && rawReasons.length > 0) {
        rawReasons.forEach((r) => {
          if (typeof r === "string") {
            details.push({
              screenId,
              field: r,
              title: r,
              subtitle: "Unsaved local edits pending save",
              targetId: null,
            });
          } else if (r && typeof r === "object") {
            const isSectionEntry =
              r.field === "(section)" || (!r.field && r.section);
            const rawField = isSectionEntry
              ? "section"
              : r.field || r.section || r.targetId || "general";
            const fieldName =
              String(rawField).replace(/[()]/g, "").trim() || "general";

            let title = r.title;
            if (!title) {
              if (r.section && r.field && r.field !== "(section)") {
                title = `${humanizeFieldName(r.field)} (${r.section})`;
              } else if (r.section) {
                title = `${r.section}${r.to === "added" ? " (New Section)" : r.to === "removed" ? " (Removed Section)" : ""}`;
              } else {
                title = humanizeFieldName(fieldName || screenId);
              }
            }

            let subtitle = r.subtitle;
            if (!subtitle) {
              if (r.field === "(section)" || isSectionEntry) {
                subtitle =
                  r.to === "added"
                    ? "New section added"
                    : r.to === "removed"
                      ? "Section removed"
                      : "Section modified";
              } else {
                subtitle =
                  formatDiffSubtitle(r.from, r.to) ||
                  "Modified from saved baseline";
              }
            }

            let safeTarget =
              r.targetId ||
              (r.field && r.field !== "(section)" ? r.field : r.section) ||
              null;
            if (safeTarget) safeTarget = String(safeTarget).trim();

            details.push({
              screenId,
              field: fieldName,
              title,
              subtitle,
              targetId: safeTarget,
            });
          }
        });
      } else {
        details.push({
          screenId,
          field: screenId,
          title: humanizeScreenTitle(screenId),
          subtitle: "Unsaved changes pending save to database",
          targetId: null,
        });
      }
    } catch (err) {
      console.warn("[dirtyGuard] Error in getAllDirtyReasonsDetailed:", err);
    }
  }
  // System/metadata fields that must NEVER trigger dirty guard / unsaved changes warnings
  const IGNORED_SYSTEM_FIELDS = new Set([
    "isdraft",
    "personalverified",
    "workloadverified",
    "lastverifiedat",
    "verifiedat",
    "createdat",
    "updatedat",
    "savedat",
    "timestamp",
    "source",
    "id",
    "_id",
    "schoolid",
    "schoolyear",
    "term",
    "activeterm",
    "nodestatus",
    "rawpayload",
    "matrixdata",
    "extras",
    // Internal aliases and derived flags (only direct UI controls should ever appear)
    "gradelevelstaught",
    "grade_levels_taught",
    "hasnoteachingload",
    "has_no_teaching_load",
    "teachesshs",
    "teaches_shs",
    "noteachingassignment",
    "plantillaposition",
    "plantilla_position",
    "positioncategory",
    "position_category",
    "ismainschoolhead",
    "is_main_school_head",
    "ismainsh",
    "is_main_sh",
    "isschoolhead",
    "is_school_head",
    "isshared",
    "is_shared",
    "isclustered",
    "is_clustered",
    "isreassigned",
    "is_reassigned",
    "fullname",
    "full_name",
    "age",
    "totalexperienceyears",
  ]);

  // Deduplicate entries by screen + canonical field/title so mirrors or companion N/A flags never show twice
  const seenKeys = new Set();
  const seenTitles = new Set();
  const deduplicated = [];
  for (const item of details) {
    const rawF = String(item.field || item.targetId || "")
      .replace(/^(no|has|is)/i, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();
    const rawTitle = String(item.title || "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();
    const exactField = String(item.field || "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();

    // Skip internal system metadata / verification flags
    if (
      IGNORED_SYSTEM_FIELDS.has(exactField) ||
      IGNORED_SYSTEM_FIELDS.has(rawTitle) ||
      IGNORED_SYSTEM_FIELDS.has(rawF)
    ) {
      continue;
    }

    const uniqueFieldKey = `${item.screenId}::${rawF}`;
    const uniqueTitleKey = `${item.screenId}::${rawTitle}`;

    if (rawTitle && seenTitles.has(uniqueTitleKey)) continue;
    if (rawF && seenKeys.has(uniqueFieldKey)) continue;

    if (rawF) seenKeys.add(uniqueFieldKey);
    if (rawTitle) seenTitles.add(uniqueTitleKey);
    deduplicated.push(item);
  }
  return deduplicated;
};

export const jumpToUnsavedTarget = (screenId, targetIdentifier) => {
  if (typeof document === "undefined") return;

  const config = guards.get(screenId);
  if (config && typeof config.onFocusField === "function") {
    try {
      config.onFocusField(targetIdentifier);
    } catch (e) {}
  }

  const findAndFocus = () => {
    const rawId = String(targetIdentifier || "").trim();
    const cleanId = rawId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    let el = null;

    // Safe querySelector wrapper that NEVER throws SyntaxError on invalid characters (like parentheses, slashes)
    const safeQuery = (selector) => {
      if (!selector || typeof selector !== "string") return null;
      try {
        return document.querySelector(selector);
      } catch (e) {
        return null;
      }
    };

    if (rawId) {
      try {
        el = document.getElementById(rawId);
      } catch (e) {}

      if (!el && typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        try {
          const escaped = CSS.escape(rawId);
          el =
            safeQuery(`[data-field="${escaped}"]`) ||
            safeQuery(`[data-section="${escaped}"]`) ||
            safeQuery(`[name="${escaped}"]`) ||
            safeQuery(`[id*="${escaped}"]`) ||
            safeQuery(`.${escaped}`);
        } catch (e) {}
      }

      if (!el) {
        const safeToken = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
        if (safeToken) {
          el =
            safeQuery(`[data-field*="${safeToken}"]`) ||
            safeQuery(`[data-section*="${safeToken}"]`) ||
            safeQuery(`[name*="${safeToken}"]`) ||
            safeQuery(`.${safeToken}`);
        }
      }
    }

    // Label-based fallback search (finds inputs, selects, SearchableDropdown by label text)
    if (!el && cleanId) {
      try {
        const labels = Array.from(document.querySelectorAll("label"));
        for (const label of labels) {
          const labelText = (label.textContent || "")
            .replace(/[^a-zA-Z0-9]/g, "")
            .toLowerCase();
          if (
            labelText &&
            (labelText.includes(cleanId) || cleanId.includes(labelText))
          ) {
            const parent = label.parentElement;
            if (parent) {
              el =
                parent.querySelector(".searchable-dropdown-container") ||
                parent.querySelector(".searchable-dropdown-toggle") ||
                parent.querySelector("input, select, textarea") ||
                parent;
              break;
            }
          }
        }
      } catch (e) {}
    }

    // Screen-specific fallback anchors
    if (!el && screenId === "workload") {
      el =
        safeQuery("#workload-draft-banner") ||
        safeQuery("#workload-timetable-grid") ||
        safeQuery(".gantt-schedule-container");
    } else if (!el && screenId === "personnel_profile") {
      el =
        safeQuery(".tab-content-active") ||
        safeQuery(".personnel-profile-form") ||
        safeQuery("form");
    } else if (!el && screenId === "organized_classes") {
      if (cleanId) {
        try {
          const rows = Array.from(
            document.querySelectorAll("tr, .section-card, .class-card"),
          );
          for (const row of rows) {
            const rowText = (row.textContent || "")
              .replace(/[^a-zA-Z0-9]/g, "")
              .toLowerCase();
            if (rowText.includes(cleanId) || cleanId.includes(rowText)) {
              el = row;
              break;
            }
          }
        } catch (e) {}
      }
      if (!el) {
        el =
          safeQuery(".organized-classes-card") ||
          safeQuery("table") ||
          safeQuery(".tab-content-active");
      }
    }

    if (el) {
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("unsaved-field-target-pulse");
        const focusable =
          el.querySelector?.(
            "input, select, textarea, button, .searchable-dropdown-toggle",
          ) || (typeof el.focus === "function" ? el : null);
        if (focusable && typeof focusable.focus === "function") {
          focusable.focus({ preventScroll: true });
        }
        setTimeout(() => {
          el.classList.remove("unsaved-field-target-pulse");
        }, 3600);
      } catch (e) {
        console.warn("[dirtyGuard] jumpToUnsavedTarget error:", e);
      }
    }
  };

  // Run with slight delay to allow tab/layout transitions to settle
  setTimeout(findAndFocus, 100);
};

/**
 * Render the SweetAlert2 unsaved changes confirmation modal.
 * When `onSave` is given a third button saves right from the dialog: the dialog shows its loading state, stays open
 * with the error if the save fails, and only closes (outcome 'saved') once the save is confirmed.
 * @param {{ actionType?: 'navigate' | 'logout' | 'tab', onSave?: () => Promise<{ ok: boolean, title?: string, message?: string }> }} options
 * @returns {Promise<'discard' | 'saved' | 'stay'>} 'discard' = "Discard & Leave", 'saved' = saved from the dialog, 'stay' = "Stay & Save"
 */
const openUnsavedChangesModal = async ({
  actionType = "navigate",
  onSave,
} = {}) => {
  const isLogout = actionType === "logout";
  const isTab = actionType === "tab";

  const dirtyDetails = getAllDirtyReasonsDetailed();

  if (dirtyDetails.length === 0 && typeof window !== "undefined") {
    const path = (window.location.pathname || "").toLowerCase();
    if (path.includes("workload") || path.includes("schedule")) {
      dirtyDetails.push({
        screenId: "workload",
        field: "workload-grid",
        title: "Workload Timetable",
        subtitle: "Schedule blocks or term changes not yet saved",
        targetId: "workload-timetable-grid",
      });
    } else if (path.includes("personnel")) {
      dirtyDetails.push({
        screenId: "personnel_profile",
        field: "profile-form",
        title: "Personnel Profile",
        subtitle: "Personnel details or assignments not yet saved",
        targetId: "personnel-profile-form",
      });
    } else if (path.includes("organized") || path.includes("class")) {
      dirtyDetails.push({
        screenId: "organized_classes",
        field: "classes-table",
        title: "Organized Classes & Sections",
        subtitle: "Section, learner count, or adviser edits not yet saved",
        targetId: "organized-classes-container",
      });
    } else if (path.includes("school")) {
      dirtyDetails.push({
        screenId: "school_profile",
        field: "school-form",
        title: "School Profile",
        subtitle: "School information changes not yet saved",
        targetId: "school-profile-form",
      });
    } else {
      dirtyDetails.push({
        screenId: "current_screen",
        field: "current_form",
        title: "Current Form Changes",
        subtitle: "Unsaved modifications on this page",
        targetId: null,
      });
    }
  }

  const title = "Unsaved Changes";
  const introText = isLogout
    ? "You have unsaved changes on this screen. Would you like to save your changes before logging out, or discard them?"
    : isTab
      ? "You have unsaved changes in this section. Would you like to save your changes before switching tabs, or discard them?"
      : "You have unsaved changes on this screen that have not been saved to the database.";

  let htmlContent = "";
  if (dirtyDetails.length > 0) {
    htmlContent = `
      <div style="font-size: 13.5px; color: #475569; margin-bottom: 12px; line-height: 1.5;">
        ${toSafeHtml(introText)}
      </div>

      <div class="swal-unsaved-container" style="
        background: #F8FAFC;
        border: 1.5px solid #E2E8F0;
        border-radius: 12px;
        padding: 10px;
        margin-bottom: 14px;
        max-height: 220px;
        overflow-y: auto;
        text-align: left;
      ">
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 4px 8px 4px;
          border-bottom: 1px solid #E2E8F0;
          margin-bottom: 8px;
        ">
          <span style="font-size: 11px; font-weight: 800; color: #B45309; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 5px;">
            <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #F59E0B;"></span>
            Modified Data (${dirtyDetails.length})
          </span>
          <span style="font-size: 10px; font-weight: 600; color: #64748B;">
            Click item to jump directly
          </span>
        </div>

        ${dirtyDetails
          .map(
            (item) => `
          <div class="swal-unsaved-item" data-field="${toSafeHtml(item.field || "")}" data-screen="${toSafeHtml(item.screenId || "")}" data-target="${toSafeHtml(item.targetId || "")}" style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 8px 10px;
            margin-bottom: 6px;
            background: #FFFFFF;
            border: 1.5px solid #FED7AA;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.15s ease;
          ">
            <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: #F59E0B; flex-shrink: 0;"></span>
              <div style="min-width: 0; flex: 1;">
                <div style="font-size: 12px; font-weight: 700; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${toSafeHtml(item.title)}
                </div>
                <div style="font-size: 10.5px; color: #B45309; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px;">
                  ${toSafeHtml(item.subtitle)}
                </div>
              </div>
            </div>
            <span style="
              font-size: 10px;
              font-weight: 700;
              color: #2563EB;
              background: #EFF6FF;
              border: 1px solid #BFDBFE;
              padding: 2px 7px;
              border-radius: 10px;
              white-space: nowrap;
              flex-shrink: 0;
            ">
              Jump to item →
            </span>
          </div>
        `,
          )
          .join("")}
      </div>

      <div style="font-size: 12px; color: #64748B; line-height: 1.4;">
        Would you like to save your changes, or discard them?
      </div>
    `;
  }

  const [{ default: Swal }] = await Promise.all([
    import("sweetalert2"),
    import("sweetalert2/dist/sweetalert2.min.css"),
  ]);

  const swalConfig = {
    title,
    icon: "warning",
    iconColor: "#D97706",
    showCloseButton: true,
    showCancelButton: false,
    showDenyButton: typeof onSave === "function",
    denyButtonText: "Save Changes",
    denyButtonColor: "#15803D",
    confirmButtonText: "Discard Changes",
    confirmButtonColor: "#DC2626",
    reverseButtons: true,
    focusDeny: true,
    allowOutsideClick: false,
    allowEscapeKey: true,
    customClass: {
      popup: "insighted-swal-modal",
      title: "insighted-swal-title",
      htmlContainer: "insighted-swal-text",
      confirmButton: "insighted-swal-discard-btn",
      denyButton: "insighted-swal-save-btn",
    },
    preDeny: async () => {
      let result;
      try {
        result = await onSave();
      } catch (err) {
        result = {
          ok: false,
          message: (err && err.message) || "The save failed. Please try again.",
          error: err,
        };
      }
      if (!result || result.ok !== true) {
        const heading = result.title
          ? `<strong>${toSafeHtml(result.title)}</strong><br>`
          : "";
        const failure = (result && result.error) || takeRecentApiError();
        if (failure) markErrorHandled(failure);
        const detail = failure
          ? `<div style="margin-top:6px;font-size:11px;font-family:ui-monospace,Consolas,monospace;text-align:left">${inlineDetailsHtml(failure)}</div>`
          : "";
        Swal.showValidationMessage(
          heading +
            toSafeHtml(
              (result && result.message) ||
                "The save did not report success, so nothing was cleared. Please try again.",
            ) +
            detail,
        );
        return false;
      }
      return "saved";
    },
  };

  if (htmlContent) {
    swalConfig.html = htmlContent;
    swalConfig.didRender = (popup) => {
      const items = popup.querySelectorAll(".swal-unsaved-item");
      items.forEach((el) => {
        el.addEventListener("mouseenter", () => {
          el.style.borderColor = "#F59E0B";
          el.style.backgroundColor = "#FFFBEB";
          el.style.transform = "translateX(2px)";
          el.style.boxShadow = "0 2px 6px rgba(245, 158, 11, 0.15)";
        });
        el.addEventListener("mouseleave", () => {
          el.style.borderColor = "#FED7AA";
          el.style.backgroundColor = "#FFFFFF";
          el.style.transform = "translateX(0)";
          el.style.boxShadow = "none";
        });
        el.addEventListener("click", () => {
          const fieldId = el.getAttribute("data-field");
          const targetId = el.getAttribute("data-target");
          const screenId = el.getAttribute("data-screen");
          Swal.close({ isDismissed: true });
          setTimeout(() => {
            jumpToUnsavedTarget(screenId, targetId || fieldId);
          }, 80);
        });
      });
    };
  } else {
    swalConfig.text = isLogout
      ? "You have unsaved changes on this screen. Would you like to save your changes before logging out, or discard them?"
      : isTab
        ? "You have unsaved changes in this section. Would you like to save your changes before switching tabs, or discard them?"
        : "You have unsaved changes on this screen that have not been saved to the database. Would you like to save your changes, or discard them?";
  }

  const result = await Swal.fire(swalConfig);

  if (result.isDenied) return "saved";
  return result.isConfirmed ? "discard" : "stay";
};

let unsavedModalInFlight = null;

/** Only one unsaved-changes dialog can be open: a second trigger (click + back button, double click) shares it. */
export const showUnsavedChangesModal = (options = {}) => {
  if (!unsavedModalInFlight) {
    unsavedModalInFlight = openUnsavedChangesModal(options).finally(() => {
      unsavedModalInFlight = null;
    });
  }
  return unsavedModalInFlight;
};

/**
 * Asks which version of a teacher's workload to keep when the saved (database) rows and the local unsaved copy
 * disagree. Nothing is overwritten until the user chooses; the dialog cannot be dismissed without a choice.
 * @param {{ teacherName?: string, term?: string }} options
 * @returns {Promise<'local' | 'database'>}
 */
export const showWorkloadVersionConflictModal = async ({
  teacherName = "this teacher",
  term = "",
} = {}) => {
  const [{ default: Swal }] = await Promise.all([
    import("sweetalert2"),
    import("sweetalert2/dist/sweetalert2.min.css"),
  ]);
  const result = await Swal.fire({
    title: "Unsaved Changes",
    text: `The workload for ${teacherName}${term ? ` (${term} Term)` : ""} on this device is different from what is saved in the database, which may have been updated from another browser or device. Which version would you like to keep?`,
    icon: "warning",
    iconColor: "#D97706",
    showCancelButton: false,
    showDenyButton: true,
    confirmButtonText: "Keep My Changes",
    denyButtonText: "Use Database Version",
    confirmButtonColor: "#2563EB",
    denyButtonColor: "#DC2626",
    reverseButtons: true,
    focusConfirm: true,
    allowOutsideClick: false,
    allowEscapeKey: false,
    customClass: {
      popup: "insighted-swal-modal",
      title: "insighted-swal-title",
      htmlContainer: "insighted-swal-text",
      confirmButton: "insighted-swal-stay-btn",
      denyButton: "insighted-swal-discard-btn",
    },
  });
  return result.isConfirmed ? "local" : "database";
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Shown when a browser draft holds newer or additional workload compared with the saved (database) rows.
 * Nothing is applied until the user answers. 'restore' = put the draft's changes into the editor;
 * 'database' = show the saved rows (the draft is left in the browser, untouched).
 * @param {{ teacherName?: string, term?: string, summary?: { added?: number, changed?: number, removed?: number, overlapsReplaced?: number, conflicts?: number } }} options
 * @returns {Promise<'restore' | 'database'>}
 */
export const showWorkloadRestoreModal = async ({
  teacherName = "this teacher",
  term = "",
  summary = {},
} = {}) => {
  const [{ default: Swal }] = await Promise.all([
    import("sweetalert2"),
    import("sweetalert2/dist/sweetalert2.min.css"),
  ]);
  const lines = [];
  if (summary.added)
    lines.push(`${plural(summary.added, "block")} would be added`);
  if (summary.changed)
    lines.push(`${plural(summary.changed, "block")} would be changed`);
  if (summary.removed)
    lines.push(`${plural(summary.removed, "block")} would be removed`);
  if (summary.overlapsReplaced)
    lines.push(
      `${plural(summary.overlapsReplaced, "saved block")} overlapping them would be replaced`,
    );
  if (summary.conflicts)
    lines.push(
      `${plural(summary.conflicts, "block")} also changed in the database (your version would be kept)`,
    );
  const escape = (text) =>
    String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const list =
    lines.length > 0
      ? `<ul style="text-align:left;margin:10px auto 0;display:inline-block;padding-left:18px">${lines.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>`
      : "";
  const result = await Swal.fire({
    title: "Unsaved Changes Found",
    html: `<div>We found newer or additional unsaved workload for <strong>${escape(teacherName)}</strong>${term ? ` (${escape(term)} Term)` : ""} in this browser. Restore it into the editor?<br><span style="font-size:12px">Compared with the saved database rows:</span></div>${list}`,
    icon: "warning",
    iconColor: "#D97706",
    showCancelButton: false,
    showDenyButton: true,
    confirmButtonText: "Keep My Changes",
    denyButtonText: "Use Database Version",
    confirmButtonColor: "#2563EB",
    denyButtonColor: "#DC2626",
    reverseButtons: true,
    focusConfirm: true,
    allowOutsideClick: false,
    allowEscapeKey: false,
    customClass: {
      popup: "insighted-swal-modal",
      title: "insighted-swal-title",
      htmlContainer: "insighted-swal-text",
      confirmButton: "insighted-swal-stay-btn",
      denyButton: "insighted-swal-discard-btn",
    },
  });
  return result.isConfirmed ? "restore" : "database";
};

let leaveCheckInFlight = null;

/**
 * Global navigation / action guard. Call before route changes, tab/sub-selection switches, or logout.
 * Resolves 'clean' (nothing unsaved, no dialog), 'saved' (saved from the dialog and confirmed by the server),
 * 'discard' (drafts dropped) or 'stay' (the user stays; nothing changed).
 * If a dialog is already open, a second trigger for the same navigation (e.g. a click and a browser-back event)
 * shares it instead of opening another one.
 * @param {{ actionType?: 'navigate' | 'logout' | 'tab' }} options
 * @returns {Promise<'clean' | 'saved' | 'discard' | 'stay'>}
 */
export const checkBeforeLeaveDetailed = ({ actionType = "navigate" } = {}) => {
  if (leaveCheckInFlight) return leaveCheckInFlight;
  if (!isAnyScreenDirty()) return Promise.resolve("clean");

  leaveCheckInFlight = (async () => {
    // Offer "Save" only when every dirty screen knows how to save itself.
    const dirtyConfigs = [...guards.values()].filter((config) => {
      try {
        return typeof config.isDirty === "function"
          ? config.isDirty()
          : Boolean(config.isDirty);
      } catch (err) {
        return false;
      }
    });
    const canSave =
      dirtyConfigs.length > 0 &&
      dirtyConfigs.every((config) => typeof config.onSave === "function");
    const onSave = canSave
      ? async () => {
          for (const config of dirtyConfigs) {
            const result = await config.onSave();
            if (result && result.ok === false) return result;
          }
          return { ok: true };
        }
      : undefined;

    const outcome = await showUnsavedChangesModal({ actionType, onSave });
    if (outcome === "discard") {
      discardAllDirtyScreens();
      return "discard";
    }
    if (outcome === "saved") {
      syncBeforeUnloadListener();
      return "saved";
    }
    return "stay";
  })().finally(() => {
    leaveCheckInFlight = null;
  });

  return leaveCheckInFlight;
};

/**
 * Boolean form of checkBeforeLeaveDetailed: true = the user may leave, false = stay on the page.
 * @param {{ actionType?: 'navigate' | 'logout' | 'tab' }} options
 * @returns {Promise<boolean>}
 */
export const checkBeforeLeave = async (options = {}) =>
  (await checkBeforeLeaveDetailed(options)) !== "stay";
