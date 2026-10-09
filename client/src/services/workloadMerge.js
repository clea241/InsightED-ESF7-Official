// One place for the rules that decide how a teacher's saved workload (esf7_workload_rows) and the local copy
// (localStorage draft / school draft) are combined, so the two never conflict or duplicate each other.
//
// Version marker: the server stamps `workloadSavedAt` on every workload save/delete. The page stores the marker it
// last saw as `workloadBaseVersion` on the person (so it travels with the local draft). "No marker yet" is NO_VERSION.

export const NO_VERSION = 'none';

export const versionOf = (value) => (value ? String(value) : NO_VERSION);

const termOf = (row) => (row && row.term) || '1st';

const upper = (value) => String(value == null ? '' : value).trim().toUpperCase();

// "8:00", "08:00" and "08:00:00" are the same time.
const timeOf = (value) => {
  const text = String(value == null ? '' : value).trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(text);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : text.slice(0, 5);
};

const daysOf = (row) => {
  const raw = Array.isArray(row.days)
    ? row.days
    : (row.daySchedule ? String(row.daySchedule).split(',') : []);
  const cleaned = raw.map(upper).filter(Boolean).sort();
  return cleaned.length > 0 ? cleaned.join(',') : 'M,T,W,TH,F';
};

// Identity of a block that does not depend on its id: teacher + term + days + time + section/grade + subject.
export const compositeRowKey = (personId, row) => {
  const place = upper(row.sectionId || row.section_id || row.sectionName || row.section_name || row.gradeLevel || row.grade_level);
  return [
    String(personId),
    termOf(row),
    daysOf(row),
    timeOf(row.startTime || row.start_time),
    timeOf(row.endTime || row.end_time),
    place,
    upper(row.subject || row.subject_name || row.task)
  ].join('|');
};

// Removes blocks that appear twice, whether they share an id or only share the same slot/section/subject
// (e.g. an Advisory/HGP row that was regenerated with a new id). The first occurrence wins, so put the
// database rows first when merging.
export const dedupeWorkloadRows = (personId, rows) => {
  const seenIds = new Set();
  const seenKeys = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    const id = row.id == null ? '' : String(row.id);
    if (id && seenIds.has(id)) continue;
    const key = compositeRowKey(personId, row);
    if (seenKeys.has(key)) continue;
    if (id) seenIds.add(id);
    seenKeys.add(key);
    out.push(row);
  }
  return out;
};

// Order- and id-independent fingerprint of one term's blocks; equal fingerprints mean "same schedule".
export const rowsFingerprint = (personId, rows, term) => (Array.isArray(rows) ? rows : [])
  .filter((row) => row && termOf(row) === term)
  .map((row) => compositeRowKey(personId, row))
  .sort()
  .join('\n');

/**
 * Decide what to do when the saved rows are loaded for a teacher and term.
 *  - 'adopt-db'   : show the saved rows (also used when both sides already agree, so ids line up with the database)
 *  - 'keep-local' : the local copy holds unsaved changes made on top of what is saved; keep it
 *  - 'conflict'   : both sides changed (or the local copy has no known baseline); the user must choose
 *
 * @param {{ personId: string, term: string, dbRows: any[], dbVersion: string|null|undefined,
 *           localRows: any[], localBaseVersion?: string, hasDraft?: boolean }} input
 * @returns {{ action: 'adopt-db' | 'keep-local' | 'conflict', reason: string }}
 */
export const decideWorkloadMerge = ({ personId, term, dbRows, dbVersion, localRows, localBaseVersion, hasDraft = false }) => {
  const dbV = versionOf(dbVersion);
  const dbTermRows = (dbRows || []).filter((row) => termOf(row) === term);
  const localTermRows = (localRows || []).filter((row) => termOf(row) === term);

  if (rowsFingerprint(personId, dbTermRows, term) === rowsFingerprint(personId, localTermRows, term)) {
    return { action: 'adopt-db', reason: 'in-sync' };
  }
  // Nothing was ever saved for this teacher: the local copy is the only copy.
  if (dbTermRows.length === 0 && dbV === NO_VERSION) {
    return { action: 'keep-local', reason: 'never-saved' };
  }
  // Local edits were made on top of the version that is saved right now.
  if (localBaseVersion !== undefined && localBaseVersion !== null && String(localBaseVersion) === dbV) {
    return { action: 'keep-local', reason: 'unsaved-changes' };
  }
  // Nothing local to lose.
  if (!hasDraft && localTermRows.length === 0) {
    return { action: 'adopt-db', reason: 'no-local-data' };
  }
  return { action: 'conflict', reason: localBaseVersion == null ? 'unknown-baseline' : 'database-is-newer' };
};

