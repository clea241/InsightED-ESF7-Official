/**
 * ESF7 Pilot Seeder
 * 
 * 1. Picks 10 random schools from insightEd.esf7_database (READ-ONLY)
 * 2. Clones their personnel rows into insighted_esf7.insighted_esf7_pilot with anonymized names
 * 3. Randomizes curricular offering per school
 * 4. Prints hardcoded pilot credentials at the end
 * 
 * SAFE: Does NOT modify insightEd or insighted_esf7 main tables.
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// ── Connection to insightEd (READ-ONLY source) ─────────────────────────────
const sourcePoolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const sourcePool = new Pool({
  connectionString: sourcePoolString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// ── Connection to insighted_esf7 (target database) ────────────────────────
const targetPool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insighted_esf7`,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// ── Helpers ───────────────────────────────────────────────────────────────
function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Curricular Offering mapping by school_id prefix ──────────────────────
function getOfferingByPrefix(schoolId) {
  const prefix = String(schoolId)[0];
  if (prefix === '1') return ['Elementary'];
  if (prefix === '3') {
    // JHS or SHS or both — randomly pick one
    const jhs_shs = [['JHS'], ['SHS'], ['JHS', 'SHS']];
    return randomFrom(jhs_shs);
  }
  if (prefix === '5') return ['Elementary', 'JHS', 'SHS'];
  // Fallback for other prefixes
  return ['Elementary', 'JHS', 'SHS'];
}

// ── Main Seeder ───────────────────────────────────────────────────────────
async function seed() {
  const client = await targetPool.connect();

  try {
    console.log('\n🌱 Starting ESF7 Pilot Seeder (with school_id prefix-based curricular offering)...\n');

    // ── Step 1: Create insighted_esf7_pilot table ───────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS insighted_esf7_pilot (
        id SERIAL PRIMARY KEY,
        esf7_id TEXT,
        school_id TEXT,
        iern TEXT,
        semester TEXT,
        -- Anonymized personal info
        name TEXT,
        sex TEXT,
        civil_status TEXT,
        birthday_mm TEXT,
        birthday_dd TEXT,
        birthday_yyyy TEXT,
        phylsys_num TEXT,
        -- Employment info (kept realistic from source)
        position TEXT,
        nature_of_appointment TEXT,
        fund_source TEXT,
        status__item_ TEXT,
        eligibility TEXT,
        appt_mm TEXT,
        appt_dd TEXT,
        appt_yyyy TEXT,
        station_mm TEXT,
        station_dd TEXT,
        station_yyyy TEXT,
        -- Education
        major_specialization TEXT,
        -- Time allocations (kept realistic from source)
        time_major TEXT,
        time_nonmajor TEXT,
        time_ancillary_curriculum TEXT,
        time_ancillary_admin_management TEXT,
        time_ancillary_professional_development TEXT,
        time_ancillary_program__project TEXT,
        time_ancillary_inter__agency TEXT,
        time_advisory TEXT,
        time_related_tasks TEXT,
        time_administrative TEXT,
        time_home_guidance TEXT,
        time_gmrc TEXT,
        all_time TEXT,
        total_trainings TEXT,
        -- Curricular offering (based on school_id prefix)
        curricular_offering TEXT[],
        -- Meta
        is_pilot BOOLEAN DEFAULT TRUE,
        pilot_password TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✅ Table insighted_esf7_pilot ready.\n');

    // ── Step 2: Pick 10 random schools by prefix groups ────────────────────
    // 4 Elementary (prefix 1), 3 JHS/SHS (prefix 3), 3 All offering (prefix 5)
    console.log('📋 Picking pilot schools by school_id prefix from insightEd.esf7_database...');

    async function pickSchoolsByPrefix(prefix, limit) {
      const res = await sourcePool.query(`
        SELECT school_id, COUNT(*) as personnel_count
        FROM esf7_database
        WHERE school_id LIKE $1 AND school_id IS NOT NULL AND school_id != ''
        GROUP BY school_id
        HAVING COUNT(*) BETWEEN 5 AND 60
        ORDER BY RANDOM()
        LIMIT $2
      `, [`${prefix}%`, limit]);
      return res.rows;
    }

    const elem    = await pickSchoolsByPrefix('1', 4);
    const jhsShs  = await pickSchoolsByPrefix('3', 3);
    const allOff  = await pickSchoolsByPrefix('5', 3);
    const pilotSchools = [...elem, ...jhsShs, ...allOff];

    console.log(`→ Selected ${pilotSchools.length} pilot schools:\n`);
    pilotSchools.forEach(s => {
      const offering = getOfferingByPrefix(s.school_id);
      console.log(`   School ID: ${s.school_id} (prefix ${s.school_id[0]}) | Personnel: ${s.personnel_count} | Offering: ${offering.join(', ')}`);
    });

    const PILOT_PASSWORD = 'Pilot2026!';
    const credentials = [];

    // ── Step 3: Clear old pilot data ───────────────────────────────────────
    await client.query(`DELETE FROM insighted_esf7_pilot`);
    console.log('\n🗑️  Cleared old pilot data.\n');

    // ── Step 4: Seed each school ───────────────────────────────────────────
    const DUMMY_FIRST_NAMES = [
      'Maria', 'Jose', 'Ana', 'Juan', 'Rosa', 'Carlo', 'Linda', 'Ramon',
      'Grace', 'Miguel', 'Elena', 'Eduardo', 'Liza', 'Fernando', 'Cristina',
      'Antonio', 'Maricel', 'Roberto', 'Teresita', 'Danilo'
    ];
    const DUMMY_LAST_NAMES = [
      'Santos', 'Reyes', 'Cruz', 'Garcia', 'Mendoza', 'Torres', 'Flores',
      'Bautista', 'Ramos', 'Lopez', 'Gonzales', 'Castillo', 'Villanueva',
      'Rivera', 'Aquino', 'De Leon', 'Soriano', 'Pascual', 'Dela Cruz', 'Hernandez'
    ];
    function randomDummyName() {
      const first = DUMMY_FIRST_NAMES[Math.floor(Math.random() * DUMMY_FIRST_NAMES.length)];
      const last  = DUMMY_LAST_NAMES[Math.floor(Math.random() * DUMMY_LAST_NAMES.length)];
      return { full: `${last}, ${first}` };
    }

    for (const school of pilotSchools) {
      const schoolId = school.school_id;
      const currOffer = getOfferingByPrefix(schoolId);

      // Fetch all personnel rows for this school from source
      const personnelRes = await sourcePool.query(`
        SELECT *
        FROM esf7_database
        WHERE school_id = $1
      `, [schoolId]);

      const rows = personnelRes.rows;
      let insertedCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const dummyName = randomDummyName(i);

        await client.query(`
          INSERT INTO insighted_esf7_pilot (
            esf7_id, school_id, iern, semester,
            name, sex, civil_status,
            birthday_mm, birthday_dd, birthday_yyyy,
            phylsys_num,
            position, nature_of_appointment, fund_source, status__item_, eligibility,
            appt_mm, appt_dd, appt_yyyy, station_mm, station_dd, station_yyyy,
            major_specialization,
            time_major, time_nonmajor, time_ancillary_curriculum,
            time_ancillary_admin_management, time_ancillary_professional_development,
            time_ancillary_program__project, time_ancillary_inter__agency,
            time_advisory, time_related_tasks, time_administrative,
            time_home_guidance, time_gmrc, all_time, total_trainings,
            curricular_offering, is_pilot, pilot_password
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7,
            $8, $9, $10,
            $11,
            $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22,
            $23,
            $24, $25, $26,
            $27, $28,
            $29, $30,
            $31, $32, $33,
            $34, $35, $36, $37,
            $38, $39, $40
          )
        `, [
          row.esf7_id,                   // $1
          schoolId,                       // $2
          row.iern,                       // $3
          row.semester,                   // $4
          // Anonymized personal info
          dummyName.full,                 // $5 name
          row.sex || (Math.random() > 0.5 ? 'M' : 'F'), // $6
          row.civil_status || 'SINGLE',   // $7
          row.birthday_mm || 'JANUARY',   // $8
          row.birthday_dd || '01',        // $9
          row.birthday_yyyy || '1990',    // $10
          'PILOT-XXXX-XXXX',             // $11 phylsys_num - anonymized
          // Employment (kept realistic)
          row.position,                   // $12
          row.nature_of_appointment,      // $13
          row.fund_source,               // $14
          row['status__item_'],           // $15
          row.eligibility,               // $16
          row.appt_mm,                   // $17
          row.appt_dd,                   // $18
          row.appt_yyyy,                 // $19
          row.station_mm,                // $20
          row.station_dd,                // $21
          row.station_yyyy,              // $22
          row.major_specialization,      // $23
          // Time allocations
          row.time_major,                // $24
          row.time_nonmajor,             // $25
          row.time_ancillary_curriculum, // $26
          row.time_ancillary_admin_management,             // $27
          row.time_ancillary_professional_development,     // $28
          row['time_ancillary_program__project'],          // $29
          row['time_ancillary_inter__agency'],             // $30
          row.time_advisory,             // $31
          row.time_related_tasks,        // $32
          row.time_administrative,       // $33
          row.time_home_guidance,        // $34
          row.time_gmrc,                 // $35
          row.all_time,                  // $36
          row.total_trainings,           // $37
          // Randomized curricular offering
          currOffer,                     // $38
          true,                          // $39 is_pilot
          PILOT_PASSWORD                 // $40 pilot_password
        ]);

        insertedCount++;
      }

      console.log(`✅ School ${schoolId}: Seeded ${insertedCount} dummy personnel | Offering: [${currOffer.join(', ')}]`);
      credentials.push({
        schoolId,
        personnelCount: insertedCount,
        curricularOffering: currOffer,
        password: PILOT_PASSWORD
      });
    }

    // ── Step 5: Print pilot credentials ───────────────────────────────────
    console.log('\n\n' + '='.repeat(60));
    console.log('🔑  PILOT SCHOOL HARDCODED CREDENTIALS');
    console.log('='.repeat(60));
    credentials.forEach((c, i) => {
      console.log(`\n[${i + 1}] School ID : ${c.schoolId}`);
      console.log(`    Password  : ${c.password}`);
      console.log(`    Personnel : ${c.personnelCount} dummy records`);
      console.log(`    Offering  : ${c.curricularOffering.join(', ')}`);
    });
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Pilot seeding complete!');

    // ── Step 6: Write credentials to a local JSON file for reference ───────
    const fs = require('fs');
    const credPath = path.join(__dirname, 'pilot_credentials.json');
    fs.writeFileSync(credPath, JSON.stringify({ 
      generatedAt: new Date().toISOString(),
      pilotPassword: PILOT_PASSWORD,
      schools: credentials 
    }, null, 2));
    console.log(`\n📄 Credentials saved to: ${credPath}`);

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Seeder failed:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
  }
}

seed();
