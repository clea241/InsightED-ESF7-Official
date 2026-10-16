import { openDB } from "idb";
import { reportError } from "./errorAlert";

const DB_NAME = "insighted_esf7_outbox";
const STORE_NAME = "outbox";
const FALLBACK_KEY = "insighted_outbox_fallback";
const CHANNEL_NAME = "insighted_outbox_channel";

let cachedDbPromise = null;
const listeners = new Set();

const channel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(CHANNEL_NAME)
    : null;

if (channel) {
  channel.onmessage = (event) => {
    if (event?.data?.type === "OUTBOX_UPDATED") {
      notifyListeners();
    }
  };
}

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.warn("[Outbox] Error notifying listener:", e);
    }
  });
}

function broadcastChange() {
  notifyListeners();
  try {
    channel?.postMessage({ type: "OUTBOX_UPDATED", timestamp: Date.now() });
  } catch (e) {}
  getOutboxEntries({ kind: "failed" })
    .then((failed) => syncBeforeUnloadOnFailedState(failed.length > 0))
    .catch(() => {});
}

function getStorage() {
  if (typeof window !== "undefined" && window.localStorage)
    return window.localStorage;
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

async function getDB() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this environment");
  }
  if (!cachedDbPromise) {
    cachedDbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("by_stable_key", "stableKey", { unique: false });
          store.createIndex("by_school_user", ["schoolId", "user"], {
            unique: false,
          });
        }
      },
      terminated() {
        cachedDbPromise = null;
      },
    }).catch((err) => {
      cachedDbPromise = null;
      throw err;
    });
  }
  return cachedDbPromise;
}

// Fallback to localStorage if IndexedDB is blocked or unavailable
function getFallbackList() {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(FALLBACK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function setFallbackList(list) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(FALLBACK_KEY, JSON.stringify(list));
  } catch (e) {
    if (isQuotaError(e)) {
      handleQuotaExceeded(e, list);
    }
  }
}

function isQuotaError(err) {
  if (!err) return false;
  return (
    err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    String(err.message || "")
      .toLowerCase()
      .includes("quota")
  );
}

/**
 * Trigger browser file download of unsent outbox data as a JSON file.
 */
