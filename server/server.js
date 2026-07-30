// Force nodemon restart for updated schema.sql
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes wiring
app.use('/api/auth', require('./controllers/auth'));
app.use('/api/school', require('./controllers/schools'));
app.use('/api/personnel', require('./controllers/personnel'));
app.use('/api/employment', require('./controllers/personnel_employment'));
app.use('/api/qualifications', require('./controllers/personnel_qualifications'));
app.use('/api/trainings', require('./controllers/personnel_trainings'));
app.use('/api/sections', require('./controllers/class_sections'));
app.use('/api/class-sections', require('./controllers/class_sections'));
app.use('/api/workloads', require('./controllers/workload_rows'));
app.use('/api/transfers', require('./controllers/workload_transfers'));
app.use('/api/absences', require('./controllers/absences'));
app.use('/api/submissions', require('./controllers/submissions'));
app.use('/api/requests', require('./controllers/requests'));
app.use('/api/reports', require('./controllers/reports'));
app.use('/api/allowances', require('./controllers/allowances'));
app.use('/api/overload-reasons', require('./controllers/overload_reasons'));
app.use('/api/learning-areas', require('./controllers/learningAreas/index.js'));
app.use('/api/work-immersion', require('./controllers/workImmersion/index.js'));


const queueWorker = require('./queue_worker');

