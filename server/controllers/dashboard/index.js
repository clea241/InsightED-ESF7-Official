const express = require('express');
const router = express.Router();
const db = require('../../db');

// Helper to determine term block & overload eligibility for SY 2026-2027
function getTermCalendarStatus(currentDateStr) {
  const now = currentDateStr ? new Date(currentDateStr) : new Date();
  
  // Term Ranges SY 2026-2027
  // Term 1: Instructional (June 8 – Sept 1), End-of-Term (Sept 2 – Sept 15)
  // Term 2: Instructional (Sept 16 – Dec 4), End-of-Term (Dec 7 – Dec 18)
  // Term 3: Instructional (Jan 4 – Mar 23), End-of-Term (Mar 24 – Apr 8)
  // Vacation: (Apr 9 – June 6)

  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();
  const dateNum = month * 100 + day; // e.g. June 8 = 608, Sept 1 = 901

  let activeTerm = 'Term 1';
  let blockType = 'INSTRUCTIONAL';
  let overloadPayEligible = true;
  let activeDateRange = 'June 8, 2026 - September 1, 2026';

  if (dateNum >= 608 && dateNum <= 901) {
    activeTerm = 'Term 1';
    blockType = 'INSTRUCTIONAL';
    overloadPayEligible = true;
    activeDateRange = 'June 8, 2026 - September 1, 2026';
  } else if (dateNum >= 902 && dateNum <= 915) {
    activeTerm = 'Term 1';
    blockType = 'END_OF_TERM';
    overloadPayEligible = false;
    activeDateRange = 'September 2, 2026 - September 15, 2026';
  } else if (dateNum >= 916 && dateNum <= 1204) {
    activeTerm = 'Term 2';
    blockType = 'INSTRUCTIONAL';
    overloadPayEligible = true;
    activeDateRange = 'September 16, 2026 - December 4, 2026';
  } else if (dateNum >= 1207 && dateNum <= 1218) {
    activeTerm = 'Term 2';
    blockType = 'END_OF_TERM';
    overloadPayEligible = false;
    activeDateRange = 'December 7, 2026 - December 18, 2026';
  } else if (dateNum >= 104 && dateNum <= 323) {
    activeTerm = 'Term 3';
    blockType = 'INSTRUCTIONAL';
    overloadPayEligible = true;
    activeDateRange = 'January 4, 2027 - March 23, 2027';
  } else if (dateNum >= 324 && dateNum <= 408) {
    activeTerm = 'Term 3';
    blockType = 'END_OF_TERM';
    overloadPayEligible = false;
    activeDateRange = 'March 24, 2027 - April 8, 2027';
  } else {
    activeTerm = 'Vacation';
    blockType = 'VACATION';
    overloadPayEligible = false;
    activeDateRange = 'April 9, 2026 - June 6, 2026';
  }

  return {
    current_school_year: 'SY 2026-2027',
    active_term: activeTerm,
    block_type: blockType,
    overload_pay_eligible: overloadPayEligible,
    active_date_range: activeDateRange
  };
}

