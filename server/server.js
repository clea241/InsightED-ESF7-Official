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
app.use('/api/schools', require('./controllers/schools'));
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
app.use('/api/overload-no-work', require('./controllers/overload_no_work'));
app.use('/api/no-work', require('./controllers/overload_no_work'));
app.use('/api/learning-areas', require('./controllers/personnel_learning_areas'));
app.use('/api/personnel-learning-areas', require('./controllers/personnel_learning_areas'));
app.use('/api/designations', require('./controllers/personnel_designations'));
app.use('/api/personnel-designations', require('./controllers/personnel_designations'));
app.use('/api/school-subjects', require('./controllers/school_subjects'));
app.use('/api/subjects', require('./controllers/school_subjects'));
app.use('/api/work-immersion', require('./controllers/work_immersion/index.js'));
app.use('/api/work-immersion-schedules', require('./controllers/work_immersion/index.js'));
app.use('/api/shs-workloads', require('./controllers/shs_workload_rows/index.js'));
app.use('/api/shs-transfers', require('./controllers/shs_workload_transfers/index.js'));
app.use('/api/workload-transfers', require('./controllers/shs_workload_transfers/index.js'));
app.use('/api/absences', require('./controllers/absences/index.js'));
app.use('/api/overload-absences', require('./controllers/absences/index.js'));
app.use('/api/overload-late', require('./controllers/overload_late'));
app.use('/api/tardiness', require('./controllers/overload_late'));
app.use('/api/overload-pay-and-reason', require('./controllers/overload_pay_and_reason'));
app.use('/api/overload-pay', require('./controllers/overload_pay_and_reason'));
app.use('/api/dashboard', require('./controllers/dashboard'));


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
    await db.query(sql);
    console.log('✅ Database schema initialized successfully.');
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
