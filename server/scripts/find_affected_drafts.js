// READ-ONLY recovery report: finds drafts and submissions that were likely affected by the lost-edit bug.
// Runs inside a READ ONLY transaction with a statement timeout; it cannot modify data.
//
// Usage:  node server/scripts/find_affected_drafts.js [--days 14] [--school 302261]
//
// What it looks for (server side only; it cannot see browsers):
//  1. Drafts whose server copy is OLDER than the latest save the client claims it made
//     (payload.lastUpdated is the client's timestamp; updated_at is the server's). A large gap means the
//     server acknowledged a save that did not land, which is exactly what the old write-behind buffer could cause.
//  2. Drafts with an empty roster or no personnel at all (possible partial-state overwrite).
//  3. Submission queue entries that failed, or are stuck in 'processing'.
// Recovery: affected users may still hold the newest copy in their browser (IndexedDB keys "draft_<school>_<year>");
// with the new build, "Restored your unsynced changes" will push it to the server on their next login.
const { pool } = require("../db/index.js");

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const days = Number(argOf("--days", 14));
const school = argOf("--school", null);

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '30s'");
    const schoolFilter = school ? "AND school_id = $2" : "";
    const params = school ? [days, school.replace(/^SCH-/i, "")] : [days];

    const stale = await client.query(
      `SELECT school_id, school_year, updated_at,
              payload->>'lastUpdated' AS client_last_updated,
              EXTRACT(EPOCH FROM ((payload->>'lastUpdated')::timestamptz - updated_at)) AS seconds_client_ahead
         FROM school_drafts
        WHERE updated_at > NOW() - make_interval(days => $1::int) ${schoolFilter}
          AND payload ? 'lastUpdated'
          AND (payload->>'lastUpdated') ~ '^\\d{4}-\\d{2}-\\d{2}T'
          AND (payload->>'lastUpdated')::timestamptz > updated_at + interval '30 seconds'
        ORDER BY seconds_client_ahead ASC LIMIT 200`,
      params,
    ); // smallest gaps first: the most plausible real losses
    console.log(
      `\n1) Drafts where the client's latest save is newer than the server copy (${stale.rows.length}):`,
    );
    console.table(stale.rows);

    // Client clocks on school PCs are often wrong (gaps of exactly 8/16/24 h are typical), so group by size:
    // small gaps (< 1 h) are the realistic "server acknowledged a save that did not land" cases.
    const buckets = await client.query(
      `SELECT CASE WHEN gap < 3600 THEN 'a) under 1 hour (likely real lost/reordered save)'
                   WHEN gap < 86400 THEN 'b) 1-24 hours (mixed: lost save or wrong client clock)'
                   ELSE 'c) over 24 hours (almost certainly a wrong client clock)' END AS gap_bucket,
              count(*) AS drafts
         FROM (SELECT EXTRACT(EPOCH FROM ((payload->>'lastUpdated')::timestamptz - updated_at)) AS gap
                 FROM school_drafts
                WHERE updated_at > NOW() - make_interval(days => $1::int) ${schoolFilter}
                  AND (payload->>'lastUpdated') ~ '^\\d{4}-\\d{2}-\\d{2}T'
                  AND (payload->>'lastUpdated')::timestamptz > updated_at + interval '30 seconds') g
        GROUP BY 1 ORDER BY 1`,
      params,
    );
    console.log("\n1b) Same drafts grouped by gap size:");
    console.table(buckets.rows);

    const empty = await client.query(
      `SELECT school_id, school_year, updated_at, jsonb_array_length(COALESCE(payload->'personnel','[]'::jsonb)) AS personnel_count
         FROM school_drafts
        WHERE updated_at > NOW() - make_interval(days => $1::int) ${schoolFilter}
          AND jsonb_array_length(COALESCE(payload->'personnel','[]'::jsonb)) = 0
        ORDER BY updated_at DESC LIMIT 200`,
      params,
    );
    console.log(
      `\n2) Recently updated drafts with an empty roster (${empty.rows.length}):`,
    );
    console.table(empty.rows);

    const subs = await client.query(
      `SELECT id, school_id, school_year, status, left(error_message, 160) AS error_message, created_at, updated_at
         FROM esf7_submission_queue
        WHERE created_at > NOW() - make_interval(days => $1::int) ${schoolFilter}
          AND (status = 'failed' OR (status = 'processing' AND updated_at < NOW() - interval '10 minutes'))
        ORDER BY updated_at DESC LIMIT 200`,
      params,
    );
    console.log(
      `\n3) Failed or stuck submission queue entries (${subs.rows.length}):`,
    );
    console.table(subs.rows);
  } catch (err) {
    console.error("Report failed:", err.message);
    process.exitCode = 1;
  } finally {
    try {
      await client.query("ROLLBACK");
    } catch (e) {}
    client.release();
    await pool.end();
  }
}

run();
