// Shared pieces of "save this screen" used by every page's save function, so the header Save button and the
// unsaved-changes dialog's Save button behave identically.
//
// A page's save function never opens its own alerts. It returns { ok: true } or { ok: false, title, message };
// the header button shows that in the page's usual alert/toast, and the dialog shows it inside itself.
import { flushDrafts, getDraftSaveState } from "./draftSaver";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const saveFailure = (title, message) => ({ ok: false, title, message });

/**
 * Resolves { ok: true } only after the server confirmed the school draft write (flushDrafts rejects on a failed or
 * conflicting save). Call it AFTER the page updated its state: the saver learns about a change only once React has
 * committed it, so wait briefly for that before flushing; otherwise a stale copy could be sent and reported as saved.
 * The server's own message is passed through as-is (a 422 validation text, "server is busy (HTTP 502)", ...).
 */
export const confirmServerDraftSaved = async ({
  waitForChangeMs = 400,
  pollMs = 25,
} = {}) => {
  const started = Date.now();
  while (!getDraftSaveState().dirty && Date.now() - started < waitForChangeMs) {
    await sleep(pollMs);
  }
  try {
    await flushDrafts();
  } catch (err) {
    return saveFailure(
      "Not Saved to the Server",
      (err && err.message) ||
        "The save could not be completed. Please try again.",
    );
  }
  const after = getDraftSaveState();
  if (after.status === "failed" || after.status === "conflict") {
    return saveFailure(
      "Not Saved to the Server",
      (after.lastError && after.lastError.message) ||
        "The server did not confirm the save. Please try again.",
    );
  }
  return { ok: true };
};
