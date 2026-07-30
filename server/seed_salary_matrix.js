/**
 * Seed Salary Matrix (DepEd SSL Salary Grades 1-33, Steps 1-8)
 */
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insighted_esf7`,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Standard DepEd / DBM SSL Salary Tranche Base Salary Matrix Sample
const BASE_SALARIES_STEP1 = {
  1: 13530, 2: 14339, 3: 15156, 4: 16020, 5: 16934,
  6: 17899, 7: 18917, 8: 19998, 9: 21211, 10: 23176,
  11: 27000, // Teacher I
  12: 29165, // Teacher II
  13: 31320, // Teacher III
  14: 33843, // Master Teacher I
  15: 36619, // Master Teacher II
  16: 39672, // Master Teacher III
  17: 43030, // Master Teacher IV
  18: 46725, // Head Teacher I / Principal I
  19: 51357, // Head Teacher II / Principal II
  20: 57347, // Head Teacher III / Principal III
  21: 63997, // Principal IV
  22: 71511, 23: 80003, 24: 90078, 25: 102690,
  26: 116040, 27: 131124, 28: 148171, 29: 167432, 30: 189218,
  31: 278434, 32: 325807, 33: 411310
};

async function seedSalaryMatrix() {
  try {
    const colRes = await db.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'salary_matrix';
    `);
    console.log('📋 Columns in salary_matrix:', colRes.rows);

    const cols = colRes.rows.map(c => c.column_name);

    await db.query('TRUNCATE TABLE salary_matrix RESTART IDENTITY CASCADE;');

    const values = [];
    for (let sg = 1; sg <= 33; sg++) {
      const base = BASE_SALARIES_STEP1[sg] || (13000 + sg * 1200);
      for (let step = 1; step <= 8; step++) {
        const stepMultiplier = 1 + (step - 1) * 0.012;
        const basicSalary = Math.round(base * stepMultiplier);
        
        if (cols.includes('position_title')) {
          values.push(`(${sg}, ${step}, ${basicSalary}, 'Salary Grade ${sg} Step ${step}')`);
        } else {
          values.push(`(${sg}, ${step}, ${basicSalary})`);
        }
      }
    }

    let query;
    if (cols.includes('position_title')) {
      query = `
        INSERT INTO salary_matrix (salary_grade, step_number, basic_salary, position_title)
        VALUES ${values.join(',\n')}
      `;
    } else {
      query = `
        INSERT INTO salary_matrix (salary_grade, step_number, basic_salary)
        VALUES ${values.join(',\n')}
      `;
    }

    await db.query(query);

    const countRes = await db.query('SELECT COUNT(*) FROM salary_matrix');
    console.log(`✅ Successfully seeded ${countRes.rows[0].count} entries in salary_matrix!`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to seed salary_matrix:', err.message);
    process.exit(1);
  }
}

seedSalaryMatrix();
