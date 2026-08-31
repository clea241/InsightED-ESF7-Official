// Run the queue worker's processNextJob manually with verbose logging
const db = require('./db');

async function processNextJobDebug() {
  console.log('[DEBUG] Starting processNextJob...');
  const client = await db.pool.connect();
  try {
    // Auto-recover stuck processing jobs
    const recoverRes = await client.query(`
      UPDATE esf7_submission_queue
      SET status = 'pending', updated_at = NOW()
      WHERE status = 'processing'
        AND updated_at < NOW() - INTERVAL '2 minutes'
      RETURNING id
    `);
    if (recoverRes.rows.length > 0) {
      console.log('[DEBUG] Recovered stuck jobs:', recoverRes.rows.map(r => r.id));
    }

    const jobRes = await client.query(`
      SELECT id, school_id, school_year, payload, signature, certified_by 
      FROM esf7_submission_queue 
      WHERE status = 'pending' 
      ORDER BY id ASC 
      LIMIT 1 
      FOR UPDATE SKIP LOCKED
    `);

    if (jobRes.rows.length === 0) {
      console.log('[DEBUG] No pending jobs found.');
      client.release();
      return;
    }

    const job = jobRes.rows[0];
    console.log(`[DEBUG] Found job ID=${job.id}, school=${job.school_id}`);

    await client.query(
      `UPDATE esf7_submission_queue SET status = 'processing', updated_at = NOW() WHERE id = $1`,
      [job.id]
    );

    await client.query('BEGIN');

    const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
    console.log(`[DEBUG] Payload keys: ${Object.keys(payload).join(', ')}`);
    console.log(`[DEBUG] Personnel count: ${(payload.personnel || []).length}`);
    console.log(`[DEBUG] Class sections count: ${(payload.classSections || []).length}`);

    // Update school certification
    console.log('[DEBUG] Step 3: Updating school certification...');
    await client.query(
      `UPDATE schools 
       SET certified_by = $1, certified_signature = $2, certified_at = NOW(), updated_at = NOW()
       WHERE school_id = $3 AND school_year = $4`,
      [job.certified_by, job.signature, job.school_id, job.school_year]
    );

    // Clear old data
    console.log('[DEBUG] Step 4: Clearing old records...');
    await client.query('DELETE FROM class_sections WHERE school_id = $1 AND school_year = $2', [job.school_id, job.school_year]);
    await client.query('DELETE FROM workload_transfers WHERE school_id = $1 AND school_year = $2', [job.school_id, job.school_year]);
    await client.query('DELETE FROM personnel WHERE school_id = $1 AND school_year = $2', [job.school_id, job.school_year]);

    const personnelIdMap = {};
    const workloadRowIdMap = {};

    console.log('[DEBUG] Step 5: Inserting personnel...');
    let personCount = 0;
    for (const p of payload.personnel || []) {
      personCount++;
      console.log(`[DEBUG]   Inserting personnel ${personCount}: ${p.firstName} ${p.lastName} (id=${p.id})`);
      try {
        const rawId = p.id || p.personnel_id;
        const personnelId = (typeof rawId === 'string' && rawId.trim().startsWith('PER-')) 
          ? rawId.trim() 
          : generatePersonnelId();
        const pRes = await client.query(
          `INSERT INTO personnel (
            id, prn, school_id, school_year, type, salutation, first_name, middle_name, last_name, name_extension, 
            sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate, philsys_no, tin, no_tin, 
            employee_no, deped_email, deployment_status, personal_verified, workload_verified, profiling_code
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
          RETURNING id`,
          [
            personnelId,
            p.employeeReferenceId || p.prn,
            job.school_id, job.school_year, p.type || 'teaching',
            p.salutation || 'MR.', p.firstName, p.middleName || null, p.lastName, p.nameExtension || null,
            p.sexAtBirth || null, p.civilStatus || null, p.soloParent === true || p.soloParent === 'Yes',
            p.religion || null, p.ethnicGroup || null, p.birthdate || null, p.philsysNo || null,
            p.tin || null, p.noTin === true, p.employeeNo || null, p.depedEmail || '',
            p.deploymentStatus || 'Own Station', p.personalVerified === true, p.workloadVerified === true,
            p.profilingCode || 'AUTO'
          ]
        );
        personnelIdMap[p.id] = pRes.rows[0].id;
        console.log(`[DEBUG]   ✓ Personnel inserted with new id=${pRes.rows[0].id}`);
      } catch (insertErr) {
        console.error(`[DEBUG]   ✗ Failed to insert personnel ${p.firstName} ${p.lastName}:`, insertErr.message);
        throw insertErr;
      }
    }

    console.log('[DEBUG] Step 6: Inserting class sections...');
    for (const s of payload.classSections || []) {
      try {
        const sRes = await client.query(
          `INSERT INTO class_sections (school_id, school_year, grade_level, section_name, adviser_id, section_type)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [job.school_id, job.school_year, s.grade_level || '', s.section_name || '',
           s.adviser_id ? personnelIdMap[s.adviser_id] : null, s.section_type || 'Regular']
        );
        console.log(`[DEBUG]   ✓ Section inserted: ${s.grade_level} - ${s.section_name}`);
      } catch (secErr) {
        console.error(`[DEBUG]   ✗ Section insert failed:`, secErr.message);
        throw secErr;
      }
    }

    await client.query('COMMIT');
    await client.query(
      `UPDATE esf7_submission_queue SET status = 'completed', error_message = NULL, updated_at = NOW() WHERE id = $1`,
      [job.id]
    );
    console.log(`[DEBUG] Job ${job.id} COMPLETED successfully!`);
    client.release();
  } catch (err) {
    console.error('[DEBUG] Job FAILED:', err.message);
    console.error(err.stack);
    try {
      await client.query('ROLLBACK');
      await client.query(
        `UPDATE esf7_submission_queue SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
        [err.message, job ? job.id : 1]
      );
      console.log('[DEBUG] Job marked as failed.');
    } catch (rbErr) {
      console.error('[DEBUG] Rollback failed:', rbErr.message);
    }
    client.release();
  }
  process.exit(0);
}

processNextJobDebug();
