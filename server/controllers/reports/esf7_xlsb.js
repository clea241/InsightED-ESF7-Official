const fs         = require('fs');
const path       = require('path');
const { Worker } = require('worker_threads');
const db         = require('../../db');

const PURE_VIEW_TEMPLATE = path.join(__dirname, '../../esf7_view_pure_template.xlsb');
const BASE_TEMPLATE_PATH = path.join(__dirname, '../../../eSF7-R04A-Laguna-108348_MAJAYJAY-ES-UPDATED.xlsb');
const WORKER_PATH        = path.resolve(__dirname, 'esf7_worker_thread.js');

const getTemplatePath = () => {
  if (fs.existsSync(PURE_VIEW_TEMPLATE)) return PURE_VIEW_TEMPLATE;
  if (fs.existsSync(BASE_TEMPLATE_PATH)) return BASE_TEMPLATE_PATH;
  return null;
};

/**
 * Execute XLSB generation in worker thread.
 */
const generateWithWorker = (templatePath, school, personnelList) => new Promise((resolve, reject) => {
  const worker = new Worker(WORKER_PATH, {
    workerData: { templatePath, school, personnelList }
  });

  let finished = false;

  const timer = setTimeout(() => {
    if (!finished) {
      finished = true;
      worker.terminate();
      reject(new Error('WORKER_TIMEOUT'));
    }
  }, 45000);

  worker.once('message', (msg) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    if (msg.ok) {
      resolve(Buffer.from(msg.buffer));
    } else {
      reject(new Error(msg.error));
    }
  });

  worker.once('error', (err) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    reject(err);
  });

  worker.once('exit', (code) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
  });
});

const generateESF7Xlsb = async (req, res) => {
  try {
    let school = {
      school_id: '199999',
      school_name: 'TEST ELEMENTARY SCHOOL',
      region: 'REGION VIII',
      division: 'SAMAR (WESTERN SAMAR)',
      district: 'BASEY I',
      school_year: 'SY 26-27'
    };
    let personnelList = [];

    // 1. Check school_drafts for active payload
    try {
      const draftRes = await db.query('SELECT payload FROM school_drafts LIMIT 1');
      if (draftRes.rows.length > 0 && draftRes.rows[0].payload) {
        const payload = draftRes.rows[0].payload;
        if (payload.schoolInfo) school = payload.schoolInfo;
        if (Array.isArray(payload.personnel)) personnelList = payload.personnel;
      }
    } catch (draftErr) {
      console.warn('[eSF7] school_drafts lookup failed:', draftErr.message);
    }

    // 2. Fallback to DB tables if draft is empty
    if (personnelList.length === 0) {
      try {
        const schoolRes = await db.query('SELECT * FROM schools LIMIT 1');
        if (schoolRes.rows[0]) school = schoolRes.rows[0];

        const pRes = await db.query(`
          SELECT p.*, pe.position, pe.designation, pe.fund_source, pe.nature_of_appointment,
                 pq.college_degree, pq.major, pq.minor
          FROM personnel p
          LEFT JOIN personnel_employment pe ON pe.personnel_id = p.id
          LEFT JOIN personnel_qualifications pq ON pq.personnel_id = p.id
          ORDER BY p.last_name ASC
        `);

        const pMap = {};
        pRes.rows.forEach(p => {
          pMap[p.id] = { ...p, workloadRows: [] };
        });

        const wRes = await db.query(`
          SELECT w.*, cs.section_name
          FROM workload_rows w
          LEFT JOIN class_sections cs ON cs.id = w.section_id
        `);

        wRes.rows.forEach(w => {
          if (pMap[w.personnel_id]) {
            pMap[w.personnel_id].workloadRows.push(w);
          }
        });

        personnelList = Object.values(pMap);
      } catch (dbErr) {
        console.warn('[eSF7] DB lookup fallback failed:', dbErr.message);
      }
    }

    const tplPath = getTemplatePath();
    if (!tplPath) {
      return res.status(404).json({ error: 'eSF7 template file missing on server' });
    }

    console.log(`[eSF7] Generating PURE 1-SHEET VIEW report for School ID: ${school.schoolId || school.school_id} (${personnelList.length} personnel)...`);
    const t0 = Date.now();

    const fileBuffer = await generateWithWorker(tplPath, school, personnelList);
    console.log(`[eSF7] Single VIEW sheet report generated in ${Date.now() - t0} ms — ${fileBuffer.length} bytes`);

    const safeSchoolId = String(school.schoolId || school.school_id || '199999').replace(/[^\w-]/g, '');
    const filename = `eSF7_${safeSchoolId}_${String(school.schoolYear || school.school_year || 'SY26-27').replace(/[^\w-]/g, '')}.xlsb`;

    res.setHeader('Content-Type', 'application/vnd.ms-excel.sheet.binary.macroEnabled.12');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(fileBuffer);

  } catch (error) {
    console.error('Error generating eSF7 XLSB:', error);
    return res.status(500).json({
      error: 'Failed to generate eSF7 XLSB report',
      message: error.message
    });
  }
};

module.exports = { generateESF7Xlsb };
