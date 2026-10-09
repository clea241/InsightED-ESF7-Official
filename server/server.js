// Force nodemon restart for updated queue_worker.js uq_school_sy_profile fix
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
// Fail fast with a clear message if the Redis settings are malformed (e.g. a port above 65535),
// instead of silently dropping into PostgreSQL fallback mode.
try {
  require('./utils/redisConfig').parseRedisConfig();
} catch (err) {
  console.error(`
❌ [Startup] Invalid Redis configuration: ${err.message}
   Fix REDIS_URL / REDIS_HOST / REDIS_PORT in the server environment (.env, PM2 ecosystem file or system variables) and restart.
`);
  process.exit(1);
}
// Fail fast if required environment variables are missing in production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET) {
    console.error('❌ [Startup Fatal] JWT_SECRET is required in production environment.');
    process.exit(1);
  }
}
try {
  require('./utils/jwtSecret').assertJwtSecret();
} catch (err) {
  console.error(`❌ [Startup Fatal] ${err.message}`);
  process.exit(1);
}
const db = require('./db');
const redisQueue = require('./services/redisQueue');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust first proxy hop behind reverse proxy (nginx) so req.ip uses client IP
app.set('trust proxy', 1);

// In-flight save / request tracking for zero-loss memory restarts
let activeRequests = 0;
let isShuttingDown = false;

app.use((req, res, next) => {
  if (isShuttingDown) {
    res.set('Connection', 'close');
    return res.status(503).json({ error: 'Server is restarting for maintenance, please retry.' });
  }
  activeRequests++;
  let closed = false;
  const decrement = () => {
    if (!closed) {
      closed = true;
      activeRequests = Math.max(0, activeRequests - 1);
    }
  };
  res.on('finish', decrement);
  res.on('close', decrement);
  next();
});

// Middleware
try {
  app.use(require('compression')()); // gzip JSON responses if compression package installed
} catch (e) {
  // compression is optional
}
// Security Headers via Helmet (HSTS, CSP tailored to app assets)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://api.qrserver.com"],
      connectSrc: ["'self'", "https:", "wss:", "ws:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS Configuration with origin allowlist from environment config
const rawOrigins = process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS || '';
const corsAllowlist = rawOrigins.split(',').map((o) => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. mobile apps, curl, internal service calls)
    if (!origin) return callback(null, true);
    if (corsAllowlist.length === 0) {
      if (process.env.NODE_ENV !== 'production') return callback(null, true);
      return callback(new Error('CORS blocked: origin not allowed by configuration'), false);
    }
    if (corsAllowlist.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS blocked: origin not allowed by configuration: ' + origin), false);
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Health endpoints (public, no auth, no tenant context).
//  - READINESS  GET /api/health (and /health): 200 when the app and PostgreSQL answer. Redis is reported in the body
//    ("redis": "up" | "degraded") but never fails the check: with Redis down the queue runs in PostgreSQL fallback
//    mode and the app works. This is the ONLY endpoint the frontend server-health lock uses.
//  - DEEP       GET /api/health, /health, /api/health/deep, /health/deep: also pings Redis. 503 only when PostgreSQL is
//    unreachable; with Redis down it answers 200 with "degraded": true and per-dependency status in the body.
const publicQueueStatus = () => {
  const { mode, redisReachable, since } = redisQueue.getQueueStatus();
  return { mode, redisReachable, since };
};

const checkPostgres = async () => {
  let timer;
  try {
    await Promise.race([
      db.pool.query('SELECT 1'),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('PostgreSQL check timed out (2s)')), 2000); })
    ]);
    return { up: true, error: null };
  } catch (err) {
    return { up: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
};

const checkReadiness = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const pg = await checkPostgres();
  const queue = publicQueueStatus();
  return res.status(pg.up ? 200 : 503).json({
    status: pg.up ? (queue.redisReachable ? 'ok' : 'degraded') : 'down',
    db: pg.up ? 'up' : 'down',
    redis: queue.redisReachable ? 'up' : 'degraded',
    queue,
    error: pg.up ? undefined : pg.error,
    time: new Date().toISOString()
  });
};

