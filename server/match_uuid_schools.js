const { insightEdPool, prodPool } = require("./db");

async function match() {
  try {
    const uuidRows = await prodPool.query(`
      SELECT id, prn, school_id, first_name, last_name 
      FROM esf7_personnel_profile 
      WHERE school_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}'
    `);

    console.log(`Found ${uuidRows.rows.length} rows with UUID school_id:`);

    for (const r of uuidRows.rows) {
      let mRes = { rows: [] };
      if (r.prn && r.prn !== "NOT YET AVAILABLE") {
        mRes = await insightEdPool
          .query(
            "SELECT school_id, schoool_id, first, last, prn FROM esf7_database WHERE prn = $1 LIMIT 1",
            [r.prn],
          )
          .catch(() => ({ rows: [] }));
      }
      if (mRes.rows.length === 0) {
        mRes = await insightEdPool
          .query(
            "SELECT school_id, schoool_id, first, last, prn FROM esf7_database WHERE last ILIKE $1 AND first ILIKE $2 LIMIT 1",
            [r.last_name, r.first_name + "%"],
          )
          .catch(() => ({ rows: [] }));
      }
      const match = mRes.rows[0];
      const realSchoolId = match
        ? match.school_id || match.schoool_id
        : "UNKNOWN";
      console.log(
        `${r.first_name} ${r.last_name} (${r.id}) [UUID: ${r.school_id}] -> Matched Real School ID: ${realSchoolId}`,
      );
    }
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    process.exit(0);
  }
}
match();
