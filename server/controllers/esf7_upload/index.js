const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Connection pool to 'insightEd' database containing esf7_link and esf7_database
const poolString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
  : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;

const pool = new Pool({
  connectionString: poolString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Configure draft directory
const VM_DRAFT_DIR = '/mnt/esf7_draft';
const LOCAL_DRAFT_DIR = path.resolve(__dirname, '../../uploads/esf7_drafts');
const DRAFT_DIR = (process.platform !== 'win32' && fs.existsSync(VM_DRAFT_DIR)) 
  ? VM_DRAFT_DIR 
  : LOCAL_DRAFT_DIR;

if (!fs.existsSync(DRAFT_DIR)) {
  try {
    fs.mkdirSync(DRAFT_DIR, { recursive: true });
  } catch (err) {
    console.warn('[ESF7 Upload] Could not create draft dir:', DRAFT_DIR, err.message);
  }
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, DRAFT_DIR);
  },
  filename: (req, file, cb) => {
    const rawSchoolId = (req.body.school_id || req.body.schoolId || 'UNKNOWN').replace(/^SCH-/i, '').trim();
    const safeBaseName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    const finalName = `${rawSchoolId}_ESF7_${Date.now()}_${safeBaseName}`;
    cb(null, finalName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsb' || ext === '.xlsx') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only DepEd eSF7 spreadsheet files (.xlsb or .xlsx) are permitted.'));
    }
  }
});