const checkDeep = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const pg = await checkPostgres();
  let redisUp = false;
  let redisError = null;
  let timer;
  try {
    const ok = await Promise.race([
      redisQueue.checkRedisHealth(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Redis check timed out (1.5s)')), 1500); })
    ]);
    redisUp = !!ok;
    if (!ok) redisError = 'Redis ping failed or offline';
  } catch (err) {
    redisError = err.message;
  } finally {
    clearTimeout(timer);
  }
  const healthy = pg.up && redisUp;
  return res.status(pg.up ? 200 : 503).json({
    status: pg.up ? (redisUp ? 'ok' : 'degraded') : 'down',
    degraded: !healthy,
    db: pg.up ? 'up' : 'down',
    redis: redisUp ? 'up' : 'down',
    queue: publicQueueStatus(),
    errors: healthy ? undefined : { db: pg.error, redis: redisError },
    time: new Date().toISOString()
  });
};

app.get('/api/health', checkDeep);
app.get('/health', checkDeep);
app.get('/api/health/deep', checkDeep);
app.get('/health/deep', checkDeep);
app.get('/api/health/readiness', checkReadiness);
app.get('/health/readiness', checkReadiness);

app.use(require('./utils/devLogger'));
app.use(db.dbMiddleware);

// Every /api route except health, auth, room-profiling and salary-matrix needs a verified JWT; the school is derived from it.
app.use('/api', require('./middleware/auth').apiAuthGate);

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
app.use('/api/school-head-sdo', require('./controllers/school_head_sdo'));
app.use('/api/extra-tasks', require('./controllers/personnel_extra_tasks'));
app.get('/api/room-profiling/snapshots/:id', (req, res, next) => {
  if (!/^[\w.:-]{1,128}$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid snapshot id' });
  next();
});
app.use('/api/room-profiling', require('./controllers/room_profiling'));
app.use('/api/esf7-upload', require('./controllers/esf7_upload'));

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
app.use('/api/overload-late-undertime', require('./controllers/overload_late_undertime'));
app.use('/api/overload-late', require('./controllers/overload_late_undertime'));
app.use('/api/tardiness', require('./controllers/overload_late_undertime'));
app.use('/api/overload-pay-and-reason', require('./controllers/overload_pay_and_reason'));
app.use('/api/overload-pay', require('./controllers/overload_pay_and_reason'));
app.use('/api/dashboard', require('./controllers/dashboard'));
app.use('/api/validation', require('./controllers/validation'));
app.use('/api/esf7-validation', require('./controllers/validation'));
app.use('/api/dev', require('./controllers/dev_snapshot'));
app.use('/api/node-status', require('./controllers/node_status'));
app.use('/api/nodes', require('./controllers/node_status'));


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

// Global error handler: never sends stack traces or file paths to the client; full detail is logged server-side only.
const stripServerPaths = (msg) => String(msg || '')
  .replace(/[A-Za-z]:[\\/][^\s'"<>)]*/g, '[path]')
  .replace(/(^|[\s(])\/(?:[\w.-]+\/)+[\w.-]+/g, '$1[path]');
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  let status = Number(err.status || err.statusCode) || 500;
  if (status < 400 || status > 599) status = 500;
  console.error(`[Error] ${req.method} ${req.originalUrl} -> ${status}:`, err && err.stack ? err.stack : err);
  let message;
  if (err.type === 'entity.parse.failed') { status = 400; message = 'Invalid JSON body'; }
  else if (err.type === 'entity.too.large') { status = 413; message = 'Request body too large'; }
  else if (status >= 500) message = stripServerPaths(err.message) || 'Internal server error';
  else message = stripServerPaths(err.message) || 'Request failed';
  res.status(status).json({ error: message });
});

// Initialize DB schema & ensure zero VARCHAR character-length restrictions
const initDB = async () => {
  const dbHost = process.env.DB_HOST || 'stride-posgre-prod-01.postgres.database.azure.com';
  const dbPort = process.env.DB_PORT || '5432';
  const isLocalHost = dbHost === '127.0.0.1' || dbHost === 'localhost';
  const sslMode = (!isLocalHost && (process.env.DB_SSL === 'true' || dbHost.includes('azure.com'))) || (process.env.DB_SSL === 'true' && !isLocalHost);

  const errors = [];
  let primaryStatus = 'Checking...';
  let masterStatus = 'Checking...';
  let authStatus = 'Checking...';
  let primaryRow = {};

  // 1. Primary Database Check
  try {
    const dbCheck = await db.query('SELECT current_database() AS db_name, current_user, inet_server_addr() AS ip, inet_server_port() AS port;');
    primaryRow = dbCheck.rows[0] || {};
    primaryStatus = `${primaryRow.db_name || process.env.DB_NAME || 'insighted_esf7'} (Connected)`;
  } catch (err) {
    primaryStatus = `${process.env.DB_NAME || 'insighted_esf7'} (FAILED: ${err.message}${err.code ? ` [code ${err.code}]` : ''})`;
    errors.push({ pool: 'Primary Database', name: process.env.DB_NAME || 'insighted_esf7', error: err });
  }

  // 2. Master Database Check (esf7_database, esf7_database_dummy, unit1_school_identity)
  const masterInfo = db.getMasterDbInfo ? db.getMasterDbInfo() : { masterDbName: process.env.INSIGHTED_DB_NAME || process.env.DB_NAME || 'insighted_esf7', isShared: true };
  try {
    const masterCheck = await db.insightEdPool.query('SELECT current_database() AS master_db;');
    const realMasterDb = masterCheck.rows[0]?.master_db || masterInfo.masterDbName;
    masterStatus = `${realMasterDb} (Connected${masterInfo.isShared ? ' - Shared with Primary DB' : ''})`;
  } catch (err) {
    masterStatus = `${masterInfo.masterDbName} (FAILED: ${err.message}${err.code ? ` [code ${err.code}]` : ''})`;
    errors.push({ pool: 'Master Database (insightEdPool)', name: masterInfo.masterDbName, error: err });
  }

  // 3. Auth / Users Database Check (user_schoolhead)
  let authTargetName = process.env.USERS_DB_NAME || process.env.AUTH_DB_NAME || (isLocalHost ? 'users_local' : 'users_database');
  try {
    const authCheck = await db.usersDbPool.query('SELECT current_database() AS auth_db;');
    const realAuthDb = authCheck.rows[0]?.auth_db || authTargetName;
    authStatus = `${realAuthDb} (Connected)`;
  } catch (err) {
    authStatus = `${authTargetName} (FAILED: ${err.message}${err.code ? ` [code ${err.code}]` : ''})`;
    errors.push({ pool: 'Auth Database (usersDbPool)', name: authTargetName, error: err });
  }

  console.log('\n========================================================================');
  console.log('🗄️  [ACTIVE DATABASE CONNECTIONS VERIFIED]');
  console.log(`   Primary DB    : ${primaryStatus}`);
  console.log(`   Master DB     : ${masterStatus}`);
  console.log(`   Auth Database : ${authStatus}`);
  console.log(`   Host & Port   : ${dbHost}:${dbPort}${primaryRow.ip ? ` (Resolved: ${primaryRow.ip}:${primaryRow.port || dbPort})` : ''}`);
  console.log(`   Database User : ${primaryRow.current_user || process.env.DB_USER || 'postgres'}`);
  console.log(`   SSL Mode      : ${sslMode ? 'Enabled' : 'Disabled (Localhost/Direct)'}`);
  console.log('========================================================================\n');

  if (errors.length > 0) {
    console.error('\n🚨 ========================================================================');
    console.error(`❌ [STARTUP DATABASE REACHABILITY ERROR]: ${errors.length} database(s) unreachable on ${dbHost}:${dbPort}`);
    for (const e of errors) {
      console.error(`   - ${e.pool} ["${e.name}"]: ${e.error.message}${e.error.code ? ` (code ${e.error.code})` : ''}`);
    }
    console.error('   Please check your .env database names, credentials, and PostgreSQL service.');
    console.error('========================================================================\n');
  }

  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await db.query(sql);
      console.log('✅ Database schema initialized successfully.');
    }

    // Ensure master table schema (esf7_database, esf7_database_dummy, unit1_school_identity) in active DB
    await db.query(`
      CREATE TABLE IF NOT EXISTS esf7_database (
        id TEXT PRIMARY KEY,
        schoool_id TEXT,
        school_id TEXT,
        school_name TEXT,
        region TEXT,
        division TEXT,
        muncipality TEXT,
        district TEXT,
        employee_no TEXT,
        prn TEXT,
        first TEXT,
        first_name TEXT,
        middle TEXT,
        middle_name TEXT,
        last TEXT,
        last_name TEXT,
        last_first TEXT,
        tin TEXT,
        gender TEXT,
        sex TEXT,
        sex_at_birth TEXT,
        civil_status TEXT,
        religion TEXT,
        ehtinic_group TEXT,
        ethnic_group TEXT,
        birthday_yyyy TEXT,
        birthday_mm TEXT,
        birthday_dd TEXT,
        birthdate TEXT,
        age INTEGER,
        position TEXT,
        position_title TEXT,
        position_category TEXT,
        rank_position TEXT,
        step_increment INTEGER,
        degree_finished__baccalaureate TEXT,
        college_degree TEXT,
        major__specialization TEXT,
        major TEXT,
        minor TEXT,
        highest_educational_attainment TEXT,
        post_graduate__degree TEXT,
        post_graduate_degree TEXT,
        post_graduate_discipline TEXT,
        eligibility JSONB,
        prc_specialization TEXT,
        fund_source TEXT,
        nature_of_appointment TEXT,
        hiring_arrangement TEXT,
        deployment_status TEXT,
        appt_yyyy TEXT,
        appt_mm TEXT,
        appt_dd TEXT,
        first_service_date TEXT,
        station_yyyy TEXT,
        station_mm TEXT,
        station_dd TEXT,
        new_station_date TEXT,
        last_promotion_date TEXT,
        last_lateral_movement_date TEXT,
        teaching_load TEXT,
        phylsys_num TEXT,
        esf7_id TEXT,
        is_school_head BOOLEAN DEFAULT FALSE,
        deped_email TEXT,
        college_degrees JSONB,
        degree_rows JSONB,
        grade_levels_taught JSONB,
        assigned_schools JSONB,
        raw_payload JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_esf7_database_school_id ON esf7_database (school_id);
      CREATE INDEX IF NOT EXISTS idx_esf7_database_schoool_id ON esf7_database (schoool_id);
      CREATE INDEX IF NOT EXISTS idx_esf7_database_prn ON esf7_database (prn);
      CREATE INDEX IF NOT EXISTS idx_esf7_database_employee_no ON esf7_database (employee_no);

      CREATE TABLE IF NOT EXISTS esf7_database_dummy (LIKE esf7_database INCLUDING ALL);

      DO $$
      BEGIN
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'schools_iern') THEN
          CREATE OR REPLACE VIEW unit1_school_identity AS
            SELECT school_id, school_name, region, division, district, ''::text AS curricular_offering
            FROM schools_iern;
        END IF;
      END $$;
    `).catch((err) => console.warn('[Master tables check warning]:', err.message));

    // Self-healing: expand critical VARCHAR columns to TEXT so ID and error strings never truncate
    await db.query(`
      DO $$ 
      BEGIN
        ALTER TABLE esf7_submission_queue ALTER COLUMN error_message TYPE TEXT;
        ALTER TABLE esf7_submission_queue ALTER COLUMN status TYPE TEXT;
        ALTER TABLE esf7_submission_queue ALTER COLUMN school_id TYPE TEXT;
        ALTER TABLE esf7_submission_queue ALTER COLUMN school_year TYPE TEXT;
        ALTER TABLE esf7_submission_queue ALTER COLUMN certified_by TYPE TEXT;

        ALTER TABLE esf7_workload_rows ALTER COLUMN id TYPE TEXT;
        ALTER TABLE esf7_workload_rows ALTER COLUMN personnel_id TYPE TEXT;
        ALTER TABLE esf7_perssonel_educ ALTER COLUMN id TYPE TEXT;
        ALTER TABLE esf7_personnel_learning_areas ALTER COLUMN id TYPE TEXT;
        ALTER TABLE esf7_personnel_ld_trainings ALTER COLUMN id TYPE TEXT;
        ALTER TABLE esf7_personnel_designations ALTER COLUMN id TYPE TEXT;
        ALTER TABLE esf7_personnel_allowances ALTER COLUMN id TYPE TEXT;
        ALTER TABLE esf7_regular_sections ALTER COLUMN id TYPE TEXT;
        ALTER TABLE esf7_aral_sections ALTER COLUMN id TYPE TEXT;
        ALTER TABLE esf7_remedial_enrichment_sections ALTER COLUMN id TYPE TEXT;
        ALTER TABLE esf7_workload_transfer ALTER COLUMN id TYPE TEXT;

        ALTER TABLE esf7_aral_sections ADD COLUMN IF NOT EXISTS section_type TEXT NOT NULL DEFAULT 'ARAL';
        ALTER TABLE esf7_remedial_enrichment_sections ADD COLUMN IF NOT EXISTS section_type TEXT NOT NULL DEFAULT 'REMEDIAL';
        ALTER TABLE esf7_sned_sections ADD COLUMN IF NOT EXISTS section_type TEXT NOT NULL DEFAULT 'SNED (NON-GRADED)';
        ALTER TABLE esf7_als_sections ADD COLUMN IF NOT EXISTS section_type TEXT NOT NULL DEFAULT 'ALS';

        ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS has_shifts BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS shift_start_time TEXT;
        ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS shift_end_time TEXT;
        ALTER TABLE esf7_school_profile ADD COLUMN IF NOT EXISTS shifts_config JSONB DEFAULT '{}'::jsonb;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // Reset any stuck processing jobs in queue
    await db.query(`
      UPDATE esf7_submission_queue
      SET status = 'pending', error_message = NULL, updated_at = NOW()
      WHERE status = 'processing'
    `).catch(() => {});
  } catch (err) {
    console.error(`\n❌ [Database Initialization Error]: Could not initialize database "${process.env.DB_NAME || 'insighted_esf7'}" on ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}`);
    console.error(`   Error details: ${err.message}\n`);
  }
};


// Refuse to accept traffic until Postgres answers; exit non-zero so PM2 retries instead of serving 500s.
const verifyDatabaseOrExit = async () => {
  const attempts = 5;
  for (let i = 1; i <= attempts; i++) {
    try {
      await db.pool.query('SELECT 1');
      return;
    } catch (err) {
      console.error(`❌ [Startup] Database not reachable (attempt ${i}/${attempts}): ${err.message}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  console.error('❌ [Startup] Database unreachable - exiting without opening the port.');
  process.exit(1);
};

const startServer = (port) => {
  const targetDb = process.env.DB_NAME || 'insighted_esf7';
  const targetHost = process.env.DB_HOST || 'localhost';
  const server = app.listen(port, async () => {
    console.log(`🚀 Express server running on port ${port} (Target DB: ${targetDb} @ ${targetHost})`);
    await initDB();
    redisQueue.startMonitor(); // so queue mode / Redis reachability are accurate in /api/health even without a local worker


    
    if (process.env.START_LOCAL_WORKER !== 'false') {
      console.log('🌱 Starting local submissions queue worker thread...');
      queueWorker.startWorker();
    } else {
      console.log('ℹ️ Local queue worker thread disabled (VM/separate daemon execution mode).');
    }

    if (process.send) {
      process.send('ready');
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

  const gracefulShutdown = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`🛑 Graceful shutdown signal received. In-flight requests: ${activeRequests}. Stopping new connections...`);
    try { queueWorker.stopWorker(); } catch(e) {}

    server.close(() => {
      console.log('✅ HTTP server closed to new connections. Waiting for in-flight saves to complete...');
    });

    if (server.closeIdleConnections) {
      server.closeIdleConnections();
    }

    const checkDrain = setInterval(() => {
      if (activeRequests === 0) {
        clearInterval(checkDrain);
        console.log('✅ All in-flight saves and requests completed cleanly.');
        db.closeAllPools().finally(() => process.exit(0));
      }
    }, 150);

    setTimeout(() => {
      clearInterval(checkDrain);
      console.warn(`⚠️ Force exiting after timeout with ${activeRequests} remaining in-flight requests.`);
      process.exit(0); // Postgres rolls back any open transaction when the connection drops
    }, 12000);
  };

  process.once('SIGUSR2', () => {
    queueWorker.stopWorker();
    server.close(() => {
      process.kill(process.pid, 'SIGUSR2');
    });
  });

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);

  process.on('uncaughtException', (err) => {
    console.error('[Server Uncaught Exception (Handled)]:', err.message);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Server Unhandled Rejection (Handled)]:', reason);
  });
};

verifyDatabaseOrExit().then(() => startServer(PORT));
