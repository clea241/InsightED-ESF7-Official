const { Pool } = require("pg");

const pool = new Pool({
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: "pRZTbQ2T1JD7",
  database: "insighted_esf7",
  ssl: { rejectUnauthorized: false },
  max: 2,
  connectionTimeoutMillis: 10000,
});

async function run() {
  const client = await pool.connect();
  try {
    // Cancel the old abandoned pids
    console.log("Cancelling abandoned queries 3558634 and 3562798...");
    await client.query("SELECT pg_cancel_backend(3558634);");
    await client.query("SELECT pg_cancel_backend(3562798);");
    console.log("Done.");

    // Check active queries again
    const act = await client.query(`
      SELECT pid, state, wait_event_type, wait_event, now() - query_start as duration, query
      FROM pg_stat_activity
      WHERE state <> 'idle' AND pid <> pg_backend_pid();
    `);
    console.log("\nRemaining active queries:");
    console.table(
      act.rows.map((r) => ({
        pid: r.pid,
        state: r.state,
        wait: `${r.wait_event_type || ""}:${r.wait_event || ""}`,
        query: r.query.substring(0, 80),
      })),
    );
  } catch (err) {
    console.error("Error:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
