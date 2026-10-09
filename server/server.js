// Force nodemon restart for updated queue_worker.js uq_school_sy_profile fix
const express = require('express');
const cors = require('cors');
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
// Check JWT secret if provided; warn if missing in production environment
try {
  require('./utils/jwtSecret').assertJwtSecret();
} catch (err) {
  console.warn(`⚠️ [Startup Warning] ${err.message}`);
}
const db = require('./db');
const redisQueue = require('./services/redisQueue');

const app = express();
const PORT = process.env.PORT || 5000;

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
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Health endpoints (public, no auth, no tenant context).
//  - READINESS  GET /api/health (and /health): 200 when the app and PostgreSQL answer. Redis is reported in the body
//    ("redis": "up" | "degraded") but never fails the check: with Redis down the queue runs in PostgreSQL fallback
//    mode and the app works. This is the ONLY endpoint the frontend server-health lock uses.
//  - DEEP       GET /api/health/deep (and /health/deep): additionally pings Redis and answers 503 when it is down.
//    For monitoring/alerting only; never point the frontend or a load balancer at it.
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
  return res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
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
app.use('/api/extra-tasks', require('./controllers/personnel_extra_tasks'));
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

// Initialize DB schema & ensure zero VARCHAR character-length restrictions
const initDB = async () => {
  try {
    const dbCheck = await db.query('SELECT current_database() AS db_name, current_user, inet_server_addr() AS ip, inet_server_port() AS port;');
    const row = dbCheck.rows[0] || {};
    const dbHost = process.env.DB_HOST || 'stride-posgre-prod-01.postgres.database.azure.com';
    const dbPort = process.env.DB_PORT || '5432';
    const isLocalHost = dbHost === '127.0.0.1' || dbHost === 'localhost';
    const sslMode = (!isLocalHost && (process.env.DB_SSL === 'true' || dbHost.includes('azure.com'))) || (process.env.DB_SSL === 'true' && !isLocalHost);

    let authDbName = process.env.USERS_DB_NAME || process.env.AUTH_DB_NAME || (isLocalHost ? 'users_local' : 'users_database');
    try {
      const authCheck = await db.usersDbPool.query('SELECT current_database() AS auth_db;');
      if (authCheck.rows[0]) authDbName = `${authCheck.rows[0].auth_db} (Connected)`;
    } catch (e) {
      authDbName = `${authDbName} (Unavailable: ${e.message})`;
    }

    console.log('\n========================================================================');
    console.log('🗄️  [ACTIVE DATABASE CONNECTION VERIFIED]');
    console.log(`   Primary DB    : ${row.db_name || process.env.DB_NAME || 'insighted_esf7'}`);
    console.log(`   Auth Database : ${authDbName}`);
    console.log(`   Host & Port   : ${dbHost}:${dbPort}${row.ip ? ` (Resolved: ${row.ip}:${row.port || dbPort})` : ''}`);
    console.log(`   Database User : ${row.current_user || process.env.DB_USER || 'postgres'}`);
    console.log(`   SSL Mode      : ${sslMode ? 'Enabled' : 'Disabled (Localhost/Direct)'}`);
    console.log('========================================================================\n');

    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await db.query(sql);
      console.log('✅ Database schema initialized successfully.');
    }

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
    console.error(`\n❌ [Database Connection Error]: Could not access database "${process.env.DB_NAME || 'insighted_esf7'}" on ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}`);
    console.error(`   Error details: ${err.message}\n`);
  }
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
        process.exit(0);
      }
    }, 150);

    setTimeout(() => {
      clearInterval(checkDrain);
      console.warn(`⚠️ Force exiting after timeout with ${activeRequests} remaining in-flight requests.`);
      process.exit(0);
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

startServer(PORT);
