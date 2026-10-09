// Turns a rejected api.* call into the message a user should see.
// Non-OK replies (400 validation, 409 duplicate, 403, ...) throw an ApiError that keeps the server's own text in
// `message` and the parsed body in `body`; network failures and gateway pages (502/503/504, non-JSON) get the fallback.
/**
 * @param {any} err
 * @param {string} fallback shown when the failure has no useful server message (network down, gateway page, bug)
 * @returns {string}
 */
export function errorMessage(err, fallback) {
  const status = err && typeof err.status === "number" ? err.status : 0;
  const fromBody = err && err.body && (err.body.error || err.body.message);
  if (
    typeof fromBody === "string" &&
    fromBody.trim() &&
    status >= 400 &&
    status < 500
  )
    return fromBody;
  if (status >= 400 && status < 500 && err.message) return err.message;
  return fallback;
}
