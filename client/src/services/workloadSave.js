// Mechanics shared by every workload save path (Save, Save Changes, Save & Validate, Save & Continue, bulk validate,
// and the unsaved-changes dialog): retry transient failures, verify the write, and spot edits made while saving.
import {
  dedupeWorkloadRows,
  rowsFingerprint,
  rowsContentFingerprint,
} from "./workloadMerge";

// 502/503/504 (gateway busy/timeout), 408/429, and network drops (no HTTP status at all) are worth retrying.
// 4xx validation answers (e.g. the 422 "no classes assigned" rule) are final: retrying cannot fix them.
export const isTransientSaveError = (err) => {
  if (!err) return false;
  const status = err.status;
  if (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 408 ||
    status === 429
  )
    return true;
  if (status === undefined || status === null || status === 0) {
    const text = `${err.name || ""} ${err.message || ""}`.toLowerCase();
    return /abort|timeout|timed out|network|failed to fetch|load failed|econnreset|fetch/.test(
      text,
    );
  }
  return false;
};

/**
 * Runs `task` and retries it when it fails with a transient error, waiting `delays[i]` ms before retry i + 1.
 * Safe for saves because the server replaces a teacher's term in one transaction (a retry never duplicates rows).
 */
export const retryTransient = async (
  task,
  {
    delays = [500, 1500, 3000],
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    shouldRetry = isTransientSaveError,
  } = {},
) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await task(attempt);
    } catch (err) {
      if (attempt >= delays.length || !shouldRetry(err)) throw err;
      await sleep(delays[attempt]);
    }
  }
};

/**
 * Checks that the rows the server says it wrote are the rows that were sent (same blocks, per term).
 * `terms` are the terms that were replaced; a term with no sent blocks must come back empty.
 */
export const verifySavedRows = (personId, sentRows, savedRows, terms) => {
  const sent = dedupeWorkloadRows(personId, sentRows);
  const saved = Array.isArray(savedRows) ? savedRows : [];
  const termList =
    terms && terms.length > 0
      ? terms
      : [...new Set(sent.map((row) => row.term || "1st"))];
  const mismatched = termList.filter(
    (term) =>
      rowsFingerprint(personId, sent, term) !==
      rowsFingerprint(personId, saved, term),
  );
  return { ok: mismatched.length === 0, mismatchedTerms: mismatched };
};

/** True when the editor's rows differ in content from the rows that were sent (the user kept editing while saving). */
export const editedSinceSent = (sentRows, latestRows) =>
  rowsContentFingerprint(sentRows) !== rowsContentFingerprint(latestRows);
