// READ-ONLY report. Changes nothing: log files are only read, and the database part runs inside a READ ONLY
// transaction with a statement timeout.
//
// Usage:
//   node server/scripts/find_personnel_500_and_cross_school.js --log /path/out.log --log /path/error.log [--days 30] [--school 302261] [--no-db]
//   (repeat --log for every PM2 log file; rotated plain-text files work too. Without --log only the database part runs.)
//
// 1) Personnel create attempts that returned HTTP 500 (from the request log line `POST /api/personnel -> 500` and the
//    controller's `Error creating personnel record:` line). Before the 2026-10-08 fix every create threw a ReferenceError,
//    so these are the users who never got their person saved. Grouped per school and day, with the first error text.
// 2) Draft rows that look like they were written by someone who does not belong to that school:
//    the draft's own payload says it is another school (payload.schoolInfo.schoolId differs from the row's school_id),
//    or most of its personnel ids carry another school's prefix (PER-<otherSchool>-...). The database does not record
//    who wrote a draft, so this is evidence, not proof.
// 3) Refused requests recorded by the new auth gate (`[AuthGate][DENY 401|403] ... uid= role= tokenSchool= claimed=`),
//    which identify the account and the school it tried to reach. Only exists for logs written after the gate was deployed.
// 4) Draft saves in the logs with the writing account (`[DraftSave][OK] school=.. user=..`, new logging) whose account id
//    embeds a different school than the draft's (pilot-/divtest- accounts carry their school in the uid).
const fs = require("fs");

// ---------- log parsing (pure functions, unit tested) ----------
const ANSI = /\x1b\[[0-9;]*m/g; // eslint-disable-line no-control-regex
const stripAnsi = (s) => String(s).replace(ANSI, "");
const PM2_STAMP = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})[:\s]/; // PM2 log_date_format 'YYYY-MM-DD HH:mm:ss'

function parseLine(raw) {
  const line = stripAnsi(raw);
  const stamp = PM2_STAMP.exec(line);
  return { line, date: stamp ? stamp[1] : null, time: stamp ? stamp[2] : null };
}

/** Request-log line written by utils/devLogger.js for a failed personnel create. */
function parsePersonnelCreate500(raw) {
  const { line, date, time } = parseLine(raw);
  const m = /\bPOST\s+\/api\/personnel(?:\?\S*)?\s+➔\s+(\d{3})\b/.exec(line);
  if (!m || m[1] !== "500") return null;
  const school = /\bschool_?[iI]d: "?(\d{5,7})/.exec(line);
  return { kind: "request", date, time, school: school ? school[1] : null };
}

/** Controller error line: `Error creating personnel record: ReferenceError: x is not defined` */
function parsePersonnelCreateError(raw) {
  const { line, date, time } = parseLine(raw);
  const m = /Error creating personnel record:\s*(.*)$/.exec(line);
  return m
    ? { kind: "error", date, time, message: m[1].trim().slice(0, 200) }
    : null;
}

function parseAuthDeny(raw) {
  const { line, date, time } = parseLine(raw);
  const m =
    /\[AuthGate\]\[DENY (\d{3})\] method=(\S+) path=(\S+) uid=(\S+) role=(.*?)(?: tokenSchool=(\S+) claimed=(\S*))?$/.exec(
      line.trim(),
    );
  if (!m) return null;
  return {
    date,
    time,
    code: m[1],
    method: m[2],
    path: m[3],
    uid: m[4],
    role: m[5].trim(),
    tokenSchool: m[6] || null,
    claimed: m[7] || null,
  };
}

/** uid forms that embed a school: pilot-<id>, divtest-<id>, smoke-<id>. */
function schoolOfUid(uid) {
  const m = /^(?:pilot|divtest|smoke)-(\d{5,7})$/.exec(String(uid || ""));
  return m ? m[1] : null;
}

function parseDraftSave(raw) {
  const { line, date, time } = parseLine(raw);
  const m =
    /\[DraftSave\]\[(OK|CONFLICT)\] school=(\S+) user=(\S+) year=(.+?) base=/.exec(
      line,
    );
  if (!m) return null;
  return {
    date,
    time,
    result: m[1],
    school: m[2],
    uid: m[3],
    year: m[4],
    uidSchool: schoolOfUid(m[3]),
  };
}

function analyzeLogLines(lines) {
  const out = {
    personnel500: [],
    personnelErrors: [],
    denies: [],
    draftSaves: [],
    crossSchoolDraftSaves: [],
  };
  for (const raw of lines) {
    const a = parsePersonnelCreate500(raw);
    if (a) {
      out.personnel500.push(a);
      continue;
    }
    const b = parsePersonnelCreateError(raw);
    if (b) {
      out.personnelErrors.push(b);
      continue;
    }
    const c = parseAuthDeny(raw);
    if (c) {
      out.denies.push(c);
      continue;
    }
    const d = parseDraftSave(raw);
    if (d) {
      out.draftSaves.push(d);
      if (d.uidSchool && d.uidSchool !== String(d.school).replace(/^SCH-/i, ""))
        out.crossSchoolDraftSaves.push(d);
    }
  }
  return out;
}

const groupCount = (rows, keyFn) => {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((x, y) => String(x.key).localeCompare(String(y.key)));
};

