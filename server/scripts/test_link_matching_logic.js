const { Pool } = require('../node_modules/pg');

const pool = new Pool({
  host: 'stride-posgre-prod-01.postgres.database.azure.com',
  port: 5432,
  user: 'Administrator1',
  password: 'pRZTbQ2T1JD7',
  database: 'insighted_esf7',
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

async function main() {
  const client = await pool.connect();
  try {
    // Test on 3 schools: 100009, 100011, 100018
    const testSchools = ['100009', '100011', '100018'];

    for (const schoolId of testSchools) {
      console.log(`\n================ Testing School ${schoolId} ================`);
      
      // Load all sections for this school from all 4 tables
      const regSec = (await client.query('SELECT id, section_name, grade_level, \'regular\' as tbl FROM esf7_regular_sections WHERE school_id = $1', [schoolId])).rows;
      const snedSec = (await client.query('SELECT id, section_name, grade_level, \'sned\' as tbl FROM esf7_sned_sections WHERE school_id = $1', [schoolId])).rows;
      const alsSec = (await client.query('SELECT id, section_name, grade_level, \'als\' as tbl FROM esf7_als_sections WHERE school_id = $1', [schoolId])).rows;
      const aralSec = (await client.query('SELECT id, section_name, grade_level, \'aral\' as tbl FROM esf7_aral_sections WHERE school_id = $1', [schoolId])).rows;
      
      const allSec = [...regSec, ...snedSec, ...alsSec, ...aralSec];
      console.log(`Loaded ${allSec.length} sections (${regSec.length} reg, ${snedSec.length} sned, ${alsSec.length} als, ${aralSec.length} aral)`);

      const wklRows = (await client.query('SELECT id, section_id, section_name, grade_level, subject FROM esf7_workload_rows WHERE school_id = $1', [schoolId])).rows;
      console.log(`Loaded ${wklRows.length} workloads`);

      let matchedCount = 0;
      let alreadyDirectCount = 0;
      const sampleUpdates = [];

      for (const w of wklRows) {
        // 1. Direct check
        const direct = allSec.find(s => s.id === w.section_id);
        if (direct) {
          alreadyDirectCount++;
          continue;
        }

        if (!w.section_name) continue;

        const rawName = w.section_name.trim().toUpperCase();
        const cleanName = rawName.split('/')[0].trim();
        const wGrade = (w.grade_level || '').trim().toUpperCase();

        // 2. Exact name + grade match in regular
        let match = regSec.find(s => s.section_name.trim().toUpperCase() === rawName && (s.grade_level || '').trim().toUpperCase() === wGrade);
        
        // 3. Exact cleanName + grade match in regular
        if (!match && cleanName !== rawName) {
          match = regSec.find(s => s.section_name.trim().toUpperCase() === cleanName && (s.grade_level || '').trim().toUpperCase() === wGrade);
        }

        // 4. Exact name match in regular (if unique or first)
        if (!match) {
          match = regSec.find(s => s.section_name.trim().toUpperCase() === rawName);
        }

        // 5. Clean name match in regular
        if (!match && cleanName !== rawName) {
          match = regSec.find(s => s.section_name.trim().toUpperCase() === cleanName);
        }

        // 6. Check SNED sections
        if (!match) {
          match = snedSec.find(s => s.section_name.trim().toUpperCase() === rawName || s.section_name.trim().toUpperCase() === cleanName);
        }

        // 7. Check ALS sections
        if (!match) {
          match = alsSec.find(s => s.section_name.trim().toUpperCase() === rawName || s.section_name.trim().toUpperCase() === cleanName);
        }

        // 8. Check ARAL sections
        if (!match) {
          match = aralSec.find(s => s.section_name.trim().toUpperCase() === rawName || s.section_name.trim().toUpperCase() === cleanName);
        }

        if (match) {
          matchedCount++;
          if (sampleUpdates.length < 5) {
            sampleUpdates.push({
              wkl_id: w.id,
              subject: w.subject,
              old_sec_id: w.section_id,
              new_sec_id: match.id,
              source_table: match.tbl,
              wkl_sec_name: w.section_name,
              target_sec_name: match.section_name
            });
          }
        }
      }

      console.log(`Results for ${schoolId}: direct=${alreadyDirectCount}, newly_matched=${matchedCount}, unmatched=${wklRows.length - alreadyDirectCount - matchedCount}`);
      console.log('Sample updates:');
      console.log(sampleUpdates);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