app.get('/api/salary-matrix', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM salary_matrix ORDER BY salary_grade ASC, step_number ASC');
    res.json(result.rows.map(row => ({
      id: String(row.id),
      positionTitle: row.position_title,
      salaryGrade: row.salary_grade,
      stepNumber: row.step_number,
      basicSalary: Number(row.basic_salary)
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Initialize DB schema
const initDB = async () => {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    // Check if the PK of 'personnel' is an integer
    const pkCheck = await db.query(`
      SELECT data_type FROM information_schema.columns 
      WHERE table_name = 'personnel' AND column_name = 'id'
    `);
    
    if (pkCheck.rows.length > 0 && pkCheck.rows[0].data_type === 'integer') {
      console.log('🔄 Old integer PK schema detected. Dropping old tables to recreate with VARCHAR PKs...');
      await db.query(`
        DROP TABLE IF EXISTS workload_transfers CASCADE;
        DROP TABLE IF EXISTS workload_row_dates CASCADE;
        DROP TABLE IF EXISTS workload_rows CASCADE;
        DROP TABLE IF EXISTS class_sections CASCADE;
        DROP TABLE IF EXISTS personnel_trainings CASCADE;
        DROP TABLE IF EXISTS personnel_qualifications CASCADE;
        DROP TABLE IF EXISTS personnel_employment CASCADE;
        DROP TABLE IF EXISTS personnel_absences CASCADE;
        DROP TABLE IF EXISTS personnel CASCADE;
        DROP TABLE IF EXISTS schools CASCADE;
      `);
    }

    await db.query(sql);
    
    // Ensure personnel_absences exists with matching VARCHAR(50) FK
    await db.query(`
      CREATE TABLE IF NOT EXISTS personnel_absences (
          id SERIAL PRIMARY KEY,
          personnel_id VARCHAR(50) NOT NULL REFERENCES personnel (id) ON DELETE CASCADE,
          absence_date DATE NOT NULL,
          leave_type TEXT NOT NULL,
          prn TEXT,
          first_name TEXT,
          last_name TEXT,
          tin TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS personnel_allowances (
          id SERIAL PRIMARY KEY,
          personnel_id VARCHAR(50) NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
          school_year VARCHAR(20) NOT NULL DEFAULT 'SY 26-27',
          pera BOOLEAN DEFAULT FALSE,
          uniform BOOLEAN DEFAULT FALSE,
          supplies BOOLEAN DEFAULT FALSE,
          medical BOOLEAN DEFAULT FALSE,
          hardship BOOLEAN DEFAULT FALSE,
          overload BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(personnel_id, school_year)
      );
      CREATE TABLE IF NOT EXISTS overload_reasons (
          id SERIAL PRIMARY KEY,
          personnel_id VARCHAR(50) NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
          school_year VARCHAR(20) NOT NULL DEFAULT 'SY 26-27',
          term VARCHAR(20) NOT NULL DEFAULT 'Term 1',
          reasons TEXT[] NOT NULL DEFAULT ARRAY['Teacher Shortage'],
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(personnel_id, school_year, term)
      );
      CREATE TABLE IF NOT EXISTS personnel_learning_areas (
          id SERIAL PRIMARY KEY,
          personnel_id VARCHAR(50) NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
          school_year TEXT NOT NULL,
          learning_area TEXT NOT NULL,
          UNIQUE(personnel_id, school_year, learning_area)
      );
      CREATE TABLE IF NOT EXISTS work_immersion_minutes (
          id SERIAL PRIMARY KEY,
          personnel_id VARCHAR(50) NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
          school_year TEXT NOT NULL,
          month TEXT NOT NULL,
          day INTEGER NOT NULL,
          minutes INTEGER NOT NULL DEFAULT 0,
          UNIQUE(personnel_id, school_year, month, day)
      );
      ALTER TABLE class_sections ADD COLUMN IF NOT EXISTS number_of_learners INTEGER;
      ALTER TABLE schools ADD COLUMN IF NOT EXISTS subjects_config JSONB;
    `);
    console.log('✅ Database schema initialized successfully.');
    
    // Seed default school if empty
    const schoolCount = await db.query('SELECT COUNT(*) FROM schools');
    if (Number(schoolCount.rows[0].count) === 0) {
      await db.query(
        `INSERT INTO schools (id, school_id, school_name, region, division, district, school_year, number_of_shifts, curricular_offering)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        ['SCH-123456', '123456', 'Sample National High School', 'Region IV-A', 'Sample Division', 'Sample District', 'SY 26-27', 1, ['Elementary', 'JHS', 'SHS']]
      );
      console.log('🌱 Seeded default school profile.');
    }

    // Seed default SY 2026-2027 school calendar terms if empty
    const calendarCount = await db.query('SELECT COUNT(*) FROM school_calendar_terms');
    if (Number(calendarCount.rows[0].count) === 0) {
      const defaultTerms = [
        ['123456', 'SY 2026-2027', 'Term 1 - Opening & Instructional', 'instructional', '2026-06-08', '2026-09-01', true],
        ['123456', 'SY 2026-2027', 'Term 1 - End-of-Term Block', 'end_of_term', '2026-09-02', '2026-09-15', false],
        ['123456', 'SY 2026-2027', 'Term 2 - Instructional Block', 'instructional', '2026-09-16', '2026-12-04', true],
        ['123456', 'SY 2026-2027', 'Term 2 - End-of-Term Block', 'end_of_term', '2026-12-07', '2026-12-18', false],
        ['123456', 'SY 2026-2027', 'Term 3 - Instructional Block', 'instructional', '2027-01-04', '2027-03-23', true],
        ['123456', 'SY 2026-2027', 'Term 3 - End-of-Term Block', 'end_of_term', '2027-03-24', '2027-04-08', false],
        ['123456', 'SY 2026-2027', 'Summer / End of SY Vacation', 'vacation', '2027-04-09', '2027-06-06', false]
      ];
      for (const t of defaultTerms) {
        await db.query(
          `INSERT INTO school_calendar_terms (school_id, school_year, term_name, block_type, start_date, end_date, is_teaching)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          t
        );
      }
      console.log('🌱 Seeded default SY 2026-2027 3-term school calendar schedule.');
    }
  } catch (err) {
    console.error('❌ Failed to initialize database:', err.message);
  }
};

const startServer = (port) => {
  const server = app.listen(port, async () => {
    console.log(`🚀 Express server running on port ${port}`);
    await initDB();
    
    if (process.env.START_LOCAL_WORKER !== 'false') {
      console.log('🌱 Starting local submissions queue worker thread...');
      queueWorker.startWorker();
    } else {
      console.log('ℹ️ Local queue worker thread disabled (VM/separate daemon execution mode).');
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️ [Port ${port} in use, retrying startup in 1.5s...]`);
      setTimeout(() => {
        try { server.close(); } catch (e) {}
        startServer(port);
      }, 1500);
    } else {
      console.error('❌ [Server Listen Error]:', err);
    }
  });

  process.once('SIGUSR2', () => {
    queueWorker.stopWorker();
    server.close(() => {
      process.kill(process.pid, 'SIGUSR2');
    });
  });

  process.on('SIGINT', () => {
    queueWorker.stopWorker();
    server.close(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    queueWorker.stopWorker();
    server.close(() => process.exit(0));
  });
};

startServer(PORT);
