const { prodPool } = require('../db');

async function normalizeDatabaseIDs() {
  console.log('--- Database ID Normalization & Migration ---');
  
  // 1. Normalize school_drafts where school_id is a UUID
  const draftRes = await prodPool.query(`
    SELECT school_id, school_year, payload 
    FROM school_drafts 
    WHERE school_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}'
  `);

  console.log(`Found ${draftRes.rows.length} drafts with UUID school_id`);
  for (const d of draftRes.rows) {
    const sInfo = d.payload && d.payload.schoolInfo;
    const realSchoolId = sInfo && (sInfo.schoolId || sInfo.school_id);
    const cleanRealId = realSchoolId ? String(realSchoolId).replace(/^SCH-/i, '').trim() : null;

    if (cleanRealId && /^\d{5,7}$/.test(cleanRealId)) {
      console.log(`Migrating draft UUID ${d.school_id} -> DepEd ID ${cleanRealId} (${sInfo.schoolName || ''})`);
      
      // Upsert under the clean school ID
      await prodPool.query(`
        INSERT INTO school_drafts (school_id, school_year, payload, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (school_id, school_year)
        DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `, [cleanRealId, d.school_year || 'SY 26-27', JSON.stringify(d.payload)]);

      // Delete old UUID row
      await prodPool.query(`
        DELETE FROM school_drafts WHERE school_id = $1 AND school_year = $2
      `, [d.school_id, d.school_year]);
    }
  }

  // 2. Check remaining UUIDs in esf7_personnel_profile
  const profileRes = await prodPool.query(`
    SELECT id, prn, school_id, first_name, last_name
    FROM esf7_personnel_profile
    WHERE school_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}'
  `);

  console.log(`Found ${profileRes.rows.length} personnel profiles with UUID school_id:`);

  if (profileRes.rows.length > 0) {
    // Attempt SQL-level jsonb search for matching personnel in school_drafts
    for (const p of profileRes.rows) {
      // Find school_id from school_drafts where the draft's personnel array contains this person's ID, PRN or Name
      const matchRes = await prodPool.query(`
        SELECT school_id, payload->'schoolInfo'->>'schoolId' as real_id
        FROM school_drafts,
             jsonb_array_elements(payload->'personnel') as p_elem
        WHERE (
          p_elem->>'id' = $1 
          OR (p_elem->>'prn' = $2 AND $2 != '')
          OR (
            UPPER(p_elem->>'firstName') = UPPER($3) 
            AND UPPER(p_elem->>'lastName') = UPPER($4)
          )
        )
        AND (school_id ~ '^\\d{5,7}$' OR payload->'schoolInfo'->>'schoolId' ~ '^\\d{5,7}$')
        LIMIT 1
      `, [p.id, p.prn || '', p.first_name || '', p.last_name || '']);

      if (matchRes.rows.length > 0) {
        const targetId = matchRes.rows[0].real_id || matchRes.rows[0].school_id;
        console.log(`Mapped personnel ${p.first_name} ${p.last_name} (${p.id}) -> School ID ${targetId}`);
        await prodPool.query(`
          UPDATE esf7_personnel_profile
          SET school_id = $1, updated_at = NOW()
          WHERE id = $2
        `, [targetId, p.id]);
      } else {
        console.log(`Notice: No draft match found for UUID personnel ${p.first_name} ${p.last_name} (${p.id})`);
      }
    }
  }

  // Verification counts
  const countDrafts = await prodPool.query(`SELECT count(*)::int as c FROM school_drafts WHERE school_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}'`);
  const countProfiles = await prodPool.query(`SELECT count(*)::int as c FROM esf7_personnel_profile WHERE school_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}'`);
  const totalDrafts = await prodPool.query(`SELECT count(*)::int as c FROM school_drafts`);
  const totalProfiles = await prodPool.query(`SELECT count(*)::int as c FROM esf7_personnel_profile`);

  console.log(`\n=== Verification Results ===`);
  console.log(`Total drafts in DB: ${totalDrafts.rows[0].c}`);
  console.log(`Remaining UUID drafts: ${countDrafts.rows[0].c}`);
  console.log(`Total personnel profiles in DB: ${totalProfiles.rows[0].c}`);
  console.log(`Remaining UUID personnel profiles: ${countProfiles.rows[0].c}`);
  console.log('✅ Normalization complete!');
}

normalizeDatabaseIDs().then(() => process.exit(0)).catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
