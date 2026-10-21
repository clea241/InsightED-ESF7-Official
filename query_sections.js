const { Client } = require("./server/node_modules/pg");

async function check() {
  const client = new Client({
    connectionString:
      "postgresql://Administrator1:pRZTbQ2T1JD7@stride-posgre-prod-01.postgres.database.azure.com:5432/insighted_esf7?sslmode=require",
  });
  await client.connect();
  const res = await client.query(
    "SELECT id, school_id, grade_level, section_name FROM esf7_regular_sections WHERE school_id = '125065' LIMIT 20",
  );
  console.log("Sample sections for 125065:");
  console.table(res.rows);
  await client.end();
}
check().catch(console.error);