export function exportOutboxToJson(entries, filename = null) {
  try {
    const safeFilename =
      filename ||
      `esf7_unsent_data_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const blob = new Blob([JSON.stringify(entries, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error("[Outbox] Failed to export JSON:", err);
    return false;
  }
}

/**
 * Handle storage quota exceeded: report with SweetAlert and offer Download unsent data (.json).
 */
async function handleQuotaExceeded(error, unsentPayload) {
  try {
    const [{ default: Swal }] = await Promise.all([
      import("sweetalert2"),
      import("sweetalert2/dist/sweetalert2.min.css"),
    ]);

    const errorDetails = `Error: Storage quota exceeded\nTime: ${new Date().toISOString()}\nMessage: ${error?.message || "Browser local storage is full."}`;

    await Swal.fire({
      title: "Storage Quota Exceeded",
      html: `
        <div style="text-align: left; font-size: 13px; color: #374151;">
          <p style="margin-bottom: 8px;">Your device browser storage has reached its capacity limit. To protect your unsaved changes from being lost, you can download your unsent data file directly.</p>
          <pre style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 8px 10px; border-radius: 6px; font-size: 11px; max-height: 120px; overflow: auto; word-break: break-word;">${errorDetails}</pre>
        </div>
      `,
      icon: "error",
      iconColor: "#DC2626",
      showCancelButton: true,
      confirmButtonText: "Download unsent data (.json)",
      cancelButtonText: "Copy Details",
      confirmButtonColor: "#059669",
      cancelButtonColor: "#4B5563",
      showDenyButton: true,
      denyButtonText: "Close",
      denyButtonColor: "#9CA3AF",
    }).then((result) => {
      if (result.isConfirmed) {
        exportOutboxToJson(unsentPayload);
      } else if (result.dismiss === Swal.DismissReason.cancel) {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText(errorDetails);
        }
      }
    });
  } catch (e) {
    console.error("[Outbox] Error displaying quota alert:", e);
  }
}

/**
 * Generate a coalescing stable key for an outbox entry.
 * (school + user + term + module + personnelId)
 */
export function buildStableKey({
  schoolId,
  user,
  term,
  module,
  personnelId = null,
}) {
  const sid = String(schoolId || "")
    .trim()
    .toLowerCase();
  const usr = String(user || "")
    .trim()
    .toLowerCase();
  const t = String(term || "")
    .trim()
    .toLowerCase();
  const mod = String(module || "")
    .trim()
    .toLowerCase();
  const pid = personnelId
    ? `::${String(personnelId).trim().toLowerCase()}`
    : "";
  return `${sid}::${usr}::${t}::${mod}${pid}`;
}

/**
 * Generate uuid v4
 */
export function generateMutationId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Upsert an entry in the outbox.
 * Coalesces by stable key (school + user + term + module + personnelId) so newer edits replace older ones.
 */
export async function upsertOutboxEntry({
  id = null,
  kind = "unsaved", // 'failed' | 'unsaved'
  schoolId,
  user,
  schoolYear = "SY 26-27",
  term = null,
  module,
  personnelId = null,
  endpoint,
  payload,
  baseVersion = null,
  lastError = null,
  attempts = 0,
}) {
  if (!module || !payload) return null;

  const stableKey = buildStableKey({
    schoolId,
    user,
    term,
    module,
    personnelId,
  });
  const mutationId = id || generateMutationId();
  const now = new Date().toISOString();

  const entry = {
    id: mutationId,
    kind,
    schoolId: String(schoolId || ""),
    user: String(user || ""),
    schoolYear: String(schoolYear || "SY 26-27"),
    term: term ? String(term) : null,
    module: String(module),
    personnelId: personnelId ? String(personnelId) : null,
    endpoint: String(endpoint || ""),
    payload,
    baseVersion: baseVersion ?? null,
    lastError: lastError ? String(lastError) : null,
    attempts:
      typeof attempts === "number" ? attempts : kind === "failed" ? 1 : 0,
    createdAt: now,
    updatedAt: now,
    stableKey,
  };

  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // Look for existing entry with the same stable key to coalesce
    let existingId = null;
    let cursor = await store.index("by_stable_key").openCursor(stableKey);
    while (cursor) {
      existingId = cursor.value.id;
      // Preserve original createdAt and accumulate attempts if coalescing with existing failed entry
      if (cursor.value.createdAt) {
        entry.createdAt = cursor.value.createdAt;
      }
      if (cursor.value.attempts && kind === "failed") {
        entry.attempts = Math.max(entry.attempts, cursor.value.attempts);
      }
      await cursor.delete();
      cursor = await cursor.continue();
    }

    if (existingId) {
      entry.id = existingId;
    }

    await store.put(entry);
    await tx.done;
    broadcastChange();
    return entry;
  } catch (err) {
    if (isQuotaError(err)) {
      handleQuotaExceeded(err, entry);
    }
    console.warn(
      "[Outbox] IndexedDB upsert failed, writing to localStorage fallback:",
      err,
    );

    try {
      const list = getFallbackList();
      const filtered = list.filter((item) => item.stableKey !== stableKey);
      filtered.push(entry);
      setFallbackList(filtered);
      broadcastChange();
      return entry;
    } catch (fbErr) {
      console.error("[Outbox] Dual storage failure on upsert:", fbErr);
      reportError(fbErr, {
        action: `Saving outbox entry for ${module}`,
        handler: "upsertOutboxEntry",
        schoolId,
      });
      return null;
    }
  }
}

/**
 * Remove an entry from the outbox by ID.
 */
export async function removeOutboxEntry(id) {
  if (!id) return;
  try {
    const db = await getDB();
    await db.delete(STORE_NAME, id);
    broadcastChange();
  } catch (err) {
    console.warn(
      "[Outbox] IndexedDB delete failed, falling back to localStorage:",
      err,
    );
  }

  try {
    const list = getFallbackList();
    const updated = list.filter((item) => item.id !== id);
    if (updated.length !== list.length) {
      setFallbackList(updated);
      broadcastChange();
    }
  } catch (e) {}
}

let hasFailedEntriesGlobal = false;
let isBeforeUnloadAttached = false;

function beforeUnloadFailedHandler(e) {
  if (hasFailedEntriesGlobal) {
    e.preventDefault();
    e.returnValue = "";
    return "";
  }
}

export function syncBeforeUnloadOnFailedState(hasFailed) {
  hasFailedEntriesGlobal = Boolean(hasFailed);
  if (typeof window === "undefined") return;
  if (hasFailedEntriesGlobal && !isBeforeUnloadAttached) {
    window.addEventListener("beforeunload", beforeUnloadFailedHandler);
    isBeforeUnloadAttached = true;
  } else if (!hasFailedEntriesGlobal && isBeforeUnloadAttached) {
    window.removeEventListener("beforeunload", beforeUnloadFailedHandler);
    isBeforeUnloadAttached = false;
  }
}

/**
 * Remove an entry by its stable key components or options object.
 */
export async function removeOutboxEntryByModule(
  arg1,
  user,
  module,
  term = null,
  personnelId = null,
) {
  let sId, usr, mod, t, pid;
  if (typeof arg1 === "object" && arg1 !== null) {
    sId = arg1.schoolId;
    usr = arg1.user;
    mod = arg1.module;
    t = arg1.term;
    pid = arg1.personnelId;
  } else {
    sId = arg1;
    usr = user;
    mod = module;
    t = term;
    pid = personnelId;
  }
  const targetKey = buildStableKey({
    schoolId: sId,
    user: usr,
    term: t,
    module: mod,
    personnelId: pid,
  });
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    let cursor = await store.index("by_stable_key").openCursor(targetKey);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    // Also if pid was provided, clean up any lingering entry matching personnelId and module
    if (pid) {
      const allEntries = await store.getAll();
      for (const entry of allEntries) {
        if (
          entry.module === mod &&
          String(entry.personnelId || "").toLowerCase() ===
            String(pid).toLowerCase()
        ) {
          await store.delete(entry.id);
        }
      }
    }
    await tx.done;
    broadcastChange();
  } catch (err) {
    console.warn("[Outbox] Error removing by module from IndexedDB:", err);
  }

  try {
    const list = getFallbackList();
    const updated = list.filter((item) => {
      if (item.stableKey === targetKey) return false;
      if (
        pid &&
        item.module === mod &&
        String(item.personnelId || "").toLowerCase() ===
          String(pid).toLowerCase()
      ) {
        return false;
      }
      return true;
    });
    if (updated.length !== list.length) {
      setFallbackList(updated);
      broadcastChange();
    }
  } catch (e) {}
}

/**
 * List all entries in the outbox, optionally filtered by user and school.
 */
export async function getOutboxEntries(filter = {}) {
  let entries = [];
  try {
    const db = await getDB();
    entries = await db.getAll(STORE_NAME);
  } catch (err) {
    console.warn(
      "[Outbox] IndexedDB read failed, falling back to localStorage:",
      err,
    );
    entries = getFallbackList();
  }

  if (entries.length === 0) {
    const fb = getFallbackList();
    if (fb.length > 0) entries = fb;
  }

  if (filter.schoolId) {
    const cleanSid = String(filter.schoolId).trim().toLowerCase();
    entries = entries.filter(
      (e) => String(e.schoolId).trim().toLowerCase() === cleanSid,
    );
  }
  if (filter.user) {
    const cleanUser = String(filter.user).trim().toLowerCase();
    entries = entries.filter(
      (e) => String(e.user).trim().toLowerCase() === cleanUser,
    );
  }
  if (filter.kind) {
    entries = entries.filter((e) => e.kind === filter.kind);
  }
  if (filter.module) {
    entries = entries.filter((e) => e.module === filter.module);
  }
  if (filter.personnelId) {
    const cleanPid = String(filter.personnelId).trim().toLowerCase();
    entries = entries.filter(
      (e) =>
        String(e.personnelId || "")
          .trim()
          .toLowerCase() === cleanPid,
    );
  }

  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  return entries.map((entry) => {
    const age = now - new Date(entry.createdAt || now).getTime();
    return {
      ...entry,
      isOld: age > thirtyDaysMs,
    };
  });
}

/**
 * Increment attempt count and record last error for a failed save retry.
 */
export async function markOutboxAttempt(id, { error }) {
  if (!id) return;
  const errMsg =
    error?.message ||
    (typeof error === "string" ? error : "Unknown save error");
  try {
    const db = await getDB();
    const entry = await db.get(STORE_NAME, id);
    if (entry) {
      entry.attempts = (entry.attempts || 0) + 1;
      entry.lastError = errMsg;
      entry.kind = "failed";
      entry.updatedAt = new Date().toISOString();
      await db.put(STORE_NAME, entry);
      broadcastChange();
      return entry;
    }
  } catch (err) {
    console.warn("[Outbox] Failed to mark attempt in IndexedDB:", err);
  }

  try {
    const list = getFallbackList();
    const idx = list.findIndex((e) => e.id === id);
    if (idx !== -1) {
      list[idx].attempts = (list[idx].attempts || 0) + 1;
      list[idx].lastError = errMsg;
      list[idx].kind = "failed";
      list[idx].updatedAt = new Date().toISOString();
      setFallbackList(list);
      broadcastChange();
      return list[idx];
    }
  } catch (e) {}
  return null;
}

/**
 * Check if the user has any failed outbox entries (for logout / beforeunload warning).
 */
export async function hasFailedEntries(schoolId, user) {
  const list = await getOutboxEntries({ schoolId, user, kind: "failed" });
  return list.length > 0;
}

/**
 * Subscribe to outbox changes.
 */
export function subscribeOutbox(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Reconcile outbox entries with the database after initial data loads:
 * 1. Ownership: filter by schoolId and user.
 * 2. Identical to DB: normalized comparison, delete silently.
 * 3. Differs, server record has NOT changed since baseVersion: keep in queue.
 * 4. Differs, server record HAS changed since baseVersion: flag as inConflict.
 */
export async function reconcileOutboxWithDatabase({
  schoolId,
  user,
  dbBaseline = {},
  currentServerVersions = {},
}) {
  if (!schoolId || !user) return [];
  const entries = await getOutboxEntries({ schoolId, user });
  const remaining = [];

  const normalizeJson = (obj) => {
    if (!obj) return "";
    try {
      return JSON.stringify(obj);
    } catch (e) {
      return "";
    }
  };

  for (const entry of entries) {
    const mod = entry.module;
    const dbSection = dbBaseline[mod];

    // If identical to database, save effectively completed: delete silently
    if (
      dbSection &&
      normalizeJson(entry.payload) === normalizeJson(dbSection)
    ) {
      await removeOutboxEntry(entry.id);
      continue;
    }

    // Check conflict: server version has bumped past entry's baseVersion
    const currentVer = currentServerVersions[mod];
    if (
      currentVer != null &&
      entry.baseVersion != null &&
      Number(currentVer) > Number(entry.baseVersion)
    ) {
      entry.inConflict = true;
    }

    remaining.push(entry);
  }

  return remaining;
}

/**
 * Resolve conflict for an outbox entry:
 * decision: 'keep_server' (discard queued entry) or 'keep_queued' (clear conflict flag so it can be retried)
 */
export async function resolveOutboxConflict(id, decision) {
  if (!id) return false;
  if (decision === "keep_server") {
    await removeOutboxEntry(id);
    return true;
  }
  if (decision === "keep_queued") {
    try {
      const db = await getDB();
      const entry = await db.get(STORE_NAME, id);
      if (entry) {
        entry.inConflict = false;
        await db.put(STORE_NAME, entry);
        broadcastChange();
        return true;
      }
    } catch (e) {}

    try {
      const list = getFallbackList();
      const idx = list.findIndex((e) => e.id === id);
      if (idx !== -1) {
        list[idx].inConflict = false;
        setFallbackList(list);
        broadcastChange();
        return true;
      }
    } catch (e) {}
  }
  return false;
}

/**
 * Retry sending an outbox entry through the awaited, idempotent save path.
 * On verified success: removes entry from outbox immediately.
 * On error: increments attempts, updates lastError, and displays SweetAlert error modal.
 */
export async function retryOutboxEntry(entryOrId) {
  if (!entryOrId) return { success: false, error: "No entry" };
  let entry = entryOrId;
  if (typeof entryOrId === "string") {
    const list = await getOutboxEntries({});
    entry = list.find((e) => e.id === entryOrId);
    if (!entry) return { success: false, error: "Entry not found" };
  }
  const { api } = await import("./api.js");
  try {
    let res = null;
    const mod = entry.module;
    if (mod === "school_profile") {
      res = await api.updateCurricularConfig(entry.payload);
      if (!res || res.success !== true) {
        throw new Error(
          res?.error || "Server did not confirm school configuration save",
        );
      }
    } else if (mod === "workload") {
      res = await api.saveWorkloadBatch(entry.payload);
      if (!res || res.success !== true) {
        throw new Error(res?.error || "Server did not confirm workload save");
      }
    } else if (
      mod === "personnel_roster" ||
      mod === "roster" ||
      mod === "personnel_profile" ||
      mod === "personnel_identity" ||
      mod === "personnel_employment" ||
      mod === "personnel_education" ||
      mod === "personnel_ld" ||
      mod === "personnel_learning_area" ||
      mod === "personnel_learning_areas" ||
      mod === "personnel"
    ) {
      const targetId =
        entry.personnelId || entry.payload?.id || entry.payload?.personnelId;
      if (Array.isArray(entry.payload)) {
        res = await api.saveBulkPersonnel(
          entry.payload,
          entry.schoolId,
          entry.schoolYear,
        );
      } else if (targetId && api.updatePersonnel) {
        res = await api.updatePersonnel(targetId, {
          ...entry.payload,
          school_id: entry.schoolId,
          school_year: entry.schoolYear || "2026-2027",
        });
      } else if (targetId && api.savePersonnelChanges) {
        res = await api.savePersonnelChanges(targetId, entry.payload);
      } else {
        res = await api.saveBulkPersonnel(
          [entry.payload],
          entry.schoolId,
          entry.schoolYear,
        );
      }
    } else if (mod === "organized_classes" || mod === "sections") {
      const sy = entry.schoolYear || "SY 26-27";
      const sections = Array.isArray(entry.payload)
        ? entry.payload
        : entry.payload?.sections || [];
      const regSecs = sections.filter(
        (s) => !api.sectionKind || api.sectionKind(s) === "regular",
      );
      const otherSecs = sections.filter(
        (s) => api.sectionKind && api.sectionKind(s) !== "regular",
      );

      if (regSecs.length > 0 && api.syncRegularSections) {
        await api.syncRegularSections({
          schoolId: entry.schoolId,
          schoolYear: sy,
          sections: regSecs,
          deletedIds: [],
        });
      }
      for (const s of otherSecs) {
        if (api.addSection) {
          await api.addSection({
            ...s,
            schoolId: entry.schoolId,
            schoolYear: sy,
          });
        }
      }
      res = { success: true };
    } else if (entry.endpoint) {
      const { fetchWithAuth, API_BASE } = await import("./api.js");
      const url = entry.endpoint.startsWith("http")
        ? entry.endpoint
        : `${API_BASE}${entry.endpoint.startsWith("/") ? "" : "/"}${entry.endpoint}`;
      const response = await fetchWithAuth(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.payload),
      });
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
      res = await response.json().catch(() => ({ success: true }));
    } else {
      throw new Error(`Cannot retry: unknown module "${mod}"`);
    }

    // Success: remove from outbox right away
    await removeOutboxEntry(entry.id);
    return { success: true, data: res };
  } catch (err) {
    await markOutboxAttempt(entry.id, { error: err });
    const { reportError } = await import("./errorAlert.js");
    reportError(err, {
      action: `Retrying save for ${entry.module}`,
      handler: "retryOutboxEntry",
      schoolId: entry.schoolId,
    });
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * One-time legacy cleanup:
 * Inspect old localStorage draft/backup keys. If any hold data that differs from DB,
 * move into outbox as 'unsaved' ("Recovered") entries, then delete legacy keys.
 */
export async function runOneTimeLegacyCleanup({
  schoolId,
  user,
  schoolYear = "SY 26-27",
  dbBaseline = {},
}) {
  if (typeof window === "undefined" || !window.localStorage) return;
  const marker = `insighted_legacy_cleanup_done_${schoolId}`;
  if (localStorage.getItem(marker)) return;

  const legacyPrefixes = [
    `draft_${schoolId}`,
    `draft_personnel_${schoolId}`,
    `draft_workload_${schoolId}`,
    `insighted_fallback_draft_${schoolId}`,
    `insighted_school_curricular_config_${schoolId}`,
    `draft_sections`,
  ];

  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      const matches =
        legacyPrefixes.some((p) => key.startsWith(p)) ||
        key.startsWith("draft_personnel_") ||
        key.startsWith("draft_workload_") ||
        key.startsWith("draft_learning_areas_");

      if (matches) {
        localStorage.removeItem(key);
      }
    }
    localStorage.setItem(marker, "1");
  } catch (err) {
    console.warn("[Outbox] Legacy cleanup notice:", err);
  }
}

/**
 * Always keep the database version without prompting the user with an "Unsent Changes Available" modal.
 * Any stale non-offline outbox entries for this section are automatically purged so the database remains authoritative.
 */
export async function checkAndPromptOutboxOnSectionOpen({
  schoolId,
  user,
  module,
  term = null,
}) {
  if (!schoolId || !module) return false;

  try {
    const entries = await getOutboxEntries({ schoolId, user, module });
    for (const e of entries) {
      if (!term || e.term === term) {
        if (e.kind !== "offline") {
          await removeOutboxEntry(e.id).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.warn("[Outbox] Error cleaning stale outbox on section open:", err);
  }
  return false;
}

/**
 * Automatically applies and syncs a genuine offline outbox entry when opening a section.
 * Stale "unsaved" or "failed" entries (or entries older than dbUpdatedAt) are discarded so the database version always wins.
 */
export async function autoSyncOutboxOnSectionOpen({
  schoolId,
  user,
  module,
  personnelId = null,
  term = null,
  dbUpdatedAt = null,
  onLoadPayload,
  onSynced,
  showNotice = true,
}) {
  if (!schoolId || !module) return false;

  const filter = { schoolId, module };
  if (personnelId) filter.personnelId = personnelId;
  if (user) filter.user = user;

  const entries = await getOutboxEntries(filter);
  const entry = entries.find((e) => (term ? e.term === term : true));
  if (!entry || !entry.payload) return false;

  // Always keep database version if entry is not a genuine offline queue item
  // or if the database timestamp is newer than or equal to the queued entry.
  const dbTime = dbUpdatedAt ? new Date(dbUpdatedAt).getTime() : 0;
  const entryTime = entry.updatedAt || entry.createdAt || 0;
  if (entry.kind !== "offline" || (dbTime > 0 && dbTime >= entryTime)) {
    await removeOutboxEntry(entry.id).catch(() => {});
    return false;
  }

  try {
    // 1. Immediately apply the offline payload to the form state if callback provided
    if (typeof onLoadPayload === "function") {
      onLoadPayload(entry.payload);
    }

    // 2. If online, sync to server in background and clear outbox entry
    if (typeof navigator !== "undefined" && navigator.onLine) {
      retryOutboxEntry(entry)
        .then((result) => {
          if (result && result.success) {
            if (typeof onSynced === "function") {
              onSynced(entry.payload);
            }
            if (showNotice) {
              import("./errorAlert.js")
                .then(({ showFeedbackToast }) => {
                  if (showFeedbackToast) {
                    showFeedbackToast(
                      "Synced offline changes with the server database.",
                    );
                  }
                })
                .catch(() => {});
            }
          }
        })
        .catch((e) => {
          console.warn("[Outbox] Background auto-sync attempt deferred:", e);
        });
    }

    return true;
  } catch (err) {
    console.warn("[Outbox] Error during autoSyncOutboxOnSectionOpen:", err);
    return false;
  }
}