// ── Per-block merge (saved rows + the edits made locally since the last confirmed save) ─────────────────

// What counts as "the block was edited": its schedule slot plus the few fields shown in the editor. Server-added
// bookkeeping fields and the id are ignored, so a row coming back from the database never looks edited by itself.
export const rowContentKey = (row) => [
  compositeRowKey('', row),
  upper(row.remediationSubject || row.remediation_subject),
  upper(row.category),
  upper(row.sectionName || row.section_name),
  upper(row.gradeLevel || row.grade_level)
].join('|');

// Order-independent fingerprint of every block (all terms) by content, to tell whether anything was edited.
export const rowsContentFingerprint = (rows) => (Array.isArray(rows) ? rows : [])
  .filter(Boolean)
  .map(rowContentKey)
  .sort()
  .join('\n');

// A block is identified by its id, or (no id) by its slot.
const rowIdentity = (personId, row) => (
  row.id != null && String(row.id) !== '' ? `id:${row.id}` : `k:${compositeRowKey(personId, row)}`
);

/**
 * Three-way merge of one term: `baseRows` = the saved rows the local copy started from, `localRows` = what the editor
 * holds now, `dbRows` = what is saved now.
 *  - edited only here            -> keep the local version
 *  - changed only in the database -> take the database version
 *  - edited the same way on both  -> one block
 *  - changed differently on both  -> conflict (the caller asks the user)
 * A local block whose id differs from a saved block but whose slot is identical (e.g. a regenerated Advisory/HGP row)
 * is treated as that same saved block, so it appears once.
 *
 * @returns {{ keepMine: any[], useDatabase: any[], conflicts: { id: string, local: any, db: any }[], hasLocalChanges: boolean }}
 */
export const threeWayMergeTerm = ({ personId, term, baseRows, localRows, dbRows }) => {
  const inTerm = (rows) => dedupeWorkloadRows(personId, (Array.isArray(rows) ? rows : []).filter((row) => row && termOf(row) === term));
  const db = inTerm(dbRows);

  const dbIdentities = new Set(db.map((row) => rowIdentity(personId, row)));
  const dbIdentityBySlot = new Map(db.map((row) => [compositeRowKey(personId, row), rowIdentity(personId, row)]));
  const identityOf = (row) => {
    const own = rowIdentity(personId, row);
    if (dbIdentities.has(own)) return own;
    return dbIdentityBySlot.get(compositeRowKey(personId, row)) || own;
  };
  const toMap = (rows) => {
    const map = new Map();
    for (const row of rows) {
      const identity = identityOf(row);
      if (!map.has(identity)) map.set(identity, row);
    }
    return map;
  };

  const baseMap = toMap(inTerm(baseRows));
  const localMap = toMap(inTerm(localRows));
  const dbMap = toMap(db);

  const same = (a, b) => (!a && !b) || (!!a && !!b && rowContentKey(a) === rowContentKey(b));

  const keepMine = [];
  const useDatabase = [];
  const conflicts = [];
  let hasLocalChanges = false;

  for (const id of new Set([...dbMap.keys(), ...baseMap.keys(), ...localMap.keys()])) {
    const b = baseMap.get(id);
    const l = localMap.get(id);
    const d = dbMap.get(id);
    const localChanged = !same(l, b);
    const dbChanged = !same(d, b);
    if (localChanged) hasLocalChanges = true;

    let mine;
    let theirs;
    if (!localChanged) {
      mine = d; theirs = d;
    } else if (!dbChanged || same(l, d)) {
      mine = l; theirs = l;
    } else {
      mine = l; theirs = d;
      conflicts.push({ id, local: l, db: d });
    }
    if (mine) keepMine.push(mine);
    if (theirs) useDatabase.push(theirs);
  }

  // An "edit" that ends up identical to what is saved is not an unsaved change.
  if (hasLocalChanges && conflicts.length === 0 && rowsFingerprint(personId, keepMine, term) === rowsFingerprint(personId, db, term)) {
    hasLocalChanges = false;
  }
  return { keepMine, useDatabase, conflicts, hasLocalChanges };
};

/**
 * Decide how to combine the saved rows with the local copy for one teacher + term.
 * With a known baseline (`baseRows`) it merges block by block; without one it falls back to the whole-term rule.
 *  - 'adopt-db'   : show the saved rows
 *  - 'keep-local' : keep the local rows as they are (unsaved changes on top of the current saved version)
 *  - 'merged'     : `rows` = saved rows with the unsaved local edits applied; `hasLocalChanges` says whether any remain
 *  - 'conflict'   : at least one block changed on both sides (`rowsKeepMine` / `rowsUseDatabase` hold the two outcomes)
 */
