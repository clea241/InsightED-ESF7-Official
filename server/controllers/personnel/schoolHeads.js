// School Head persistence: ONE atomic, verified write.
//
// Why this exists: the older per-person route ran several statements in a transaction and swallowed errors from
// the side tables with `.catch(() => {})`. In PostgreSQL a failed statement aborts the transaction, so the final
// COMMIT silently became a ROLLBACK while the route still answered 200 ("saved"). Here the side tables run behind
// savepoints (they can never poison the transaction), the whole change is one transaction on one client that is
// always released, and success is only reported after the rows are read back (outside the transaction) and match
// what was asked for.
const db = require("../../db");
const {
  handleControllerError,
  isPoolAcquireTimeout,
} = require("../../utils/poolErrors");

class SchoolHeadError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

const cleanSid = (v) =>
  String(v || "")
    .replace(/^SCH-/i, "")
    .trim();

/**
 * @param {string} schoolId
 * @param {object} change
 * @param {{id:string,isMain?:boolean,level?:string|null}[]} [change.setHeads]  people who must be School Head after the write
 * @param {string[]} [change.unsetIds]   people who must NOT be School Head after the write
 * @param {boolean}  [change.clearOthers] everyone else in the school is unset (single-head mode / full replace)
 * @param {boolean}  [change.clearMainOthers] only the "main head" flag is taken from everyone else
 * @returns {Promise<{heads:{id:string,isMain:boolean,level:string|null}[]}>} the persisted state, re-read from the database
 */
