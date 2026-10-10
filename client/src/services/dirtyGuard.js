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
        console.warn(`[dirtyGuard] Error running onFlush for screen ${screenId}:`, err);
      }
    }
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("blur", () => {
    flushAllDirtyGuards().catch(() => {});
  });
  window.addEventListener("focusout", (e) => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) {
      flushAllDirtyGuards().catch(() => {});
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

  const title = "Unsaved Changes";
  const text = isLogout
    ? "You have unsaved changes on this screen. If you log out now, your unsaved changes will be lost. Would you like to stay and save them, or discard and log out anyway?"
    : isTab
      ? "You have unsaved changes in this section. If you switch tabs, your unsaved changes will be lost. Would you like to stay and save them, or discard and switch anyway?"
      : "You have unsaved changes on this screen that have not been saved to the database. Would you like to stay and save them, or discard and leave anyway?";

  const confirmButtonText = isLogout ? "Discard & Log Out" : "Discard & Leave";
  const saveButtonText = isLogout
    ? "Save & Log Out"
    : isTab
      ? "Save & Switch"
      : "Save & Leave";

  const [{ default: Swal }] = await Promise.all([
    import("sweetalert2"),
    import("sweetalert2/dist/sweetalert2.min.css"),
  ]);

  const result = await Swal.fire({
    title,
    text,
    icon: "warning",
    iconColor: "#D97706",
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: "Stay & Save",
    confirmButtonColor: "#DC2626",
    cancelButtonColor: "#2563EB",
    showDenyButton: typeof onSave === "function",
    denyButtonText: saveButtonText,
    denyButtonColor: "#15803D",
    // Runs while the deny button shows its loader; returning false keeps the dialog open.
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
      // Only an explicit { ok: true } counts as saved: a missing or malformed result keeps the dialog open.
      if (!result || result.ok !== true) {
        const heading = result.title
          ? `<strong>${toSafeHtml(result.title)}</strong><br>`
          : "";
        // Same facts as the global error dialog: the failure that just happened, shown inside this dialog (so no 2nd dialog).
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
    reverseButtons: true,
    focusCancel: true,
    allowOutsideClick: false,
    allowEscapeKey: false,
    customClass: {
      popup: "insighted-swal-modal",
      title: "insighted-swal-title",
      htmlContainer: "insighted-swal-text",
      confirmButton: "insighted-swal-discard-btn",
      cancelButton: "insighted-swal-stay-btn",
      denyButton: "insighted-swal-save-btn",
    },
  });

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