export const decideWorkloadMergeDetailed = ({ personId, term, dbRows, dbVersion, localRows, localBaseVersion, baseRows, hasDraft = false }) => {
  if (!Array.isArray(baseRows)) {
    const whole = decideWorkloadMerge({ personId, term, dbRows, dbVersion, localRows, localBaseVersion, hasDraft });
    return { ...whole, wholeTerm: true };
  }
  const merged = threeWayMergeTerm({ personId, term, baseRows, localRows, dbRows });
  if (merged.conflicts.length > 0) {
    return { action: 'conflict', reason: 'block-changed-on-both-sides', conflicts: merged.conflicts, rowsKeepMine: merged.keepMine, rowsUseDatabase: merged.useDatabase, hasLocalChanges: true };
  }
  if (!merged.hasLocalChanges) {
    return { action: 'adopt-db', reason: 'no-unsaved-changes', rows: merged.useDatabase, hasLocalChanges: false };
  }
  return { action: 'merged', reason: 'unsaved-changes-applied', rows: merged.keepMine, hasLocalChanges: true };
};

// ── Restore prompt: compare a browser draft with the saved rows ────────────────────────────────────

const toMinutes = (value) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value == null ? '' : value).trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const dayList = (row) => daysOf(row).split(',');

const isAdvisoryHgpPair = (a, b) => {
  const s = (row) => upper(row.subject || row.subject_name);
  const pair = new Set([s(a), s(b)]);
  return pair.size === 2 && pair.has('ADVISORY') && [...pair].some((name) => name === 'HGP' || name.includes('HOMEROOM'));
};

const overlaps = (a, b) => {
  const aStart = toMinutes(a.startTime || a.start_time);
  const aEnd = toMinutes(a.endTime || a.end_time);
  const bStart = toMinutes(b.startTime || b.start_time);
  const bEnd = toMinutes(b.endTime || b.end_time);
  if ([aStart, aEnd, bStart, bEnd].some((v) => v === null)) return false;
  if (!dayList(a).some((day) => dayList(b).includes(day))) return false;
  return aStart < bEnd && aEnd > bStart && !isAdvisoryHgpPair(a, b);
};

/** Is the draft saved after the database's last update? true / false, or null when either time is unknown. */
export const isDraftNewer = (draftSavedAt, dbVersion) => {
  const draft = Date.parse(draftSavedAt || '');
  const saved = Date.parse(dbVersion || '');
  if (Number.isNaN(draft) || Number.isNaN(saved)) return null;
  return draft > saved;
};

/** How many blocks `resultRows` would add, change or remove compared with `dbRows` (one term). */
export const summarizeWorkloadDiff = (personId, term, dbRows, resultRows) => {
  const dbList = dedupeWorkloadRows(personId, (dbRows || []).filter((row) => row && termOf(row) === term));
  const resultList = dedupeWorkloadRows(personId, (resultRows || []).filter((row) => row && termOf(row) === term));
  const dbBySlot = new Map(dbList.map((row) => [compositeRowKey(personId, row), row]));
  const dbById = new Map(dbList.filter((row) => row.id != null && String(row.id) !== '').map((row) => [String(row.id), row]));
  const matchedDb = new Set();
  let added = 0;
  let changed = 0;
  for (const row of resultList) {
    const sameBlock = (row.id != null && dbById.get(String(row.id))) || dbBySlot.get(compositeRowKey(personId, row));
    if (!sameBlock) {
      added += 1;
    } else {
      matchedDb.add(sameBlock);
      if (rowContentKey(sameBlock) !== rowContentKey(row)) changed += 1;
    }
  }
  const removed = dbList.filter((row) => !matchedDb.has(row)).length;
  return { added, changed, removed };
};

// Drops saved blocks that overlap a block coming from the draft, so restoring never leaves two blocks in one slot.
const dropOverlappingSavedBlocks = (rows, fromDraft) => {
  const draftRows = rows.filter((row) => fromDraft.has(row));
  const dropped = [];
  const kept = rows.filter((row) => {
    if (fromDraft.has(row)) return true;
    const clash = draftRows.some((mine) => overlaps(mine, row));
    if (clash) dropped.push(row);
    return !clash;
  });
  return { rows: kept, dropped: dropped.length };
};

/**
 * Compares the browser draft (the local rows) with the saved rows for one teacher + term.
 *  - { action: 'clean' }  : nothing worth restoring (identical, or older and with nothing extra) -> discard silently
 *  - { action: 'prompt' } : newer or additional/different blocks -> ask; `rows` is the draft applied on top of the saved rows
 * `summary` = { added, changed, removed, overlapsReplaced, conflicts } relative to the saved rows.
 */