// ── GET /api/esf7-upload/check/:schoolId ──────────────────────────────────
// Returns whether the school has existing records or an active queuing job
router.get('/check/:schoolId', async (req, res) => {
  const cleanSchoolId = String(req.params.schoolId).replace(/^SCH-/i, '').trim();

  try {
    // 1. Check production esf7_database
    const prodRes = await pool.query(
      'SELECT count(*) FROM esf7_database WHERE CAST(COALESCE(schoool_id, school_id) AS TEXT) = $1',
      [cleanSchoolId]
    ).catch(() => ({ rows: [{ count: '0' }] }));

    const prodCount = parseInt(prodRes.rows[0]?.count || '0', 10);
    if (prodCount > 0) {
      return res.json({
        hasData: true,
        dataCount: prodCount,
        sourceTable: 'esf7_database',
        queueStatus: null
      });
    }

    // 2. Check test sandbox esf7_database_dummy
    const dummyRes = await pool.query(
      'SELECT count(*) FROM esf7_database_dummy WHERE CAST(COALESCE(schoool_id, school_id) AS TEXT) = $1',
      [cleanSchoolId]
    ).catch(() => ({ rows: [{ count: '0' }] }));

    const dummyCount = parseInt(dummyRes.rows[0]?.count || '0', 10);
    if (dummyCount > 0) {
      return res.json({
        hasData: true,
        dataCount: dummyCount,
        sourceTable: 'esf7_database_dummy',
        queueStatus: null
      });
    }

    // 3. Check pending_schools table in insightEd
    const pendingRes = await pool.query(
      `SELECT pending_id, registration_type, old_school_id, mother_school_id, status 
       FROM pending_schools 
       WHERE school_id = $1 AND is_deleted = false 
       LIMIT 1`,
      [cleanSchoolId]
    ).catch(() => ({ rows: [] }));

    const pendingRow = pendingRes.rows[0] || null;
    let oldSchoolDataCount = 0;

    if (pendingRow && pendingRow.old_school_id) {
      const oldProdRes = await pool.query(
        'SELECT count(*) FROM esf7_database WHERE CAST(COALESCE(schoool_id, school_id) AS TEXT) = $1',
        [pendingRow.old_school_id]
      ).catch(() => ({ rows: [{ count: '0' }] }));
      oldSchoolDataCount = parseInt(oldProdRes.rows[0]?.count || '0', 10);
    }

    const isNewlyEstablished = pendingRow?.registration_type === 'newly-established';
    const isConversion = pendingRow?.registration_type === 'conversion';

    // 4. Check queue table esf7_link for active harvesting
    const queueRes = await pool.query(
      'SELECT status, row_count, uploaded_at, updated_at, audit_remarks FROM esf7_link WHERE school_id = $1 ORDER BY updated_at DESC LIMIT 1',
      [cleanSchoolId]
    ).catch(() => ({ rows: [] }));

    const queueRow = queueRes.rows[0] || null;

    res.json({
      hasData: false,
      dataCount: 0,
      sourceTable: null,
      pendingSchool: pendingRow ? {
        registrationType: pendingRow.registration_type,
        oldSchoolId: pendingRow.old_school_id,
        motherSchoolId: pendingRow.mother_school_id,
        status: pendingRow.status,
        oldSchoolDataCount
      } : null,
      isExempted: isNewlyEstablished,
      requiresForceUpload: !isNewlyEstablished,
      queueStatus: queueRow ? queueRow.status : null,
      queueRow
    });
  } catch (err) {
    console.error('[ESF7 Check Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/esf7-upload/status/:schoolId ─────────────────────────────────
// Polls the status of the school's background harvesting job in esf7_link
router.get('/status/:schoolId', async (req, res) => {
  const cleanSchoolId = String(req.params.schoolId).replace(/^SCH-/i, '').trim();

  try {
    const queueRes = await pool.query(
      `SELECT school_id, iern, semester, status, row_count, summary, uploaded_at, updated_at, audit_remarks 
       FROM esf7_link WHERE school_id = $1 
       ORDER BY updated_at DESC LIMIT 1`,
      [cleanSchoolId]
    );

    if (queueRes.rows.length === 0) {
      return res.json({
        status: 'NOT_FOUND',
        message: 'No harvest record queued for this school.'
      });
    }

    const row = queueRes.rows[0];
    res.json({
      schoolId: row.school_id,
      status: row.status, // QUEUED | HARVESTING | VERIFIED | FAILED
      rowCount: row.row_count || 0,
      summary: row.summary || null,
      auditRemarks: row.audit_remarks || null,
      uploadedAt: row.uploaded_at,
      updatedAt: row.updated_at
    });
  } catch (err) {
    console.error('[ESF7 Status Polling Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/esf7-upload ─────────────────────────────────────────────────
// Accepts .xlsb/.xlsx binary and inserts/upserts into esf7_link with status 'QUEUED'
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No eSF7 file was uploaded.' });
    }

    const rawSchoolId = (req.body.school_id || req.body.schoolId || '').replace(/^SCH-/i, '').trim();
    if (!rawSchoolId) {
      return res.status(400).json({ error: 'School ID is required for eSF7 queueing.' });
    }

    const filePath = req.file.path;
    const fileName = req.file.filename;
    console.log(`📥 [ESF7 Upload] File received for School [${rawSchoolId}]: ${fileName} (${req.file.size} bytes)`);

    // Sync copy to ESF7 Official uploads/esf7_drafts if available locally
    const esf7OfficialDraftDir = 'E:\\ESF7 Official\\uploads\\esf7_drafts';
    if (fs.existsSync(esf7OfficialDraftDir)) {
      try {
        fs.copyFileSync(filePath, path.join(esf7OfficialDraftDir, fileName));
      } catch (copyErr) {
        console.warn('[ESF7 Upload] Local mirror copy warning:', copyErr.message);
      }
    }

    // Lookup IERN from schools_IERN or default to school ID
    let realIern = rawSchoolId;
    try {
      const iernRes = await pool.query(
        'SELECT "IERN" FROM "schools_IERN" WHERE "SchoolID" = $1 LIMIT 1',
        [rawSchoolId]
      );
      if (iernRes.rows.length > 0 && iernRes.rows[0].IERN) {
        realIern = iernRes.rows[0].IERN;
      }
    } catch (e) {}

    // On the Linux VM, files live in /mnt/esf7_draft/<fileName>
    const vmFilePath = `/mnt/esf7_draft/${fileName}`;

    // Insert or update into esf7_link queue
    const query = `
      INSERT INTO esf7_link (
        school_id, iern, semester, link, file_path, status, uploaded_at, updated_at
      ) VALUES (
        $1, $2, 'REGULAR', $3, $4, 'QUEUED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (school_id, semester) DO UPDATE SET
        iern = EXCLUDED.iern,
        link = EXCLUDED.link,
        file_path = EXCLUDED.file_path,
        status = 'QUEUED',
        audit_remarks = NULL,
        uploaded_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    const result = await pool.query(query, [rawSchoolId, realIern, fileName, vmFilePath]);

    console.log(`🚀 [ESF7 Queue] School [${rawSchoolId}] queued in esf7_link for VM harvester.`);

    res.json({
      success: true,
      message: 'eSF7 spreadsheet successfully uploaded and queued for VM harvesting.',
      schoolId: rawSchoolId,
      fileName,
      status: 'QUEUED',
      queuedAt: result.rows[0].uploaded_at
    });
  } catch (err) {
    console.error('❌ [ESF7 Upload Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/esf7-upload/import-converted ───────────────────────────────
// For converted schools: Copies historical faculty from old_school_id to new school_id
router.post('/import-converted', async (req, res) => {
  try {
    const { school_id, old_school_id } = req.body;
    const targetSchoolId = String(school_id || '').replace(/^SCH-/i, '').trim();
    const sourceOldId = String(old_school_id || '').replace(/^SCH-/i, '').trim();

    if (!targetSchoolId || !sourceOldId) {
      return res.status(400).json({ error: 'Both school_id and old_school_id are required.' });
    }

    // Determine target table: if target school is test account (800000-800100), write to dummy, else esf7_database
    const numericTargetId = parseInt(targetSchoolId, 10);
    const isTest = (numericTargetId >= 800000 && numericTargetId <= 800100) || targetSchoolId.startsWith('1999');
    const targetTable = isTest ? 'esf7_database_dummy' : 'esf7_database';

    // Verify source records in esf7_database or dummy
    let sourceRes = await pool.query(
      `SELECT * FROM esf7_database WHERE CAST(COALESCE(schoool_id, school_id) AS TEXT) = $1`,
      [sourceOldId]
    );

    if (sourceRes.rows.length === 0) {
      sourceRes = await pool.query(
        `SELECT * FROM esf7_database_dummy WHERE CAST(COALESCE(schoool_id, school_id) AS TEXT) = $1`,
        [sourceOldId]
      );
    }

    if (sourceRes.rows.length === 0) {
      return res.status(404).json({ error: `No historical personnel records found under previous School ID [${sourceOldId}].` });
    }

    // Copy rows with new school_id
    let importedCount = 0;
    for (const row of sourceRes.rows) {
      const cloned = { ...row };
      delete cloned.id; // Allow serial PK if any
      cloned.school_id = targetSchoolId;
      if (cloned.schoool_id !== undefined) cloned.schoool_id = targetSchoolId;
      cloned.submitted_at = new Date();

      const cols = Object.keys(cloned).map(c => `"${c}"`);
      const vals = Object.values(cloned);
      const placeholders = vals.map((_, i) => `$${i + 1}`);

      await pool.query(
        `INSERT INTO ${targetTable} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT DO NOTHING`,
        vals
      ).catch(e => console.warn('Row clone warning:', e.message));
      importedCount++;
    }

    console.log(`✅ [Converted School Import] Copied ${importedCount} records from Old ID [${sourceOldId}] to New Station [${targetSchoolId}] in ${targetTable}`);

    res.json({
      success: true,
      message: `Successfully imported ${importedCount} faculty records from previous School ID [${sourceOldId}].`,
      importedCount,
      targetTable
    });
  } catch (err) {
    console.error('❌ [Import Converted Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
