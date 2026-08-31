const db = require('./server/db');

async function insertTestSubmissions() {
  try {
    const now = Date.now();
    
    // 1. For School 199998 (Ana Marie Villanueva)
    const subId1 = `SUB-PER-199998-003-${now}`;
    await db.query(`
      INSERT INTO esf7_personnel_submission (id, school_id, personnel_id, personnel_name, room_name, status, payload_json, created_timestamp, created_at)
      VALUES ($1, '199998', 'PER-199998-003', 'ANA MARIE VILLANUEVA', 'Faculty Room 1', 'PENDING', $2, $3, NOW())
      ON CONFLICT (id) DO NOTHING;
    `, [subId1, JSON.stringify({
      id: 'PER-199998-003',
      firstName: 'ANA MARIE',
      lastName: 'VILLANUEVA',
      middleName: 'SANTOS',
      civilStatus: 'Married',
      tin: '987-654-321-000',
      position: 'Teacher I'
    }), now]);

    // 2. For School 502949 (Liza Pareja)
    const subId2 = `SUB-PER-502949-001-${now}`;
    await db.query(`
      INSERT INTO esf7_personnel_submission (id, school_id, personnel_id, personnel_name, room_name, status, payload_json, created_timestamp, created_at)
      VALUES ($1, '502949', 'PER-502949-001', 'LIZA PAREJA', 'Faculty Room 1', 'PENDING', $2, $3, NOW())
      ON CONFLICT (id) DO NOTHING;
    `, [subId2, JSON.stringify({
      id: 'PER-502949-001',
      firstName: 'LIZA',
      lastName: 'PAREJA',
      civilStatus: 'Married',
      tin: '123-456-789-000',
      position: 'Teacher I'
    }), now]);

    console.log('✅ Test submissions inserted for 199998 and 502949.');
    process.exit(0);
  } catch (err) {
    console.error('Error inserting test:', err.message);
    process.exit(1);
  }
}

insertTestSubmissions();