export const compareDraftToDatabase = ({ personId, term, dbRows, dbVersion, localRows, baseRows, draftSavedAt }) => {
  const dbList = dedupeWorkloadRows(personId, (dbRows || []).filter((row) => row && termOf(row) === term));
  const localList = dedupeWorkloadRows(personId, (localRows || []).filter((row) => row && termOf(row) === term));
  const newer = isDraftNewer(draftSavedAt, dbVersion);
  const clean = (reason) => ({ action: 'clean', reason, draftNewer: newer, summary: { added: 0, changed: 0, removed: 0, overlapsReplaced: 0, conflicts: 0 } });

  if (rowsFingerprint(personId, dbList, term) === rowsFingerprint(personId, localList, term)) return clean('identical');

  let result;
  let fromDraft;
  let conflicts = 0;

  if (Array.isArray(baseRows)) {
    // The saved rows the draft started from are known: only the draft's own edits count.
    const merged = threeWayMergeTerm({ personId, term, baseRows, localRows: localList, dbRows: dbList });
    if (!merged.hasLocalChanges) return clean('no-unsaved-edits');
    result = merged.keepMine;
    conflicts = merged.conflicts.length;
    const localSlots = new Set(localList.map((row) => rowContentKey(row)));
    fromDraft = new Set(result.filter((row) => localSlots.has(rowContentKey(row)) && !dbList.some((d) => rowContentKey(d) === rowContentKey(row))));
  } else {
    // No baseline: compare the draft with the saved rows directly.
    const diff = summarizeWorkloadDiff(personId, term, dbList, localList);
    const onlyOlderWithNothingExtra = diff.added === 0 && diff.changed === 0 && !(diff.removed > 0 && newer === true);
    if (onlyOlderWithNothingExtra) return clean('older-with-nothing-extra');
    const dbBySlot = new Map(dbList.map((row) => [compositeRowKey(personId, row), row]));
    const dbById = new Map(dbList.filter((row) => row.id != null && String(row.id) !== '').map((row) => [String(row.id), row]));
    const draftDiffers = (row) => {
      const saved = (row.id != null && dbById.get(String(row.id))) || dbBySlot.get(compositeRowKey(personId, row));
      return !saved || rowContentKey(saved) !== rowContentKey(row);
    };
    if (newer === true) {
      // A newer draft is the intended schedule: it replaces the saved rows (saved-only blocks are removed).
      result = localList.slice();
      fromDraft = new Set(localList.filter(draftDiffers));
    } else {
      // Not newer (or unknown): the draft only adds to / changes the saved rows; saved-only blocks stay.
      const replaced = new Set();
      const changedRows = localList.filter(draftDiffers);
      for (const row of changedRows) {
        const saved = (row.id != null && dbById.get(String(row.id))) || dbBySlot.get(compositeRowKey(personId, row));
        if (saved) replaced.add(saved);
      }
      result = [...dbList.filter((row) => !replaced.has(row)), ...changedRows];
      fromDraft = new Set(changedRows);
    }
  }

  const resolved = dropOverlappingSavedBlocks(dedupeWorkloadRows(personId, result), fromDraft);
  const summary = { ...summarizeWorkloadDiff(personId, term, dbList, resolved.rows), overlapsReplaced: resolved.dropped, conflicts };
  return { action: 'prompt', reason: conflicts > 0 ? 'blocks-changed-on-both-sides' : (newer === true ? 'draft-is-newer' : 'draft-has-additional-or-different-blocks'), draftNewer: newer, rows: resolved.rows, summary };
};

/**
 * Login-time overlay of the SAVED workload (esf7_workload_rows) onto a teacher that came from a draft.
 * Database first: for every term the database has rows for, the database rows are the schedule (deduplicated);
 * terms the database knows nothing about keep the draft's rows (shown, but not confirmed saved). A teacher with
 * unsaved local workload edits (hasUnsavedLocalEdits) keeps the draft untouched - the Workload page's conflict
 * dialog handles that case. Nothing is written; the result is a new array, inputs are not mutated.
 */
export const overlayDatabaseWorkload = ({ personId, draftRows, dbRows, hasUnsavedLocalEdits = false }) => {
  const draft = Array.isArray(draftRows) ? draftRows : [];
  const db = Array.isArray(dbRows) ? dbRows.filter(Boolean) : [];
  if (db.length === 0 || hasUnsavedLocalEdits) return draft;
  const dbTerms = new Set(db.map((r) => termOf(r)));
  const keptFromDraft = draft.filter((r) => !dbTerms.has(termOf(r)));
  return dedupeWorkloadRows(personId, [...db, ...keptFromDraft]);
};