const { getSchoolIdFromRequest } = require('../../utils/auth');

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  const startTime = Date.now();
  try {
    const schoolId = getSchoolIdFromRequest(req) || req.query.school_id || req.headers['x-school-id'] || '199999';
    const simulatedDate = req.query.simulated_date || null;

    // Parallel optimized DB queries
    const cleanSchoolId = schoolId.replace('SCH-', '');

    // Parallel optimized DB queries from active esf7 tables
    let [
      schoolRes,
      personnelRes,
      qualificationsRes,
      workloadRes,
      sectionsRes,
      queueRes,
      recentExportRes
    ] = await Promise.all([
      db.query('SELECT school_id, school_name FROM esf7_school_profile WHERE school_id = $1 LIMIT 1', [cleanSchoolId]).catch(() => ({ rows: [] })),
      db.query(`
        SELECT p.id, p.sex_at_birth AS sex, p.type, p.is_school_head, e.position
        FROM esf7_personnel_profile p
        LEFT JOIN esf7_personnel_employment e ON p.id = e.personnel_id
        WHERE p.school_id = $1 OR p.school_id = $2
      `, [cleanSchoolId, `SCH-${cleanSchoolId}`]).catch(() => ({ rows: [] })),
      db.query(`SELECT personnel_id, college_degree AS bachelors_degree FROM esf7_perssonel_educ`).catch(() => ({ rows: [] })),
      db.query(`SELECT personnel_id, subject AS subject_name, grade_level FROM esf7_workload_rows WHERE school_id = $1`, [cleanSchoolId]).catch(() => ({ rows: [] })),
      db.query(`SELECT id, adviser_id, number_of_learners FROM esf7_regular_sections WHERE school_id = $1 OR school_id = $2`, [cleanSchoolId, `SCH-${cleanSchoolId}`]).catch(() => ({ rows: [] })),
      db.query(`SELECT status, COUNT(*) as count FROM esf7_submission_queue GROUP BY status`).catch(() => ({ rows: [] })),
      db.query(`SELECT id, status, created_at FROM esf7_submission_queue ORDER BY created_at DESC LIMIT 1`).catch(() => ({ rows: [] }))
    ]);

    // Fetch master insightEd personnel in-memory to ensure complete count
    let personnelList = personnelRes.rows;
    try {
      const { Pool } = require('pg');
      const poolString = process.env.DATABASE_URL
        ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
        : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;
      const insightEdPool = new Pool({
        connectionString: poolString,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
      });

      const tableName = ['199998', '199997'].includes(cleanSchoolId) ? 'esf7_database_dummy' : 'esf7_database';
      const masterPersonnelRes = await insightEdPool.query(
        `SELECT sex, position FROM ${tableName} WHERE CAST(COALESCE(schoool_id, school_id) AS TEXT) = $1`,
        [cleanSchoolId]
      ).catch((err) => {
        console.error('[Dashboard Master Fallback Error]:', err.message);
        return { rows: [] };
      });

      if (masterPersonnelRes.rows.length > 0) {
        const masterList = masterPersonnelRes.rows.map(r => ({
          sex: (r.sex || 'FEMALE').toUpperCase(),
          type: 'teaching',
          is_school_head: false,
          position: r.position || 'TEACHER I'
        }));

        if (personnelRes.rows.length === 0) {
          personnelList = masterList;
        } else if (personnelRes.rows.length < masterList.length) {
          const merged = [...personnelRes.rows];
          for (let i = personnelRes.rows.length; i < masterList.length; i++) {
            merged.push(masterList[i]);
          }
          personnelList = merged;
        }
      }

      await insightEdPool.end().catch(() => {});
    } catch (e) {
      console.error('[Dashboard Master Fallback Error]:', e.message);
    }

    let schoolInfo = schoolRes.rows[0];
    if (!schoolInfo || !schoolInfo.school_name || schoolInfo.school_name.includes('Sample National') || schoolInfo.school_name.includes('TEST K-12')) {
      try {
        const { Pool } = require('pg');
        const poolString = process.env.DATABASE_URL
          ? process.env.DATABASE_URL.replace('insighted_esf7', 'insightEd')
          : `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/insightEd`;
        const insightEdPool = new Pool({
          connectionString: poolString,
          ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
        });
        const identityRes = await insightEdPool.query('SELECT school_id, school_name FROM unit1_school_identity WHERE school_id = $1 LIMIT 1', [cleanSchoolId]).catch(() => ({ rows: [] }));
        if (identityRes.rows.length > 0 && identityRes.rows[0].school_name) {
          schoolInfo = identityRes.rows[0];
        } else {
          const tableName = ['199998', '199997'].includes(cleanSchoolId) ? 'esf7_database_dummy' : 'esf7_database';
          const esfMatch = await insightEdPool.query(`SELECT DISTINCT school_id, school_name FROM ${tableName} WHERE school_id = $1 OR schoool_id = $1 LIMIT 1`, [cleanSchoolId]).catch(() => ({ rows: [] }));
          if (esfMatch.rows.length > 0 && esfMatch.rows[0].school_name) {
            schoolInfo = esfMatch.rows[0];
          }
        }
        await insightEdPool.end().catch(() => {});
      } catch (e) {}
    }

    if (!schoolInfo || !schoolInfo.school_name) {
      schoolInfo = { school_id: cleanSchoolId, school_name: `School ${cleanSchoolId}` };
    }

    const personnel = personnelList;


    // 1. School Overview
    let males = 0;
    let females = 0;
    personnel.forEach(p => {
      const sexStr = String(p.sex || '').toUpperCase();
      if (sexStr === 'MALE' || sexStr === 'M') males++;
      else if (sexStr === 'FEMALE' || sexStr === 'F') females++;
    });

    // 2. Qualifications check
    const qualSet = new Set(qualificationsRes.rows.filter(q => q.bachelors_degree && q.bachelors_degree.trim() !== '').map(q => String(q.personnel_id)));
    const incompleteQualificationsCount = personnel.filter(p => !qualSet.has(String(p.id))).length;

    // 3. Workload calculations
    const workloadMap = new Map(); // personnel_id -> totalMinutes
    let slotOverloadExceededCount = 0;

    workloadRes.rows.forEach(w => {
      const pId = String(w.personnel_id);
      const mins = Number(w.duration_minutes || 0);
      const gLevel = String(w.grade_level || '').toUpperCase();
      const isSHS = gLevel.includes('11') || gLevel.includes('12') || gLevel.includes('SHS');
      
      // Slot limit check: 60 mins for Elem/JHS, 360 mins for SHS
      const maxSlot = isSHS ? 360 : 60;
      if (mins > maxSlot) {
        slotOverloadExceededCount++;
      }

      workloadMap.set(pId, (workloadMap.get(pId) || 0) + mins);
    });

    let underloadedCount = 0;
    let standardCount = 0;
    let overloadedCount = 0;

    personnel.forEach(p => {
      const isTeaching = p.type === 'teaching' || (p.position && String(p.position).toUpperCase().includes('TEACHER'));
      if (isTeaching) {
        const totalMins = workloadMap.get(String(p.id)) || 0;
        if (totalMins < 300) underloadedCount++;
        else if (totalMins <= 360) standardCount++;
        else overloadedCount++;
      }
    });

    // 4. Advisory HGP Check
    const unassignedAdvisoryCount = sectionsRes.rows.filter(s => !s.adviser_id || Number(s.hgp_minutes || 0) === 0).length;

    // 5. Readiness Audit
    const flaggedIssues = [];
    if (incompleteQualificationsCount > 0) {
      flaggedIssues.push({
        type: 'QUALIFICATION_MISSING',
        count: incompleteQualificationsCount,
        label: 'Personnel with incomplete degree profile'
      });
    }
    if (slotOverloadExceededCount > 0) {
      flaggedIssues.push({
        type: 'OVERLOAD_EXCEEDED',
        count: slotOverloadExceededCount,
        label: 'Teaching workload exceeds 360 mins/slot limit'
      });
    }
    if (unassignedAdvisoryCount > 0) {
      flaggedIssues.push({
        type: 'UNASSIGNED_ADVISORY',
        count: unassignedAdvisoryCount,
        label: 'Sections without assigned HGP advisory block'
      });
    }

    const totalPersonnelCount = personnel.length || 1;
    const totalIssuesCount = incompleteQualificationsCount + slotOverloadExceededCount + unassignedAdvisoryCount;
    const scorePercentage = Math.max(0, Math.min(100, Math.round(100 - (totalIssuesCount / (totalPersonnelCount * 2)) * 100)));

    // 6. Queue Status
    let pendingQueue = 0;
    let processingQueue = 0;
    queueRes.rows.forEach(q => {
      if (q.status === 'pending') pendingQueue += Number(q.count);
      if (q.status === 'processing') processingQueue += Number(q.count);
    });

    const recentRow = recentExportRes.rows[0];
    const recentExport = recentRow ? {
      id: recentRow.id,
      status: recentRow.status,
      file_path: recentRow.output_filepath || '/scratch/eSF7_2026_Report.xlsb',
      created_at: recentRow.created_at
    } : null;

    const calendarStatus = getTermCalendarStatus(simulatedDate);

    const responsePayload = {
      school_overview: {
        school_id: String(schoolInfo.school_id),
        school_name: schoolInfo.school_name,
        total_personnel: personnel.length,
        gender_ratio: { male: males, female: females }
      },
      readiness_audit: {
        score_percentage: scorePercentage,
        flagged_issues: flaggedIssues
      },
      workload_distribution: {
        underloaded: underloadedCount,
        standard: standardCount,
        overloaded: overloadedCount
      },
      term_calendar_status: calendarStatus,
      queue_status: {
        pending: pendingQueue,
        processing: processingQueue,
        recent_export: recentExport
      },
      response_time_ms: Date.now() - startTime
    };

    res.json(responsePayload);
  } catch (err) {
    console.error('Error computing dashboard stats:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
