const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });
const localDb = require('./db');

const poolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const insightEdPool = new Pool({
  connectionString: poolString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Exact autoFill function to debug
async function autoFillPersonnelForSchool(schoolId) {
  try {
    const checkRes = await localDb.query('SELECT COUNT(*) FROM personnel WHERE school_id = $1', [schoolId]);
    console.log(`[Debug] Local personnel count for school ${schoolId}: ${checkRes.rows[0].count}`);
    if (parseInt(checkRes.rows[0].count) > 0) {
      console.log(`[AutoFill] Personnel already exists locally for school ${schoolId}. Skipping.`);
      return;
    }

    const schoolCheck = await localDb.query('SELECT * FROM schools WHERE school_id = $1 LIMIT 1', [schoolId]);
    let schoolYear = 'SY 26-27';
    if (schoolCheck.rows.length === 0) {
      console.log(`[AutoFill] School ${schoolId} not found in local schools table. Creating default record.`);
      const masterSchoolRes = await insightEdPool.query('SELECT * FROM unit1_school_identity WHERE school_id = $1 LIMIT 1', [schoolId]);
      const schoolName = masterSchoolRes.rows[0]?.school_name || 'Default School';
      const region = masterSchoolRes.rows[0]?.region || 'Region';
      const division = masterSchoolRes.rows[0]?.division || 'Division';
      
      await localDb.query(
        'INSERT INTO schools (school_id, school_name, region, division, school_year) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
        [schoolId, schoolName, region, division, schoolYear]
      );
    } else {
      schoolYear = schoolCheck.rows[0].school_year;
    }

    const masterRes = await insightEdPool.query('SELECT * FROM esf7_database WHERE school_id = $1', [schoolId]);
    console.log(`[AutoFill] Found ${masterRes.rows.length} teachers in master esf7_database.`);

    for (const teacher of masterRes.rows) {
      const client = await localDb.pool.connect();
      try {
        await client.query('BEGIN');

        const prn = teacher.prn || Math.floor(100000000000 + Math.random() * 900000000000).toString();
        const type = (teacher.type || 'teaching').toLowerCase();
        const salutation = teacher.salutation || 'MR.';
        const firstName = teacher.first_name || '';
        const middleName = teacher.middle_name || 'N/A';
        const lastName = teacher.last_name || '';
        const sexAtBirth = (teacher.sex_at_birth || 'Female').toUpperCase();
        const civilStatus = (teacher.civil_status || 'SINGLE').toUpperCase();
        const soloParent = teacher.solo_parent === true;
        const religion = teacher.religion || 'CHRISTIANITY';
        const ethnicGroup = teacher.ethnic_group || teacher.ehtinic_group || 'OTHERS';
        const birthdate = teacher.birthdate || null;
        const tin = teacher.tin || null;
        const employeeNo = teacher.employee_no || null;
        const deploymentStatus = (teacher.deployment_status || teacher.status__item_ || 'OWN STATION').toUpperCase();
        const profilingCode = teacher.profiling_code || Math.random().toString(36).substring(2, 8).toUpperCase();
        const depedEmail = teacher.deped_email || `change-me-${prn.replace(/[^a-zA-Z0-9]/g, '')}@deped.gov.ph`;

        console.log(`[Debug] Inserting teacher: ${firstName} ${lastName}`);

        const insertPersonnelQuery = `
          INSERT INTO personnel (
            prn, school_id, school_year, type, salutation, first_name, middle_name, last_name, 
            sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate, 
            philsys_no, tin, employee_no, deped_email, deployment_status, profiling_code
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          RETURNING id
        `;
        const personnelResult = await client.query(insertPersonnelQuery, [
          prn, schoolId, schoolYear, type, salutation, firstName, middleName, lastName,
          sexAtBirth, civilStatus, soloParent, religion, ethnicGroup, birthdate,
          null, tin, employeeNo, depedEmail, deploymentStatus, profilingCode
        ]);

        const personnelId = personnelResult.rows[0].id;

        // Insert into personnel_employment table
        const position = teacher.position || 'TEACHER I';
        const designation = teacher.designation || null;
        const fundSource = teacher.fund_source || 'NATIONAL';
        const natureOfAppointment = teacher.nature_of_appointment || 'REGULAR PERMANENT';
        const hiringArrangement = teacher.hiring_arrangement || 'REGULAR';
        const firstServiceDate = teacher.first_service_date || '2000-01-01';
        const lastPromotionDate = teacher.last_promotion_date || '2000-01-01';
        const newStationDate = teacher.new_station_date || '2000-01-01';

        const insertEmploymentQuery = `
          INSERT INTO personnel_employment (
            personnel_id, position, designation, fund_source, nature_of_appointment, 
            hiring_arrangement, first_service_date, last_promotion_date, new_station_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;
        await client.query(insertEmploymentQuery, [
          personnelId, position, designation, fundSource, natureOfAppointment,
          hiringArrangement, firstServiceDate, lastPromotionDate, newStationDate
        ]);

        // Insert into personnel_qualifications table
        const collegeDegree = teacher.college_degree || teacher.degree_finished__baccalaureate || 'N/A';
        const major = teacher.major || teacher.major__specialization || 'N/A';
        const minor = teacher.minor || 'N/A';
        const postGraduateDegree = teacher.post_graduate_degree || teacher.post_graduate__degree || 'N/A';
        const eligibility = teacher.eligibility || 'LICENSURE EXAMINATION FOR TEACHERS';

        const insertQualsQuery = `
          INSERT INTO personnel_qualifications (
            personnel_id, college_degree, major, minor, post_graduate_degree, eligibility
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await client.query(insertQualsQuery, [
          personnelId, collegeDegree, major, minor, postGraduateDegree, eligibility
        ]);

        await client.query('COMMIT');
        console.log(`[Debug] Successfully imported teacher: ${firstName} ${lastName}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[AutoFill] Error importing teacher ${teacher.first_name} ${teacher.last_name}:`, err);
      } finally {
        client.release();
      }
    }
  } catch (err) {
    console.error('[Debug] Outer error:', err);
  } finally {
    await insightEdPool.end();
  }
}

autoFillPersonnelForSchool('123456');
