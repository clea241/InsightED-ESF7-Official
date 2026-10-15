require("../db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
const { Pool } = require("../node_modules/pg");

const localPool = new Pool({
  host: "127.0.0.1",
  port: 5432,
  user: "postgres",
  password: "kLeyahhUnique241!@",
  database: "esf7_local",
  ssl: false,
});

async function main() {
  const client = await localPool.connect();
  try {
    const res = await client.query("SELECT current_database(), current_user;");
    console.log("Connected to local db successfully:", res.rows[0]);

    const tables = await client.query(`
      SELECT table_name, table_type 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    console.log(
      `Current tables in esf7_local (${tables.rows.length}):`,
      tables.rows.map((t) => `${t.table_name} (${t.table_type})`),
    );
  } finally {
    client.release();
    await localPool.end();
  }
}

main().catch(console.error);
