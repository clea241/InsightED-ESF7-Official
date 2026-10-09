const express = require('express');
const router = express.Router();
const db = require('../../db');
const { loadScheduleRules } = require('../../utils/sharedRules');
const cacheService = require('../../services/cacheService');

// Ensure ephemeral queue table & cross-device lockout table exist
let isTableInitialized = false;
const initQueueTable = async () => {
  try {
    await db.query(`
      CREATE UNLOGGED TABLE IF NOT EXISTS esf7_personnel_submission (
        id VARCHAR(128) PRIMARY KEY,
        school_id VARCHAR(64) NOT NULL,
        personnel_id VARCHAR(64) NOT NULL,
        personnel_name VARCHAR(255),
        room_name VARCHAR(255),
        status VARCHAR(32) DEFAULT 'PENDING',
        payload_json JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_timestamp BIGINT
      );
      CREATE INDEX IF NOT EXISTS idx_pers_sub_school_status ON esf7_personnel_submission(school_id, status);
      CREATE INDEX IF NOT EXISTS idx_pers_sub_school_personnel ON esf7_personnel_submission(school_id, personnel_id);

      CREATE TABLE IF NOT EXISTS esf7_personnel_submission_archive (
        id VARCHAR(128) PRIMARY KEY,
        school_id VARCHAR(64) NOT NULL,
        personnel_id VARCHAR(64) NOT NULL,
        personnel_name VARCHAR(255),
        room_name VARCHAR(255),
        status VARCHAR(32) DEFAULT 'APPROVED',
        payload_json JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_timestamp BIGINT
      );
      CREATE INDEX IF NOT EXISTS idx_pers_archive_school ON esf7_personnel_submission_archive(school_id);
      CREATE INDEX IF NOT EXISTS idx_pers_archive_personnel ON esf7_personnel_submission_archive(school_id, personnel_id);

      CREATE TABLE IF NOT EXISTS esf7_profiling_snapshots (
        id VARCHAR(128) PRIMARY KEY,
        school_id VARCHAR(64) NOT NULL,
        snapshot_name VARCHAR(255),
        personnel_count INT DEFAULT 0,
        verified_count INT DEFAULT 0,
        snapshot_json JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pers_snapshots_school ON esf7_profiling_snapshots(school_id);

      CREATE UNLOGGED TABLE IF NOT EXISTS esf7_passcode_lockout (
        lockout_key VARCHAR(128) PRIMARY KEY,
        school_id VARCHAR(64) NOT NULL,
        failed_attempts INT DEFAULT 0,
        lockout_until BIGINT DEFAULT 0,
        last_attempt_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE UNLOGGED TABLE IF NOT EXISTS esf7_room_roster_cache (
        school_id VARCHAR(64) PRIMARY KEY,
        roster_json JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_room_roster_cache_school ON esf7_room_roster_cache(school_id);
      CREATE OR REPLACE VIEW esf7_room_cache AS SELECT * FROM esf7_room_roster_cache;
    `);
    isTableInitialized = true;
    console.log('✅ [Room Profiling Queue, Archive, Snapshots & Roster Cache] Tables initialized successfully.');
  } catch (err) {
    console.warn('[Room Profiling Table Init Warning]:', err.message);
  }
};
initQueueTable();

// Periodic self-cleanup: purge old PENDING queue and APPROVED rows (APPROVED records are preserved in archive)
setInterval(async () => {
  try {
    await db.query(`DELETE FROM esf7_personnel_submission WHERE status = 'PENDING' AND created_at < NOW() - INTERVAL '7 days'`);
    await db.query(`DELETE FROM esf7_personnel_submission WHERE status = 'APPROVED' AND created_at < NOW() - INTERVAL '24 hours'`);
    await db.query(`DELETE FROM esf7_passcode_lockout WHERE lockout_until > 0 AND lockout_until < $1`, [Date.now() - 3600 * 1000]);
  } catch (e) {}
}, 15 * 60 * 1000);

