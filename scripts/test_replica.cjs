const { Client } = require("pg");

const DB_CONFIG = {
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: "pRZTbQ2T1JD7",
  ssl: { rejectUnauthorized: false }
};

async function testPerms() {
  const target = new Client({ ...DB_CONFIG, database: "insighted_esf7_staging" });
  await target.connect();
  try {
    await target.query("SET session_replication_role = 'replica';");
    console.log("SUCCESS: session_replication_role can be set to replica!");
    await target.query("SET session_replication_role = 'origin';");
    console.log("SUCCESS: reset to origin!");
  } catch (err) {
    console.log("Replica role not permitted:", err.message);
  } finally {
    await target.end();
  }
}

testPerms();
