const { usersDbPool, prodPool } = require("./db");

async function inspect() {
  try {
    const uuidRows = await prodPool.query(`
      SELECT id, prn, school_id, first_name, last_name 
      FROM esf7_personnel_profile 
      WHERE school_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}'
    `);
    console.log("Total UUID rows:", uuidRows.rows.length);

    for (const r of uuidRows.rows) {
      const uRes = await usersDbPool
        .query(
          "SELECT id, email, school_id, full_name FROM user_schoolhead WHERE id = $1",
          [r.school_id],
        )
        .catch(() => ({ rows: [] }));
      console.log(
        `Personnel: ${r.first_name} ${r.last_name} (ID: ${r.id}, PRN: ${r.prn}) -> SchoolHead Match:`,
        uRes.rows[0] || "No user match",
      );
    }
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    process.exit(0);
  }
}
inspect();
