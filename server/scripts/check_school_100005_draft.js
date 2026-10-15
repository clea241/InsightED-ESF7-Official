const { Pool } = require("../node_modules/pg");

const pool = new Pool({
  host: "stride-posgre-prod-01.postgres.database.azure.com",
  port: 5432,
  user: "Administrator1",
  password: "pRZTbQ2T1JD7",
  database: "insighted_esf7",
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT 
        payload->'sections' as sections,
        payload->'classSections' as class_sections,
        payload->'organizedClasses' as organized_classes,
        payload->'classes' as classes,
        payload->'alsSections' as als,
        payload->'aralSections' as aral,
        payload->'snedSections' as sned
      FROM school_drafts 
      WHERE school_id = '100005';
    `);
    console.log("Draft keys for 100005:");
    const row = res.rows[0];
    console.log({
      sections_count: row?.sections?.length,
      class_sections_count: row?.class_sections?.length,
      organized_classes_count: row?.organized_classes?.length,
      classes_count: row?.classes?.length,
      als_count: row?.als?.length,
      aral_count: row?.aral?.length,
      sned_count: row?.sned?.length,
    });
    if (row?.sections) console.log("sections:", row.sections);
    if (row?.class_sections) console.log("classSections:", row.class_sections);
    if (row?.organized_classes)
      console.log("organizedClasses:", row.organized_classes);
    if (row?.classes) console.log("classes:", row.classes);
    if (row?.sned) console.log("sned:", row.sned);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