async function writeSchoolHeads(
  schoolId,
  {
    setHeads = [],
    unsetIds = [],
    clearOthers = false,
    clearMainOthers = false,
  },
) {
  const sid = cleanSid(schoolId);
  if (!sid) throw new SchoolHeadError(400, "A school is required.");
  const sidPair = [sid, `SCH-${sid}`];

  // Dedicate a connection from prodPool (or school pool) so designation writes are not starved by general read traffic
  const pool =
    (typeof db.getPoolForSchool === "function"
      ? db.getPoolForSchool(sid)
      : null) ||
    db.prodPool ||
    db.getPool();
  const client = await pool.connect();
  let resolvedSet = [];
  let resolvedUnset = [];
  try {
    await client.query("BEGIN");

    const lock = await client.query(
      "SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked",
      [`school_head:${sid}`],
    );
    if (!lock.rows[0]?.locked) {
      throw new SchoolHeadError(
        409,
        "Another School Head change for this school is already in progress. Please wait and try again.",
      );
    }

    // Resolve every referenced person (id / legacy id / PRN) inside THIS school.
    const wanted = [
      ...setHeads.map((h) => String(h.id)),
      ...unsetIds.map(String),
    ];
    const found = wanted.length
      ? await client.query(
          `SELECT id, legacy_id, prn FROM esf7_personnel_profile
            WHERE school_id = ANY($1)
              AND (id = ANY($2) OR legacy_id = ANY($2) OR prn = ANY($2))`,
          [sidPair, wanted],
        )
      : { rows: [] };
    const toCanonical = (ref) =>
      found.rows.find(
        (r) =>
          String(r.id) === String(ref) ||
          String(r.legacy_id) === String(ref) ||
          String(r.prn) === String(ref),
      )?.id;

    resolvedSet = setHeads.map((h) => ({
      id: toCanonical(h.id),
      ref: String(h.id),
      isMain: h.isMain !== false,
      level: h.level || null,
    }));
    const missing = resolvedSet.filter((h) => !h.id).map((h) => h.ref);
    if (missing.length > 0) {
      throw new SchoolHeadError(
        404,
        `Not found in this school's roster (save the roster first if they were just added): ${missing.join(", ")}`,
      );
    }
    resolvedUnset = unsetIds.map(toCanonical).filter(Boolean);
    const keepIds = resolvedSet.map((h) => String(h.id));

    if (clearOthers) {
      await client.query(
        `UPDATE esf7_personnel_profile
            SET is_school_head = FALSE, is_main_sh = FALSE, school_head_level = NULL, updated_at = NOW()
          WHERE school_id = ANY($1) AND (is_school_head = TRUE OR is_main_sh = TRUE)
            AND NOT (id = ANY($2::text[]))`,
        [sidPair, keepIds],
      );
    } else if (clearMainOthers) {
      await client.query(
        `UPDATE esf7_personnel_profile SET is_main_sh = FALSE, updated_at = NOW()
          WHERE school_id = ANY($1) AND is_main_sh = TRUE AND NOT (id = ANY($2::text[]))`,
        [sidPair, keepIds],
      );
    }
    if (resolvedUnset.length > 0) {
      await client.query(
        `UPDATE esf7_personnel_profile
            SET is_school_head = FALSE, is_main_sh = FALSE, school_head_level = NULL, updated_at = NOW()
          WHERE id = ANY($1::text[])`,
        [resolvedUnset.map(String)],
      );
    }
    for (const h of resolvedSet) {
      const r = await client.query(
        `UPDATE esf7_personnel_profile
            SET is_school_head = TRUE, is_main_sh = $2, school_head_level = $3, updated_at = NOW()
          WHERE id = $1`,
        [h.id, h.isMain, h.level],
      );
      if (r.rowCount !== 1) {
        throw new SchoolHeadError(
          500,
          `The School Head flag could not be written for ${h.ref}.`,
        );
      }
    }

    // Secondary tables are optional and may differ between databases: each runs behind its own savepoint,
    // so a failure there can never abort (and silently roll back) the change above.
    const optional = async (sql, params) => {
      await client.query("SAVEPOINT optional_write");
      try {
        await client.query(sql, params);
        await client.query("RELEASE SAVEPOINT optional_write");
      } catch (e) {
        await client.query("ROLLBACK TO SAVEPOINT optional_write");
      }
    };
    if (clearOthers) {
      await optional(
        `UPDATE esf7_personnel_node_status SET is_school_head = FALSE, updated_at = NOW()
          WHERE school_id = ANY($1) AND is_school_head = TRUE AND NOT (personnel_id = ANY($2::text[]))`,
        [sidPair, keepIds],
      );
    }
    for (const id of [...resolvedUnset.map(String)]) {
      await optional(
        `UPDATE esf7_personnel_node_status SET is_school_head = FALSE, updated_at = NOW() WHERE personnel_id = $1`,
        [id],
      );
    }
    for (const h of resolvedSet) {
      await optional(
        `UPDATE esf7_personnel_node_status SET is_school_head = TRUE, updated_at = NOW() WHERE personnel_id = $1`,
        [String(h.id)],
      );
    }
    const main = resolvedSet.find((h) => h.isMain) || resolvedSet[0];
    if (main) {
      await optional(
        `UPDATE esf7_school_profile
            SET school_head_id = $1,
                school_head_name = COALESCE((SELECT NULLIF(TRIM(first_name || ' ' || last_name), '')
                                               FROM esf7_personnel_profile WHERE id = $1), school_head_name),
                school_head_level = $2, updated_at = NOW()
          WHERE school_id = ANY($3)`,
        [String(main.id), main.level, sidPair],
      );
    } else if (resolvedUnset.length > 0 || clearOthers) {
      await optional(
        `UPDATE esf7_school_profile
            SET school_head_id = NULL, school_head_name = NULL, school_head_level = NULL, updated_at = NOW()
          WHERE school_id = ANY($1)`,
        [sidPair],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Verify against what is actually stored now, read back outside the transaction.
  const stored = await db.query(
    `SELECT id, is_main_sh, school_head_level
       FROM esf7_personnel_profile
      WHERE school_id = ANY($1) AND is_school_head = TRUE
      ORDER BY id`,
    [sidPair],
  );
  const heads = stored.rows.map((r) => ({
    id: String(r.id),
    isMain: Boolean(r.is_main_sh),
    level: r.school_head_level || null,
  }));
  const byId = new Map(heads.map((h) => [h.id, h]));
  const problems = [];
  for (const h of resolvedSet) {
    const got = byId.get(String(h.id));
    if (!got) problems.push(`${h.ref} is not stored as School Head`);
    else if (got.isMain !== h.isMain)
      problems.push(`${h.ref} has the wrong main-head flag`);
  }
  for (const id of resolvedUnset) {
    if (byId.has(String(id)))
      problems.push(`${id} is still stored as School Head`);
  }
  if (clearOthers) {
    const expected = new Set(resolvedSet.map((h) => String(h.id)));
    for (const h of heads) {
      if (!expected.has(h.id))
        problems.push(`${h.id} is still stored as School Head`);
    }
  }
  if (problems.length > 0) {
    throw new SchoolHeadError(
      500,
      `The School Head change was not stored as requested (${problems.join("; ")}).`,
      { expected: resolvedSet, actual: heads },
    );
  }
  return { heads };
}

const sendError = (res, err, req, next) => {
  if (isPoolAcquireTimeout(err)) {
    return handleControllerError(err, req || {}, res, next);
  }
  const status = err instanceof SchoolHeadError ? err.status : 500;
  return res.status(status).json({
    error: err.message || "The School Head could not be saved.",
    ...(err.expected ? { expected: err.expected, actual: err.actual } : {}),
  });
};

module.exports = { writeSchoolHeads, SchoolHeadError, sendError, cleanSid };