// GET /api/room-profiling/check-lockout — Check if a passcode / personnel is locked out across all devices
router.get('/check-lockout', async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();

    const { schoolId, school_id, passcode, personnelId, personnel_id } = req.query;
    const activeSchoolId = String(schoolId || school_id || '502624').replace('SCH-', '').trim();
    const cleanCode = String(passcode || personnelId || personnel_id || '').replace(/[\s-]/g, '').trim().toUpperCase();

    if (!cleanCode) {
      return res.json({ isLockedOut: false, lockoutRemainingSecs: 0, failedAttempts: 0 });
    }

    const lockoutKey = `${activeSchoolId}:${cleanCode}`;
    const cacheKey = `room_profiling:lockout:${lockoutKey}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return res.json(cached);

    const { rows } = await db.query(`
      SELECT failed_attempts, lockout_until 
      FROM esf7_passcode_lockout 
      WHERE lockout_key = $1
    `, [lockoutKey]);

    if (rows && rows.length > 0) {
      const now = Date.now();
      const row = rows[0];
      const lockoutUntil = Number(row.lockout_until) || 0;
      if (lockoutUntil > now) {
        const remainingSecs = Math.ceil((lockoutUntil - now) / 1000);
        const resultObj = {
          isLockedOut: true,
          lockoutRemainingSecs: remainingSecs,
          failedAttempts: row.failed_attempts
        };
        await cacheService.set(cacheKey, resultObj, 3);
        return res.json(resultObj);
      }
    }

    const notLocked = { isLockedOut: false, lockoutRemainingSecs: 0, failedAttempts: (rows && rows[0]?.failed_attempts) || 0 };
    await cacheService.set(cacheKey, notLocked, 3);
    res.json(notLocked);
  } catch (err) {
    console.error('[Room Profiling Check Lockout Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/room-profiling/record-attempt — Record successful or failed attempt across all devices
router.post('/record-attempt', async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();

    const { schoolId, school_id, passcode, personnelId, personnel_id, isSuccess } = req.body;
    const activeSchoolId = String(schoolId || school_id || '502624').replace('SCH-', '').trim();
    const cleanCode = String(passcode || personnelId || personnel_id || '').replace(/[\s-]/g, '').trim().toUpperCase();

    if (!cleanCode) {
      return res.json({ isLockedOut: false, lockoutRemainingSecs: 0, failedAttempts: 0 });
    }

    const lockoutKey = `${activeSchoolId}:${cleanCode}`;
    const now = Date.now();

    // If verification succeeded: Reset lockout & attempts
    if (isSuccess) {
      await db.query(`
        DELETE FROM esf7_passcode_lockout 
        WHERE lockout_key = $1 OR (school_id = $2 AND lockout_key LIKE $3)
      `, [lockoutKey, activeSchoolId, `%${cleanCode}%`]);

      return res.json({ isLockedOut: false, lockoutRemainingSecs: 0, failedAttempts: 0 });
    }

    // Otherwise, handle failed attempt
    const { rows } = await db.query(`
      SELECT failed_attempts, lockout_until 
      FROM esf7_passcode_lockout 
      WHERE lockout_key = $1
    `, [lockoutKey]);

    let currentAttempts = 0;
    let existingLockout = 0;

    if (rows && rows.length > 0) {
      currentAttempts = Number(rows[0].failed_attempts) || 0;
      existingLockout = Number(rows[0].lockout_until) || 0;
      
      // If previous lockout already expired, reset counter
      if (existingLockout > 0 && existingLockout <= now) {
        currentAttempts = 0;
        existingLockout = 0;
      }
    }

    const nextAttempts = currentAttempts + 1;
    let nextLockoutUntil = 0;
    let isLockedOut = false;
    let remainingSecs = 0;

    if (nextAttempts >= 3) {
      nextLockoutUntil = now + 10 * 60 * 1000; // 10 minutes
      isLockedOut = true;
      remainingSecs = 600;
    }

    await db.query(`
      INSERT INTO esf7_passcode_lockout (lockout_key, school_id, failed_attempts, lockout_until, last_attempt_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (lockout_key) DO UPDATE
      SET failed_attempts = $3, lockout_until = $4, last_attempt_at = NOW()
    `, [lockoutKey, activeSchoolId, nextAttempts, nextLockoutUntil]);

    console.log(`[Room Profiling Security] School ${activeSchoolId} Passcode ${cleanCode} Failed Attempt #${nextAttempts} (Locked: ${isLockedOut})`);

    res.json({
      isLockedOut,
      lockoutRemainingSecs: remainingSecs,
      failedAttempts: nextAttempts,
      remainingAttempts: Math.max(0, 3 - nextAttempts)
    });
  } catch (err) {
    console.error('[Room Profiling Record Attempt Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/room-profiling/submit — Teacher submits verified profile from phone
router.post('/submit', async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();

    const { schoolId, school_id, room, roomName, personnelId, personnel_id, personnelName, personnel_name, profileData } = req.body;
    const activeSchoolId = String(schoolId || school_id || '199998').replace('SCH-', '').trim();
    const activePersonnelId = String(personnelId || personnel_id || profileData?.id || '').trim();

    if (!activePersonnelId) {
      return res.status(400).json({ error: 'personnelId is required' });
    }

    const subId = `SUB-${activePersonnelId}-${Date.now()}`;
    const pName = personnelName || personnel_name || `${profileData?.firstName || ''} ${profileData?.lastName || ''}`.trim() || 'Teacher';
    const activeRoom = room || roomName || 'Faculty Room 1';
    const now = Date.now();

    // Replace any prior pending submission for this teacher
    await db.query(`
      DELETE FROM esf7_personnel_submission 
      WHERE school_id = $1 AND personnel_id = $2
    `, [activeSchoolId, activePersonnelId]);

    await db.query(`
      INSERT INTO esf7_personnel_submission (id, school_id, personnel_id, personnel_name, room_name, status, payload_json, created_timestamp)
      VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7)
    `, [subId, activeSchoolId, activePersonnelId, pName, activeRoom, JSON.stringify(profileData || req.body), now]);

    await cacheService.delPattern('room_profiling:*');
    console.log(`[Room Profiling Queue] Enqueued submission ${subId} for ${pName} (School ${activeSchoolId}, Room: ${activeRoom})`);
    res.json({ success: true, queueId: subId, message: 'Profile queued for School Head review.' });
  } catch (err) {
    console.error('[Room Profiling Queue Submit Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/room-profiling/pending — School Head checks for incoming teacher submissions
router.get('/pending', async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();

    const schoolId = req.query.schoolId || req.query.school_id || '199998';
    const cleanSchoolId = String(schoolId).replace('SCH-', '').trim();

    const cacheKey = `room_profiling:pending:${cleanSchoolId}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return res.json(cached);

    const { rows } = await db.query(`
      SELECT id, school_id as "schoolId", personnel_id as "personnelId", personnel_name as "personnelName", 
             room_name as "roomName", payload_json as "profileData", created_at as "submittedAt", created_timestamp as "submittedTimestamp"
      FROM esf7_personnel_submission 
      WHERE school_id = $1 AND status = 'PENDING'
      ORDER BY created_timestamp DESC
    `, [cleanSchoolId]);

    const result = rows || [];
    await cacheService.set(cacheKey, result, 3);
    res.json(result);
  } catch (err) {
    console.error('[Room Profiling Queue Pending GET Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/room-profiling/ack — School Head merges/acknowledges submissions (updates status to APPROVED & archives)
router.post('/ack', async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();

    const { schoolId, school_id, submissionIds, personnelIds } = req.body;
    const cleanSchoolId = String(schoolId || school_id || '199998').replace('SCH-', '').trim();

    const subIds = Array.isArray(submissionIds) && submissionIds.length > 0 ? submissionIds : ['NONE'];
    const pIds = Array.isArray(personnelIds) && personnelIds.length > 0 ? personnelIds : ['NONE'];

    const result = await db.query(`
      UPDATE esf7_personnel_submission 
      SET status = 'APPROVED'
      WHERE school_id = $1 AND (id = ANY($2::varchar[]) OR personnel_id = ANY($3::varchar[]))
      RETURNING *
    `, [cleanSchoolId, subIds, pIds]);

    // Archive approved submissions permanently
    if (result.rows && result.rows.length > 0) {
      for (const row of result.rows) {
        await db.query(`
          INSERT INTO esf7_personnel_submission_archive 
            (id, school_id, personnel_id, personnel_name, room_name, status, payload_json, created_at, created_timestamp)
          VALUES ($1, $2, $3, $4, $5, 'APPROVED', $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET 
            payload_json = EXCLUDED.payload_json,
            status = 'APPROVED',
            created_at = EXCLUDED.created_at
        `, [row.id, row.school_id, row.personnel_id, row.personnel_name, row.room_name, row.payload_json, row.created_at, row.created_timestamp]);
      }
    }

    await cacheService.delPattern('room_profiling:*');
    console.log(`[Room Profiling Queue] Marked & Archived ${result.rowCount || 0} approved submissions for School ${cleanSchoolId}`);
    res.json({ success: true, count: result.rowCount || 0 });
  } catch (err) {
    console.error('[Room Profiling Queue ACK Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/room-profiling/approved — School Head fetches historical submissions from active queue, archive, and room cache
router.get('/approved', async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();

    const schoolId = req.query.schoolId || req.query.school_id || '199998';
    const cleanSchoolId = String(schoolId).replace('SCH-', '').trim();

    const cacheKey = `room_profiling:approved:${cleanSchoolId}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return res.json(cached);

    // 1. Fetch from submissions queue & permanent archive
    const { rows: subRows } = await db.query(`
      SELECT * FROM (
        SELECT DISTINCT ON (personnel_id)
               id, school_id as "schoolId", personnel_id as "personnelId", personnel_name as "personnelName", 
               room_name as "roomName", payload_json as "profileData", created_at as "submittedAt", created_timestamp as "submittedTimestamp", status
        FROM (
          SELECT id, school_id, personnel_id, personnel_name, room_name, payload_json, created_at, created_timestamp, status
          FROM esf7_personnel_submission 
          WHERE (school_id = $1 OR school_id = ('SCH-' || $1) OR REPLACE(school_id, 'SCH-', '') = $1)
          UNION ALL
          SELECT id, school_id, personnel_id, personnel_name, room_name, payload_json, created_at, created_timestamp, status
          FROM esf7_personnel_submission_archive
          WHERE (school_id = $1 OR school_id = ('SCH-' || $1) OR REPLACE(school_id, 'SCH-', '') = $1)
        ) combined
        ORDER BY personnel_id, created_timestamp DESC NULLS LAST
      ) latest_sub
      ORDER BY "submittedTimestamp" DESC NULLS LAST, "personnelName" ASC
    `, [cleanSchoolId]);

    const results = Array.isArray(subRows) ? [...subRows] : [];
    const seenPersonnelIds = new Set(results.map(r => String(r.personnelId || '').trim()).filter(Boolean));

    // 2. Fetch from esf7_room_roster_cache / esf7_room_cache for verified/profiled teachers not already in archive
    try {
      const { rows: cacheRows } = await db.query(`
        SELECT school_id, roster_json, updated_at
        FROM esf7_room_roster_cache
        WHERE (school_id = $1 OR school_id = ('SCH-' || $1) OR REPLACE(school_id, 'SCH-', '') = $1)
        LIMIT 1
      `, [cleanSchoolId]);

      if (cacheRows && cacheRows.length > 0 && Array.isArray(cacheRows[0].roster_json)) {
        const roster = cacheRows[0].roster_json;
        const updatedAt = cacheRows[0].updated_at || new Date();
        const updatedTimestamp = new Date(updatedAt).getTime();

        for (const p of roster) {
          const pId = String(p.id || p.prn || '').trim();
          
          if (pId && !seenPersonnelIds.has(pId)) {
            seenPersonnelIds.add(pId);
            const fn = (p.firstName || p.first_name || '').trim();
            const ln = (p.lastName || p.last_name || '').trim();
            const pName = p.name || (ln && fn ? `${ln}, ${fn}` : (ln || fn || 'Teacher'));

            results.push({
              id: `CACHE_${cleanSchoolId}_${pId}`,
              schoolId: cleanSchoolId,
              personnelId: pId,
              personnelName: pName,
              roomName: p.roomName || p.room || 'Faculty Room',
              profileData: p,
              submittedAt: p.submitted_at || p.submittedAt || updatedAt,
              submittedTimestamp: p.submitted_at ? new Date(p.submitted_at).getTime() : updatedTimestamp,
              status: 'APPROVED'
            });
          }
        }
      }
    } catch (cacheErr) {
      console.warn('[Room Profiling Approved GET] Cache fallback notice:', cacheErr.message);
    }

    await cacheService.set(cacheKey, results, 5);
    res.json(results);
  } catch (err) {
    console.error('[Room Profiling Queue Approved GET Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/room-profiling/snapshots — List saved profiling snapshots for school
router.get('/snapshots', async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();
    const schoolId = req.query.schoolId || req.query.school_id || '199998';
    const cleanSchoolId = String(schoolId).replace('SCH-', '').trim();

    const { rows } = await db.query(`
      SELECT id, school_id as "schoolId", snapshot_name as "snapshotName", 
             personnel_count as "personnelCount", verified_count as "verifiedCount",
             created_at as "createdAt"
      FROM esf7_profiling_snapshots 
      WHERE school_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [cleanSchoolId]);

    res.json(rows || []);
  } catch (err) {
    console.error('[Room Profiling Snapshots GET Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/room-profiling/snapshots — Save new profiling snapshot
router.post('/snapshots', async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();
    const { schoolId, school_id, snapshotName, personnel } = req.body;
    const cleanSchoolId = String(schoolId || school_id || '199998').replace('SCH-', '').trim();

    const pList = Array.isArray(personnel) ? personnel : [];
    const verifiedCount = pList.filter(p => p.personalVerified || p.isVerified || p.verified).length;
    const snapId = `SNAP-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const name = snapshotName || `Snapshot (${pList.length} staff, ${verifiedCount} profiled)`;

    await db.query(`
      INSERT INTO esf7_profiling_snapshots 
        (id, school_id, snapshot_name, personnel_count, verified_count, snapshot_json, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [snapId, cleanSchoolId, name, pList.length, verifiedCount, JSON.stringify(pList)]);

    // Keep max 20 snapshots per school
    await db.query(`
      DELETE FROM esf7_profiling_snapshots 
      WHERE school_id = $1 AND id NOT IN (
        SELECT id FROM esf7_profiling_snapshots WHERE school_id = $1 ORDER BY created_at DESC LIMIT 20
      )
    `, [cleanSchoolId]);

    res.json({ success: true, snapshotId: snapId, message: 'Snapshot saved successfully.' });
  } catch (err) {
    console.error('[Room Profiling Snapshots POST Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/room-profiling/snapshots/:id — Fetch specific snapshot content
router.get('/snapshots/:id', async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();
    const { id } = req.params;
    const { rows } = await db.query(`SELECT * FROM esf7_profiling_snapshots WHERE id = $1`, [id]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[Room Profiling Snapshot GET By ID Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/room-profiling/sync-roster — School Head laptop broadcasts active roster
const activeRosterCache = new Map();

router.post('/sync-roster', async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();
    const { schoolId, school_id, roster } = req.body;
    const cleanSchoolId = String(schoolId || school_id || '502624').replace('SCH-', '').trim();

    if (Array.isArray(roster) && roster.length > 0) {
      const sanitized = roster.map(p => {
        const fn = (p.firstName || p.first_name || '').trim();
        const ln = (p.lastName || p.last_name || '').trim();
        return {
          ...p,
          firstName: fn,
          lastName: ln,
          middleName: p.middleName || p.middle_name || '',
          name: p.name || (ln && fn ? `${ln}, ${fn}` : (ln || fn || 'Teacher')),
          birthdate: p.birthdate || p.birth_date || '',
          birthYear: p.birthYear || p.birth_year || '',
          position: p.position || p.plantilla_position || p.position_title || p.psn || '',
          type: p.type || p.positionCategory || 'teaching',
          profilingCode: p.profilingCode || ''
        };
      });

      activeRosterCache.set(cleanSchoolId, {
        roster: sanitized,
        syncedAt: Date.now()
      });

      await db.query(`
        INSERT INTO esf7_room_roster_cache (school_id, roster_json, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (school_id) DO UPDATE
        SET roster_json = EXCLUDED.roster_json, updated_at = NOW()
      `, [cleanSchoolId, JSON.stringify(sanitized)]).catch(err => console.warn('[Roster Cache DB Warning]:', err.message));
      await cacheService.delPattern('room_profiling:*');
    }

    res.json({ success: true, count: Array.isArray(roster) ? roster.length : 0 });
  } catch (err) {
    console.error('[Room Profiling Sync Roster Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/room-profiling/roster — Mobile device retrieves active School Head roster
router.get('/roster', async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();
    const schoolId = req.query.schoolId || req.query.school_id || '502624';
    const cleanSchoolId = String(schoolId).replace('SCH-', '').trim();

    // 1. In-memory cache
    const cached = activeRosterCache.get(cleanSchoolId);
    if (cached && Array.isArray(cached.roster) && cached.roster.length > 0) {
      return res.json(cached.roster);
    }

    // 2. Persistent unlogged table cache
    const { rows: cacheRows } = await db.query(`
      SELECT roster_json 
      FROM esf7_room_roster_cache 
      WHERE school_id = $1
    `, [cleanSchoolId]).catch(() => ({ rows: [] }));

    if (cacheRows && cacheRows.length > 0 && Array.isArray(cacheRows[0].roster_json) && cacheRows[0].roster_json.length > 0) {
      activeRosterCache.set(cleanSchoolId, { roster: cacheRows[0].roster_json, syncedAt: Date.now() });
      return res.json(cacheRows[0].roster_json);
    }

    // (The old school_drafts step was removed: it queried a column that does not exist, so it never returned anything,
    // and the draft is a backup of unsaved work, not a roster source.)

    // 3. Registered personnel from the database
    const { rows } = await db.query(`
      SELECT id, prn, first_name as "firstName", last_name as "lastName", middle_name as "middleName",
             birthdate, raw_payload
      FROM esf7_personnel_profile
      WHERE school_id = $1 OR school_id = $2
      ORDER BY last_name ASC, first_name ASC
    `, [cleanSchoolId, `SCH-${cleanSchoolId}`]).catch(() => ({ rows: [] }));

    if (rows && rows.length > 0) {
      return res.json(rows.map(r => ({
        ...(r.raw_payload || {}),
        id: r.id,
        prn: r.prn,
        firstName: r.firstName,
        lastName: r.lastName,
        middleName: r.middleName,
        birthdate: r.birthdate || r.raw_payload?.birthdate,
        position: r.raw_payload?.position || 'Teacher'
      })));
    }

    res.json([]);
  } catch (err) {
    console.error('[Room Profiling Get Roster Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper for deterministic passcode calculation (window length = shared QR_VALIDITY_MS, 24 hours)
function calculateDailyCode(key, offset, windowMs) {
  if (!key) return '00000000';
  const timeWindow = Math.floor(Date.now() / windowMs) + offset;
  const str = `${String(key).toUpperCase().trim()}_${timeWindow}_ESF7_SECRET_SALT_V2`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  let absHash = Math.abs(hash);
  for (let i = 0; i < 8; i++) {
    code += chars[(absHash + i * 7) % chars.length];
    absHash = Math.floor(absHash / 31) + (str.charCodeAt(i % str.length) * 17);
  }
  return code;
}
const calculateHourlyCode = calculateDailyCode;

// POST /api/room-profiling/verify-passcode — Robust multi-key and multi-window passcode authentication
router.post('/verify-passcode', async (req, res) => {
  try {
    if (!isTableInitialized) await initQueueTable();
    const { schoolId, school_id, passcode } = req.body;
    const cleanSchoolId = String(schoolId || school_id || '502624').replace('SCH-', '').trim();
    const cleanCode = String(passcode || '').replace(/[\s-]/g, '').trim().toUpperCase();

    if (!cleanCode) {
      return res.status(400).json({ success: false, message: 'Passcode is required' });
    }

    const { QR_VALIDITY_MS } = await loadScheduleRules();


    // Load active roster
    let roster = [];
    const cached = activeRosterCache.get(cleanSchoolId);
    if (cached && Array.isArray(cached.roster) && cached.roster.length > 0) {
      roster = cached.roster;
    } else {
      const { rows: cacheRows } = await db.query(`
        SELECT roster_json FROM esf7_room_roster_cache WHERE school_id = $1
      `, [cleanSchoolId]).catch(() => ({ rows: [] }));

      if (cacheRows && cacheRows.length > 0 && Array.isArray(cacheRows[0].roster_json) && cacheRows[0].roster_json.length > 0) {
        roster = cacheRows[0].roster_json;
        activeRosterCache.set(cleanSchoolId, { roster, syncedAt: Date.now() });
      }
    }

    if (!roster || roster.length === 0) {
      const { rows } = await db.query(`
        SELECT id, prn, first_name as "firstName", last_name as "lastName", middle_name as "middleName",
               birthdate, raw_payload
        FROM esf7_personnel_profile
        WHERE school_id = $1 OR school_id = $2
      `, [cleanSchoolId, `SCH-${cleanSchoolId}`]).catch(() => ({ rows: [] }));

      roster = (rows || []).map(r => ({
        ...(r.raw_payload || {}),
        id: r.id,
        prn: r.prn,
        firstName: r.firstName,
        lastName: r.lastName,
        middleName: r.middleName,
        birthdate: r.birthdate || r.raw_payload?.birthdate,
        position: r.raw_payload?.position || 'Teacher'
      }));
    }

    let matched = null;
    for (const teacher of roster) {
      const fn = (teacher.firstName || teacher.first_name || '').toUpperCase().trim();
      const ln = (teacher.lastName || teacher.last_name || '').toUpperCase().trim();
      
      const keysToCheck = [
        teacher.id,
        teacher.prn,
        fn && ln ? `${ln}_${fn}` : null,
        fn && ln ? `${ln}, ${fn}` : null,
        teacher.name,
        teacher.profilingCode
      ].filter(Boolean);

      for (const k of keysToCheck) {
        const cleanK = String(k).toUpperCase().trim();
        if (cleanCode === cleanK) {
          matched = teacher;
          break;
        }
        for (const offset of [0, -1, 1]) {
          if (calculateHourlyCode(cleanK, offset, QR_VALIDITY_MS) === cleanCode) {
            matched = teacher;
            break;
          }
        }
        if (matched) break;
      }
      if (matched) break;
    }

    if (matched) {
      return res.json({ success: true, teacher: matched });
    }

    return res.json({ success: false, message: 'Invalid passcode for this school.' });
  } catch (err) {
    console.error('[Room Profiling Verify Passcode Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
