require("./loadEnv");
require("./db/directPort"); // connect directly to Postgres (DB_DIRECT_PORT), not through PgBouncer
const { Client } = require("pg");
const client = new Client({
  connectionString:
    process.env.INSIGHTED_DATABASE_URL || process.env.PRIMARY_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
client
  .connect()
  .then(() => {
    return client.query(
      "SELECT * FROM clustered_connections WHERE target_school_id = $1",
      ["123458"],
    );
  })
  .then((res) => {
    console.log(res.rows);
    client.end();
  })
  .catch(console.error);
