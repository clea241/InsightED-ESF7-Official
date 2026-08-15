const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  database: 'insightEd',
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log("⚡ Fast single-pass scan of esf7_database for 'ADMIN' or 'ADMINISTRATIVE'...");

    // Build single query checking subject_1..20 and lvl_1..20
    const checks = [];
    for (let i = 1; i <= 20; i++) {
      const sCol = i === 1 ? 'subject_1' : `subject_1_${i}`;
      const lCol = i === 1 ? 'lvl_1' : `lvl_1_${i}`;
      checks.push(`UPPER("${sCol}"::text) LIKE '%ADMIN%'`);
      checks.push(`UPPER("${lCol}"::text) LIKE '%ADMIN%'`);
    }

    const query = `
      SELECT id, last_first, school_name, position,
             subject_1, lvl_1, section_1,
             subject_1_2, lvl_1_2, section_1_2,
             subject_1_3, lvl_1_3, section_1_3,
             subject_1_4, lvl_1_4, section_1_4,
             subject_1_5, lvl_1_5, section_1_5,
             subject_1_6, lvl_1_6, section_1_6,
             subject_1_7, lvl_1_7, section_1_7,
             subject_1_8, lvl_1_8, section_1_8,
             subject_1_9, lvl_1_9, section_1_9,
             subject_1_10, lvl_1_10, section_1_10,
             subject_1_11, lvl_1_11, section_1_11,
             subject_1_12, lvl_1_12, section_1_12,
             subject_1_13, lvl_1_13, section_1_13,
             subject_1_14, lvl_1_14, section_1_14,
             subject_1_15, lvl_1_15, section_1_15,
             subject_1_16, lvl_1_16, section_1_16,
             subject_1_17, lvl_1_17, section_1_17,
             subject_1_18, lvl_1_18, section_1_18,
             subject_1_19, lvl_1_19, section_1_19,
             subject_1_20, lvl_1_20, section_1_20
      FROM esf7_database
      WHERE ${checks.join(' OR ')}
      LIMIT 20;
    `;

    const res = await pool.query(query);
    console.log(`\nResults: Found ${res.rows.length} personnel with 'ADMIN'/'ADMINISTRATIVE' in subject/level columns:\n`);

    if (res.rows.length === 0) {
      console.log("❌ No records found with 'ADMIN' or 'ADMINISTRATIVE' in subject_1..20 or lvl_1..20.");
    }

    res.rows.forEach((r, idx) => {
      console.log(`👤 Record ${idx + 1}: ${r.last_first} | Position: "${r.position}" | School: ${r.school_name}`);
      for (let i = 1; i <= 20; i++) {
        const sKey = i === 1 ? 'subject_1' : `subject_1_${i}`;
        const lKey = i === 1 ? 'lvl_1' : `lvl_1_${i}`;
        const secKey = i === 1 ? 'section_1' : `section_1_${i}`;
        const sVal = r[sKey];
        const lVal = r[lKey];
        const secVal = r[secKey];
        
        if ((sVal && sVal.toUpperCase().includes('ADMIN')) || (lVal && String(lVal).toUpperCase().includes('ADMIN'))) {
          console.log(`    👉 Slot ${i}: Subject="${sVal}", Level="${lVal}", Section="${secVal}"`);
        }
      }
    });

    // Also check position or administrative column summary
    const posRes = await pool.query(`SELECT DISTINCT position, count(*) FROM esf7_database WHERE UPPER(position) LIKE '%ADMIN%' GROUP BY position`);
    console.log("\n📋 Positions matching 'ADMIN':", posRes.rows);

    const adminColRes = await pool.query(`SELECT DISTINCT administrative, count(*) FROM esf7_database WHERE administrative IS NOT NULL AND administrative != 0 GROUP BY administrative LIMIT 10`);
    console.log("\n📋 Sample 'administrative' column values:", adminColRes.rows);

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

run();
