// Which school a submit request is for. The answer comes from the verified login (req.auth, set by
// middleware/auth.js), never from the request body. A school id in the body (or inside the payload) is only
// accepted when it is the same school; a different one is refused with 403, and there is no default school.

const clean = (v) =>
  v === undefined || v === null || v === ""
    ? null
    : String(v).replace(/^SCH-/i, "").trim() || null;

/** Every school id the client claims in the body, cleaned of the SCH- prefix. */
function claimedSchoolIdsInBody(body) {
  if (!body || typeof body !== "object") return [];
  let payload = body.payload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = null;
    }
  }
  const info =
    payload && typeof payload === "object" ? payload.schoolInfo : null;
  return [
    body.schoolId,
    body.school_id,
    body.schoolID,
    info && (info.schoolId || info.school_id),
  ]
    .map(clean)
    .filter(Boolean);
}

/**
 * @returns {{ schoolId: string } | { status: number, error: string }}
 */
function resolveRequestSchool(req) {
  if (!req || !req.auth) {
    return { status: 401, error: "Authentication required." };
  }
  const own = clean(req.auth.schoolId);
  if (!own) {
    return {
      status: 403,
      error: "Your account is not linked to a school, so it cannot submit one.",
    };
  }
  if (claimedSchoolIdsInBody(req.body).some((id) => id !== own)) {
    return {
      status: 403,
      error: "You can only submit for your own school.",
    };
  }
  return { schoolId: own };
}

module.exports = { resolveRequestSchool, claimedSchoolIdsInBody };
