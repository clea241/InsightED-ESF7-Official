require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
const { Pool } = require("../node_modules/pg");

const pool = new Pool({
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: process.env.DB_PASSWORD,
  database: "insighted_esf7",
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

async function main() {
  const client = await pool.connect();
  try {
    const snedInReg = await client.query(
      "SELECT count(*) FROM esf7_sned_sections s JOIN esf7_regular_sections r ON s.id = r.id",
    );
    const alsInReg = await client.query(
      "SELECT count(*) FROM esf7_als_sections a JOIN esf7_regular_sections r ON a.id = r.id",
    );
    const aralInReg = await client.query(
      "SELECT count(*) FROM esf7_aral_sections ar JOIN esf7_regular_sections r ON ar.id = r.id",
    );
    console.log({
      sned_in_reg: snedInReg.rows[0].count,
      als_in_reg: alsInReg.rows[0].count,
      aral_in_reg: aralInReg.rows[0].count,
    });

    // Check SNED total rows vs matched in workload
    const snedTotal = await client.query(
      "SELECT count(*) FROM esf7_sned_sections",
    );
    const alsTotal = await client.query(
      "SELECT count(*) FROM esf7_als_sections",
    );
    const aralTotal = await client.query(
      "SELECT count(*) FROM esf7_aral_sections",
    );
    console.log({
      sned_total_sections: snedTotal.rows[0].count,
      als_total_sections: alsTotal.rows[0].count,
      aral_total_sections: aralTotal.rows[0].count,
    });

    const wklSned = await client.query(
      "SELECT count(DISTINCT s.id) FROM esf7_workload_rows w JOIN esf7_sned_sections s ON w.section_id = s.id",
    );
    const wklAls = await client.query(
      "SELECT count(DISTINCT a.id) FROM esf7_workload_rows w JOIN esf7_als_sections a ON w.section_id = a.id",
    );
    const wklAral = await client.query(
      "SELECT count(DISTINCT ar.id) FROM esf7_workload_rows w JOIN esf7_aral_sections ar ON w.section_id = ar.id",
    );
    const wklReg = await client.query(
      "SELECT count(DISTINCT r.id) FROM esf7_workload_rows w JOIN esf7_regular_sections r ON w.section_id = r.id",
    );
    console.log({
      distinct_reg_in_wkl: wklReg.rows[0].count,
      distinct_sned_in_wkl: wklSned.rows[0].count,
      distinct_als_in_wkl: wklAls.rows[0].count,
      distinct_aral_in_wkl: wklAral.rows[0].count,
    });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
