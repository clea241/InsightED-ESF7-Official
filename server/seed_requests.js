/**
 * Seed Requests Dummy Data
 * 
 * Inserts some dummy incoming requests into clustered_connections 
 * so that the user can immediately test the Approve/Reject flow in the UI.
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insighted_esf7`,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function seed() {
  try {
    console.log('Seeding dummy Request Center connection requests...');

    // Clear existing requests first
    await db.query('DELETE FROM clustered_connections');

    // We'll target the school IDs we used for pilot logins (e.g. 130113, 123325, 312311, 500273)
    // so they see incoming requests when logged in.
    
    const pilotSchools = [
      '130113', '123325', '104126', '114196',
      '312311', '300844', '300744',
      '500273', '500522', '500369'
    ];

    // Dummy teacher names to simulate multiple clustered teachers per school
    const dummyTeachers = [
      { id: 'temp-p-101', name: 'DELA CRUZ, JUAN A.' },
      { id: 'temp-p-102', name: 'SANTOS, MARIA LOURDES B.' },
      { id: 'temp-p-103', name: 'REYES, ROBERTO C.' },
      { id: 'temp-p-104', name: 'GARCIA, ANNA MARIE D.' },
    ];

    for (let i = 0; i < pilotSchools.length; i++) {
      const targetSchool = pilotSchools[i];
      // Use the next school in the list as the requester (circular)
      const requesterSchool = pilotSchools[(i + 1) % pilotSchools.length];
      // Use a second school as a secondary requester to simulate more diversity
      const requesterSchool2 = pilotSchools[(i + 2) % pilotSchools.length];

      // Retrieve actual pilot personnel from requesterSchool
      const reqPersonnel = await db.query(
        `SELECT id, name FROM insighted_esf7_pilot WHERE school_id = $1 LIMIT 2`,
        [requesterSchool]
      );

      // Retrieve actual pilot personnel from requesterSchool2
      const reqPersonnel2 = await db.query(
        `SELECT id, name FROM insighted_esf7_pilot WHERE school_id = $1 LIMIT 1`,
        [requesterSchool2]
      );

      // 1. Add clustered teacher requests from requesterSchool
      if (reqPersonnel.rows.length > 0) {
        for (const p of reqPersonnel.rows) {
          await db.query(`
            INSERT INTO clustered_connections 
              (requester_school_id, target_school_id, personnel_id, personnel_name, request_type, status)
            VALUES ($1, $2, $3, $4, 'clustered_teacher', 'pending')
          `, [requesterSchool, targetSchool, String(p.id), p.name]);
        }
      } else {
        // Fallback if no personnel found
        await db.query(`
          INSERT INTO clustered_connections 
            (requester_school_id, target_school_id, personnel_id, personnel_name, request_type, status)
          VALUES ($1, $2, 'temp-p-101', 'DELA CRUZ, JUAN A.', 'clustered_teacher', 'pending')
        `, [requesterSchool, targetSchool]);
      }

      // 2. Add clustered teacher request from requesterSchool2
      if (reqPersonnel2.rows.length > 0) {
        const p = reqPersonnel2.rows[0];
        await db.query(`
          INSERT INTO clustered_connections 
            (requester_school_id, target_school_id, personnel_id, personnel_name, request_type, status)
          VALUES ($1, $2, $3, $4, 'clustered_teacher', 'pending')
        `, [requesterSchool2, targetSchool, String(p.id), p.name]);
      } else {
        // Fallback if no personnel found
        await db.query(`
          INSERT INTO clustered_connections 
            (requester_school_id, target_school_id, personnel_id, personnel_name, request_type, status)
          VALUES ($1, $2, 'temp-p-103', 'REYES, ROBERTO C.', 'clustered_teacher', 'pending')
        `, [requesterSchool2, targetSchool]);
      }

      // 3. Add school merger request
      await db.query(`
        INSERT INTO clustered_connections 
          (requester_school_id, target_school_id, request_type, status)
        VALUES ($1, $2, 'school_merger', 'pending')
      `, [requesterSchool, targetSchool]);
    }

    console.log('✅ Dummy requests seeded successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to seed requests:', err.message);
    process.exit(1);
  }
}

seed();
