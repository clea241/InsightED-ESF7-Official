require('dotenv').config({ path: __dirname + '/.env' });
const db = require('./db');

async function main() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🚀 Seeding 1999XX Pilot Sandbox Schools (199901 - 199921)...');

    const schoolYear = 'SY 26-27';

    for (let i = 1; i <= 21; i++) {
      const numStr = String(i).padStart(2, '0');
      const schoolId = `1999${numStr}`;
      const schoolName = `Pilot Sandbox Integrated School ${numStr}`;

      // 1. Insert into insighted_esf7_pilot
      await client.query(`DELETE FROM insighted_esf7_pilot WHERE school_id = $1`, [schoolId]);
      await client.query(`
        INSERT INTO insighted_esf7_pilot (school_id, name, position, is_pilot, created_at)
        VALUES ($1, 'PILOT TESTER', 'TEACHER I', true, NOW())
      `, [schoolId]);

      // 2. Insert into schools
      await client.query(`
        INSERT INTO schools (id, school_id, school_name, school_year, region, division, district, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'NCR', 'Division of Manila', 'District I', NOW(), NOW())
        ON CONFLICT (id)
        DO UPDATE SET school_name = EXCLUDED.school_name, updated_at = NOW();
      `, [schoolId, schoolId, schoolName, schoolYear]);

      // 3. Create Class Sections for Elem, JHS, and SHS
      const sectionIds = {
        g1: `SEC-${schoolId}-G1`,
        g7: `SEC-${schoolId}-G7`,
        g11: `SEC-${schoolId}-G11`
      };

      await client.query(`
        INSERT INTO class_sections (id, school_id, school_year, grade_level, section_name)
        VALUES 
          ($1, $4, $5, 'Grade 1', 'Grade 1 - Sampaguita'),
          ($2, $4, $5, 'Grade 7', 'Grade 7 - Rizal'),
          ($3, $4, $5, 'Grade 11', 'Grade 11 - STEM A')
        ON CONFLICT (id) DO NOTHING;
      `, [sectionIds.g1, sectionIds.g7, sectionIds.g11, schoolId, schoolYear]);

      // 4. Create Dummy Personnel for this school
      const teacher1Id = `PILOT-P-${schoolId}-1`;
      const teacher2Id = `PILOT-P-${schoolId}-2`;

      await client.query(`
        INSERT INTO personnel (id, school_id, school_year, prn, salutation, profiling_code, first_name, last_name, middle_name, type, is_school_head, created_at, updated_at)
        VALUES 
          ($1, $3, $4, $5, 'MR.', $7, 'JUAN', 'DELA CRUZ', 'A', 'teaching', false, NOW(), NOW()),
          ($2, $3, $4, $6, 'MS.', $8, 'MARIA', 'SANTOS', 'B', 'teaching', false, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name;
      `, [teacher1Id, teacher2Id, schoolId, schoolYear, `PRN-${schoolId}-1`, `PRN-${schoolId}-2`, `PFC-${schoolId}-1`, `PFC-${schoolId}-2`]);

      // Insert Employment details
      await client.query(`
        INSERT INTO personnel_employment (id, personnel_id, position, step_number, teaches_shs, fund_source, nature_of_appointment, hiring_arrangement, first_service_date, last_promotion_date, new_station_date, last_lateral_movement_date)
        VALUES 
          ($3, $1, 'TEACHER I', 1, false, 'NATIONAL', 'REGULAR PERMANENT', 'REGULAR', '2015-06-01', '2018-06-01', '2015-06-01', '2015-06-01'),
          ($4, $2, 'MASTER TEACHER I', 2, true, 'NATIONAL', 'REGULAR PERMANENT', 'REGULAR', '2010-06-01', '2020-06-01', '2010-06-01', '2010-06-01')
        ON CONFLICT (personnel_id) DO UPDATE SET position = EXCLUDED.position;
      `, [teacher1Id, teacher2Id, `EMP-${schoolId}-1`, `EMP-${schoolId}-2`]);

      // 5. Insert Workload Rows for Teacher 1 (JUAN DELA CRUZ - Elementary & JHS)
      await client.query(`
        DELETE FROM workload_rows WHERE personnel_id = $1;
      `, [teacher1Id]);

      await client.query(`
        INSERT INTO workload_rows (id, personnel_id, school_id, school_year, row_type, subject, grade_level, section_id, start_time, end_time, days)
        VALUES 
          ($1, $6, $7, $8, 'teaching', 'ENGLISH', 'Grade 1', $9, '07:30', '08:30', '{"M","T","W","TH","F"}'),
          ($2, $6, $7, $8, 'teaching', 'MATHEMATICS', 'Grade 1', $9, '08:30', '09:30', '{"M","T","W","TH","F"}'),
          ($3, $6, $7, $8, 'teaching', 'SCIENCE', 'Grade 7', $10, '10:00', '11:30', '{"M","T","W","TH","F"}'),
          ($4, $6, $7, $8, 'teaching', 'FILIPINO', 'Grade 7', $10, '13:00', '14:30', '{"M","T","W","TH","F"}'),
          ($5, $6, $7, $8, 'teaching', 'ADVISORY', 'Grade 1', $9, '07:00', '07:30', '{"M","T","W","TH","F"}');
      `, [
        `WKL-${schoolId}-1-1`, `WKL-${schoolId}-1-2`, `WKL-${schoolId}-1-3`, `WKL-${schoolId}-1-4`, `WKL-${schoolId}-1-5`,
        teacher1Id, schoolId, schoolYear, sectionIds.g1, sectionIds.g7
      ]);

      // 6. Insert Workload Rows for Teacher 2 (MARIA SANTOS - SHS & Overload test candidate)
      await client.query(`
        DELETE FROM workload_rows WHERE personnel_id = $1;
      `, [teacher2Id]);

      await client.query(`
        INSERT INTO workload_rows (id, personnel_id, school_id, school_year, row_type, subject, grade_level, section_id, start_time, end_time, days)
        VALUES 
          ($1, $5, $6, $7, 'teaching', 'GENERAL MATHEMATICS', 'Grade 11', $8, '07:30', '09:30', '{"M","T","W","TH","F"}'),
          ($2, $5, $6, $7, 'teaching', 'PRE-CALCULUS', 'Grade 11', $8, '09:30', '11:30', '{"M","T","W","TH","F"}'),
          ($3, $5, $6, $7, 'teaching', 'PHYSICS 1', 'Grade 11', $8, '13:00', '15:30', '{"M","T","W","TH","F"}'),
          ($4, $5, $6, $7, 'teaching', 'ADVISORY', 'Grade 11', $8, '07:00', '07:30', '{"M","T","W","TH","F"}');
      `, [
        `WKL-${schoolId}-2-1`, `WKL-${schoolId}-2-2`, `WKL-${schoolId}-2-3`, `WKL-${schoolId}-2-4`,
        teacher2Id, schoolId, schoolYear, sectionIds.g11
      ]);
    }

    await client.query('COMMIT');
    console.log('✅ Successfully seeded 21 Pilot Sandbox Schools (199901 - 199921) with full K-12 offerings and workload demo data!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err.message);
  } finally {
    client.release();
    db.pool.end();
  }
}

main();
