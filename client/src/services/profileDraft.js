// Unsaved-edit drafts for the Personnel Profile screen.
//
// The database is the only source of truth. A draft is NEVER a copy of the record and is never used
// as the dirty-check baseline. It holds only the fields the user changed (a delta), lives in
// sessionStorage (gone when the tab closes), is keyed per user + school + employee record, and carries
// the version of the server record it was made from. On load a draft whose baseVersion no longer
// matches the current database record is discarded, and a matching one is only restored after the
// user agrees.

const PREFIX = "esf7_profile_draft";

const safeSession = () => {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch (e) {
    return null;
  }
};

// One draft per user + school + employee record + tab ("profile" = Identity & Personal, "workload:<term>" = Workload).
export const profileDraftKey = ({ user, schoolId, personnelId, tab }) =>
  `${PREFIX}:${String(user || "anonymous")}:${String(schoolId || "")}:${String(personnelId || "")}:${String(tab || "profile")}`;

// Small stable hash, used as the version when the record carries no updated_at.
const hash = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++)
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return String(h >>> 0);
};

/** Version of a server record: its updated_at when present, else a hash of its normalized content. */
export const recordVersion = (record, canonical) => {
  const stamp = record && (record.updated_at || record.updatedAt);
  if (stamp) return String(stamp);
  return `h:${hash(JSON.stringify(canonical(record)))}`;
};

// Which drafts were already offered (and answered) during this page load. Module-level so a remount, a
// tab switch, a re-fetch or React Strict Mode's double mount cannot ask the same question twice.
const resolvedPrompts = new Set();
export const isDraftPromptResolved = (keyParts) =>
  resolvedPrompts.has(profileDraftKey(keyParts));
export const markDraftPromptResolved = (keyParts) => {
  resolvedPrompts.add(profileDraftKey(keyParts));
};

export const saveProfileDraft = (keyParts, baseVersion, delta) => {
  const store = safeSession();
  if (!store) return;
  const key = profileDraftKey(keyParts);
  try {
    if (!delta || Object.keys(delta).length === 0) {
      store.removeItem(key);
      return;
    }
    store.setItem(
      key,
      JSON.stringify({ baseVersion, savedAt: new Date().toISOString(), delta }),
    );
  } catch (e) {
    /* storage full / blocked: the draft is only a convenience */
  }
};

export const readProfileDraft = (keyParts) => {
  const store = safeSession();
  if (!store) return null;
  try {
    const raw = store.getItem(profileDraftKey(keyParts));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.delta && parsed.baseVersion ? parsed : null;
  } catch (e) {
    return null;
  }
};

export const clearProfileDraft = (keyParts) => {
  const store = safeSession();
  if (!store) return;
  try {
    store.removeItem(profileDraftKey(keyParts));
  } catch (e) {}
};

/** Logout: remove every profile draft (this tab's session store plus any legacy browser copies). */
export const clearAllProfileDrafts = () => {
  resolvedPrompts.clear();
  for (const store of [
    safeSession(),
    (() => {
      try {
        return typeof window !== "undefined" ? window.localStorage : null;
      } catch (e) {
        return null;
      }
    })(),
  ]) {
    if (!store) continue;
    try {
      const keys = [];
      for (let i = 0; i < store.length; i++) keys.push(store.key(i));
      for (const k of keys) {
        if (
          k &&
          (k.startsWith(`${PREFIX}:`) ||
            k.startsWith("draft_personnel_") ||
            k.startsWith("draft_workload_") ||
            k.startsWith("esf7_workload_draft_") ||
            k.startsWith("draft_learning_areas_"))
        ) {
          store.removeItem(k);
        }
      }
    } catch (e) {}
  }
};
