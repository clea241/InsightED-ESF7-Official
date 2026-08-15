const db = require('./db');

async function main() {
  try {
    console.log('🧹 Cleaning up schools table...');
    await db.query(`DELETE FROM schools WHERE school_name LIKE '%Sample National%' OR school_name LIKE '%TEST K-12%' OR school_id = '123456'`);
    
    // Insert/update SAN FRANCISCO INTEGRATED SCHOOL (502624)
    await db.query(`DELETE FROM schools WHERE school_id = '502624'`);
    await db.query(`
      INSERT INTO schools (id, school_id, school_name, region, division, district, school_year, number_of_shifts, curricular_offering)
      VALUES ('sch-502624', '502624', 'SAN FRANCISCO INTEGRATED SCHOOL', 'REGION V', 'LEGASPI CITY', 'LEGASPI CITY', 'SY 26-27', 1, ARRAY['Elementary', 'Junior High School', 'Senior High School'])
    `);
    console.log('✅ Updated 502624 in schools table to SAN FRANCISCO INTEGRATED SCHOOL.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error cleaning schools table:', err);
    process.exit(1);
  }
}

main();
