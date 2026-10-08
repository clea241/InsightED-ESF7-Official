const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const queueWorker = require('./queue_worker');

const sslConfig = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

async function inspectAndProcess() {
  const client = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: 'insighted_esf7',
    ssl: sslConfig
  });

  await client.connect();

  try {
    console.log('\n--- 1. Inspecting esf7_submission_queue ---');
    const qRes = await client.query(`
      SELECT id, school_id, school_year, status, error_message, created_at, updated_at 
      FROM esf7_submission_queue 
      ORDER BY id DESC 
      LIMIT 10;
    `);

    console.log(`Found ${qRes.rows.length} queue items:`);
    qRes.rows.forEach(r => {
      console.log(`• Job #${r.id} | School: ${r.school_id} | Status: ${r.status} | Error: ${r.error_message || 'None'}`);
    });

    // If there's a pending job or we want to re-process the latest job
    const pendingJobs = qRes.rows.filter(r => r.status === 'pending' || r.status === 'processing');
    if (pendingJobs.length > 0) {
      console.log(`\n--- 2. Processing ${pendingJobs.length} active/pending jobs with queue_worker ---`);
      for (const pj of pendingJobs) {
        await client.query(`UPDATE esf7_submission_queue SET status = 'pending' WHERE id = $1`, [pj.id]);
        await queueWorker.processNextJob();
      }
    } else if (qRes.rows.length > 0) {
      console.log(`\n--- 2. Re-processing latest job #${qRes.rows[0].id} with enhanced worker ---`);
      await client.query(`UPDATE esf7_submission_queue SET status = 'pending' WHERE id = $1`, [qRes.rows[0].id]);
      await queueWorker.processNextJob();
    }

    console.log('\n--- 3. Verifying esf7_personnel_designations in database ---');
    const dsgRes = await client.query(`
      SELECT id, personnel_id, designation_name, key_stage, grade_level, subject_area, track, serialized_key 
      FROM esf7_personnel_designations 
      ORDER BY created_at DESC 
      LIMIT 15;
    `);
    console.log(`Total designations found: ${dsgRes.rows.length}`);
    dsgRes.rows.forEach(r => {
      console.log(`• [${r.id}] Person: ${r.personnel_id} | Name: ${r.designation_name} | KS: ${r.key_stage || 'N/A'} | Grades: ${r.grade_level || 'N/A'} | Area: ${r.subject_area || 'N/A'}`);
    });

    console.log('\n--- 4. Verifying esf7_admin_task in database ---');
    const admRes = await client.query(`
      SELECT id, personnel_id, task_name, task_category, start_time, end_time, days, term, duration_minutes, term_total_hours 
      FROM esf7_admin_task 
      ORDER BY created_at DESC 
      LIMIT 15;
    `);
    console.log(`Total admin tasks found: ${admRes.rows.length}`);
    admRes.rows.forEach(r => {
      console.log(`• [${r.id}] Person: ${r.personnel_id} | Task: ${r.task_name} | Cat: ${r.task_category || 'N/A'} | Time: ${r.start_time || 'N/A'}-${r.end_time || 'N/A'} | Days: ${JSON.stringify(r.days)} | Term: ${r.term || 'N/A'} | Hours: ${r.term_total_hours}`);
    });

    console.log('\n----------------------------------------------\n');
  } finally {
    await client.end();
  }
}

inspectAndProcess().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