// ---------- database part (read only) ----------
async function findCrossSchoolDrafts(
  client,
  { days = 30, school = null } = {},
) {
  const params = [days];
  let schoolFilter = "";
  if (school) {
    params.push(String(school).replace(/^SCH-/i, ""));
    schoolFilter = "AND school_id = $2";
  }
  const mismatched = await client.query(
    `SELECT school_id, school_year, updated_at,
            payload->'schoolInfo'->>'schoolId' AS payload_school_id
       FROM school_drafts
      WHERE updated_at > NOW() - make_interval(days => $1::int) ${schoolFilter}
        AND COALESCE(payload->'schoolInfo'->>'schoolId', '') <> ''
        AND REPLACE(payload->'schoolInfo'->>'schoolId', 'SCH-', '') <> REPLACE(school_id, 'SCH-', '')
      ORDER BY updated_at DESC LIMIT 500`,
    params,
  );
  const foreignPersonnel = await client.query(
    `SELECT d.school_id, d.school_year, d.updated_at,
            count(*) FILTER (WHERE p->>'id' ~ '^PER-\\d{5,7}-' AND substring(p->>'id' from '^PER-(\\d{5,7})-') <> REPLACE(d.school_id, 'SCH-', '')) AS foreign_ids,
            count(*) AS total
       FROM school_drafts d, jsonb_array_elements(COALESCE(d.payload->'personnel', '[]'::jsonb)) p
      WHERE d.updated_at > NOW() - make_interval(days => $1::int) ${schoolFilter.replace("school_id", "d.school_id")}
      GROUP BY d.school_id, d.school_year, d.updated_at
     HAVING count(*) FILTER (WHERE p->>'id' ~ '^PER-\\d{5,7}-' AND substring(p->>'id' from '^PER-(\\d{5,7})-') <> REPLACE(d.school_id, 'SCH-', '')) * 2 > count(*)
      ORDER BY d.updated_at DESC LIMIT 500`,
    params,
  );
  return {
    mismatched: mismatched.rows,
    foreignPersonnel: foreignPersonnel.rows,
  };
}

async function runDatabasePart(opts) {
  const { pool } = require("../db/index.js");
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '30s'");
    const res = await findCrossSchoolDrafts(client, opts);
    await client.query("ROLLBACK");
    return res;
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

// ---------- CLI ----------
async function main() {
  const args = process.argv.slice(2);
  const all = (name) =>
    args.reduce(
      (acc, a, i) => (a === name && args[i + 1] ? [...acc, args[i + 1]] : acc),
      [],
    );
  const logs = all("--log");
  const days = Number(
    (args.includes("--days") && args[args.indexOf("--days") + 1]) || 30,
  );
  const school =
    (args.includes("--school") && args[args.indexOf("--school") + 1]) || null;

  console.log("READ-ONLY report: nothing is modified.\n");
  if (logs.length === 0)
    console.log("(no --log given: skipping sections 1, 3 and 4)\n");
  else {
    const lines = [];
    for (const f of logs) {
      if (!fs.existsSync(f)) {
        console.log(`log not found: ${f}`);
        continue;
      }
      lines.push(...fs.readFileSync(f, "utf8").split(/\r?\n/));
    }
    const r = analyzeLogLines(lines);
    console.log(
      `1) Personnel create attempts that returned HTTP 500: ${r.personnel500.length}`,
    );
    console.table(
      groupCount(
        r.personnel500,
        (x) => `${x.date || "unknown date"}  school ${x.school || "unknown"}`,
      ),
    );
    console.log("   Error text seen in the controller log (first 5 distinct):");
    console.table(
      [...new Set(r.personnelErrors.map((e) => e.message))]
        .slice(0, 5)
        .map((message) => ({ message })),
    );
    console.log(`\n3) Requests refused by the auth gate: ${r.denies.length}`);
    console.table(
      groupCount(
        r.denies,
        (x) =>
          `${x.code} uid=${x.uid} role=${x.role} tokenSchool=${x.tokenSchool || "-"} claimed=${x.claimed || "-"}`,
      ).slice(0, 100),
    );
    console.log(
      `\n4) Draft saves by an account that embeds a different school than the draft: ${r.crossSchoolDraftSaves.length} (of ${r.draftSaves.length} logged saves)`,
    );
    console.table(r.crossSchoolDraftSaves.slice(0, 100));
  }

  if (!args.includes("--no-db")) {
    try {
      const db = await runDatabasePart({ days, school });
      console.log(
        `\n2a) Drafts whose payload says it belongs to another school (${db.mismatched.length}):`,
      );
      console.table(db.mismatched);
      console.log(
        `2b) Drafts where most personnel ids carry another school's prefix (${db.foreignPersonnel.length}):`,
      );
      console.table(db.foreignPersonnel);
      console.log(
        "\nNote: the database does not record which account wrote a draft; use sections 3 and 4 (logs) for that.",
      );
    } catch (err) {
      console.log(`\nDatabase part skipped: ${err.message}`);
    }
  }
}

module.exports = {
  parsePersonnelCreate500,
  parsePersonnelCreateError,
  parseAuthDeny,
  parseDraftSave,
  schoolOfUid,
  analyzeLogLines,
  findCrossSchoolDrafts,
};

if (require.main === module)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
