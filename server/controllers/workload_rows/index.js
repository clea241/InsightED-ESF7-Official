const express = require('express');
const router = express.Router();
const db = require('../../db');
const { findBlockedTeachingRows } = require('../../utils/teachingAssignments');

function formatWorkloadRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    gradeLevel: row.grade_level || raw.gradeLevel || raw.grade_level || '',
    grade_level: row.grade_level || raw.gradeLevel || raw.grade_level || '',
    sectionId: row.section_id || raw.sectionId || raw.section_id || null,
    section_id: row.section_id || raw.sectionId || raw.section_id || null,
    sectionName: row.section_name || raw.sectionName || raw.section_name || '',
    section_name: row.section_name || raw.sectionName || raw.section_name || '',
    subject: row.subject || raw.subject || raw.subjectName || raw.subject_name || '',
    subjectId: row.subject_id || raw.subjectId || raw.subject_id || null,
    subject_id: row.subject_id || raw.subjectId || raw.subject_id || null,
    remediationSubject: row.remediation_subject || raw.remediationSubject || raw.remediation_subject || '',
    remediation_subject: row.remediation_subject || raw.remediationSubject || raw.remediation_subject || '',
    startTime: row.start_time ? String(row.start_time).substring(0, 5) : (raw.startTime || null),
    start_time: row.start_time ? String(row.start_time).substring(0, 5) : (raw.startTime || null),
    endTime: row.end_time ? String(row.end_time).substring(0, 5) : (raw.endTime || null),
    end_time: row.end_time ? String(row.end_time).substring(0, 5) : (raw.endTime || null),
    days: row.days || raw.days || ['M', 'T', 'W', 'TH', 'F'],
    term: row.term || raw.term || '1st',
    rawPayload: raw
  };
}

function formatAdminTaskRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    task: row.task_name,
    task_name: row.task_name,
    taskName: row.task_name,
    category: row.task_category || raw.category || 'General Administration',
    taskCategory: row.task_category || raw.category || 'General Administration',
    startTime: row.start_time ? String(row.start_time).substring(0, 5) : (raw.startTime || '13:00'),
    start_time: row.start_time ? String(row.start_time).substring(0, 5) : (raw.startTime || '13:00'),
    endTime: row.end_time ? String(row.end_time).substring(0, 5) : (raw.endTime || '14:00'),
    end_time: row.end_time ? String(row.end_time).substring(0, 5) : (raw.endTime || '14:00'),
    days: row.days || raw.days || ['M', 'T', 'W', 'TH', 'F'],
    term: row.term || raw.term || '1st',
    startDate: row.start_date || raw.startDate || null,
    start_date: row.start_date || raw.startDate || null,
    endDate: row.end_date || raw.endDate || null,
    end_date: row.end_date || raw.endDate || null,
    dates: row.dates || raw.dates || [],
    durationMinutes: row.duration_minutes || raw.durationMinutes || 60,
    duration_minutes: row.duration_minutes || raw.durationMinutes || 60,
    termTotalHours: row.term_total_hours ? parseFloat(row.term_total_hours) : (raw.termTotalHours || 0),
    isDesignationSynced: !!row.is_designation_synced,
    is_designation_synced: !!row.is_designation_synced,
    status: row.status || 'ACTIVE',
    rawPayload: raw
  };
}

// GET all workload rows for a personnel
router.get('/personnel/:personnel_id', async (req, res) => {
  try {
    const { personnel_id } = req.params;
    const result = await db.query(
      `SELECT * FROM esf7_workload_rows 
       WHERE personnel_id = $1 
          OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1)
          OR personnel_id IN (SELECT prn FROM esf7_personnel_profile WHERE id = $1 OR prn = $1)
       ORDER BY created_at ASC`,
      [personnel_id]
    );
    res.json(result.rows.map(formatWorkloadRecord));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all administrative tasks (Gantt blocks) for a personnel
router.get('/personnel/:personnel_id/admin-tasks', async (req, res) => {
  try {
    const { personnel_id } = req.params;
    const result = await db.query(
      `SELECT * FROM esf7_admin_task 
       WHERE personnel_id = $1 
          OR personnel_id IN (SELECT id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1)
          OR personnel_id IN (SELECT prn FROM esf7_personnel_profile WHERE id = $1 OR prn = $1)
       ORDER BY created_at ASC`,
      [personnel_id]
    );
    res.json(result.rows.map(formatAdminTaskRecord));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all workload rows in school
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM esf7_workload_rows ORDER BY created_at ASC`);
    res.json(result.rows.map(formatWorkloadRecord));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST Add a new workload row into esf7_workload_rows
router.post('/', async (req, res) => {
  try {
    const {
      personnel_id, personnelId,
      school_id, schoolId: bodySchoolId,
      school_year, schoolYear: bodySchoolYear,
      grade_level, gradeLevel,
      section_id, sectionId,
      section_name, sectionName,
      subject,
      subject_id, subjectId,
      remediation_subject, remediationSubject,
      start_time, startTime,
      end_time, endTime,
      days
    } = req.body;

    const targetPersonnelId = personnel_id || personnelId;
    if (!targetPersonnelId) {
      return res.status(400).json({ error: 'personnel_id is required' });
    }

    const personRes = await db.query(
      `SELECT school_id, school_year FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [targetPersonnelId]
    );
    const targetSchoolId = school_id || bodySchoolId || (personRes.rows.length > 0 ? personRes.rows[0].school_id : '108348');
    const targetSchoolYear = school_year || bodySchoolYear || (personRes.rows.length > 0 ? personRes.rows[0].school_year : '2026-2027');

    const countRes = await db.query(`SELECT COUNT(*) FROM esf7_workload_rows`);
    const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, '0');
    const wklId = req.body.id || `WKL-${targetSchoolId.replace('SCH-', '')}-${seq}`;

    const query = `
      INSERT INTO esf7_workload_rows (
        id, personnel_id, school_id, school_year, grade_level, section_id, section_name,
        subject, subject_id, remediation_subject, start_time, end_time, days, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb)
      RETURNING *;
    `;

    const values = [
      wklId,
      targetPersonnelId,
      targetSchoolId,
      targetSchoolYear,
      grade_level || gradeLevel || null,
      section_id || sectionId || null,
      section_name || sectionName || null,
      subject || 'MATHEMATICS',
      subject_id || subjectId || null,
      remediation_subject || remediationSubject || null,
      start_time || startTime || null,
      end_time || endTime || null,
      JSON.stringify(days || ['M', 'T', 'W', 'TH', 'F']),
      JSON.stringify(req.body)
    ];

    const result = await db.query(query, values);
    res.status(201).json(formatWorkloadRecord(result.rows[0]));
  } catch (err) {
    console.error('Error inserting esf7_workload_rows:', err);
    res.status(500).json({ error: err.message });
  }
});

// Batch replace workload rows for a personnel (supports PUT/POST /personnel/:personnel_id and POST /bulk)
// A payload can repeat the same block id (e.g. a block copied in the editor). Keep the first one; ids that the server
// replaces anyway (new-/wk-) may repeat freely.
function dedupeRowsById(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    const id = r && r.id ? String(r.id) : '';
    if (!id || id.startsWith('new-') || id.startsWith('wk-')) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

const saveWorkloadBatchHandler = async (req, res) => {
  const client = await db.getClient();
  try {
    const targetPersonnelId = req.params.personnel_id || req.body.personnel_id || req.body.personnelId;
    if (!targetPersonnelId) {
      return res.status(400).json({ error: 'personnel_id is required' });
    }

    const {
      workloadRows = [],
      workload_rows = [],
      shsWorkloads = null,
      schoolId: bodySchoolId,
      school_id: bodySnakeSchoolId,
      schoolYear: bodySchoolYear,
      school_year: bodySnakeSchoolYear
    } = req.body;

    const teachingRelatedRows = req.body.teachingRelatedRows !== undefined ? req.body.teachingRelatedRows : req.body.teaching_related_rows;
    const administrativeRows = req.body.administrativeRows !== undefined ? req.body.administrativeRows : req.body.administrative_rows;

    const rowsToSave = dedupeRowsById(Array.isArray(workloadRows) && workloadRows.length > 0
      ? workloadRows
      : (Array.isArray(workload_rows) ? workload_rows : []));

    await client.query('BEGIN');
    // Saves for the same teacher run one after another (retry / double submit / two browsers), so each full replace sees the last one's committed rows.
    const idProbe = await client.query('SELECT id FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1', [targetPersonnelId]);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['workload:' + (idProbe.rows[0] ? idProbe.rows[0].id : String(targetPersonnelId))]);
    // Version marker for this teacher's workload; clients compare it to detect data saved from another browser/device.
    const workloadSavedAt = new Date().toISOString();

    // 1. Locate or create personnel profile record to satisfy FK
    let personRes = await client.query(
      `SELECT id, school_id, school_year, raw_payload FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
      [targetPersonnelId]
    );

    // Rule: no teaching blocks for a teacher with no classes assigned in Personnel Profiling.
    // Already-saved rows pass through (flagged client-side); only newly added teaching rows are rejected.
    if (personRes.rows.length > 0) {
      const empRes = await client.query(
        `SELECT grade_levels_taught FROM esf7_personnel_employment WHERE personnel_id = $1 LIMIT 1`,
        [personRes.rows[0].id]
      );
      const incomingGrades = req.body.assignedGradeLevels || req.body.assigned_grade_levels || req.body.gradeLevelsTaught || req.body.grade_levels_taught;
      const profileForRule = {
        ...personRes.rows[0],
        grade_levels_taught: (empRes.rows[0] && empRes.rows[0].grade_levels_taught) ? empRes.rows[0].grade_levels_taught : incomingGrades,
        raw_payload: {
          ...(personRes.rows[0].raw_payload || {}),
          ...(incomingGrades ? { assignedGradeLevels: incomingGrades } : {})
        }
      };
      const existingSaved = (personRes.rows[0].raw_payload || {}).workloadRows || [];
      const blocked = findBlockedTeachingRows(profileForRule, rowsToSave, existingSaved);
      if (blocked.length > 0) {
        await client.query('ROLLBACK');
        return res.status(422).json({
          error: 'NO_CLASSES_ASSIGNED',
          message: 'This teacher has no classes assigned. Set assignments in Personnel Profiling before adding teaching blocks.',
          blockedRowIds: blocked.map(r => r.id || null)
        });
      }
    }

    let targetPersonId = targetPersonnelId;
    let targetSchoolId = bodySchoolId || bodySnakeSchoolId || '108348';
    let targetSchoolYear = bodySchoolYear || bodySnakeSchoolYear || '2026-2027';

    const targetTerm = req.body.term || (rowsToSave.length > 0 ? (rowsToSave[0].term || '1st') : null);
    const replaceTerms = () => Array.from(new Set([
      ...rowsToSave.map(r => r.term || targetTerm || '1st'),
      ...(req.body.term ? [String(req.body.term)] : [])
    ]));

    if (personRes.rows.length > 0) {
      targetPersonId = personRes.rows[0].id;
      targetSchoolId = bodySchoolId || bodySnakeSchoolId || personRes.rows[0].school_id || targetSchoolId;
      targetSchoolYear = bodySchoolYear || bodySnakeSchoolYear || personRes.rows[0].school_year || targetSchoolYear;

      const termsInPayload = replaceTerms();

      // Update raw_payload in esf7_personnel_profile with term preservation
      const existingRaw = personRes.rows[0].raw_payload || {};
      const existingWorkloadRows = Array.isArray(existingRaw.workloadRows) ? existingRaw.workloadRows : [];
      let mergedWorkloadRows = rowsToSave;
      if (termsInPayload.length > 0) {
        const otherTermsRows = existingWorkloadRows.filter(r => !termsInPayload.includes(r.term || '1st'));
        mergedWorkloadRows = [...otherTermsRows, ...rowsToSave];
      } else if (targetTerm) {
        const otherTermsRows = existingWorkloadRows.filter(r => (r.term || '1st') !== targetTerm);
        mergedWorkloadRows = [...otherTermsRows, ...rowsToSave];
      }

      const existingAdminRows = Array.isArray(existingRaw.administrativeRows) ? existingRaw.administrativeRows : [];
      let mergedAdminRows = administrativeRows !== undefined ? administrativeRows : existingAdminRows;
      if (termsInPayload.length > 0 && Array.isArray(administrativeRows) && administrativeRows.length > 0) {
        const otherTermsAdmin = existingAdminRows.filter(r => !termsInPayload.includes(r.term || '1st'));
        mergedAdminRows = [...otherTermsAdmin, ...administrativeRows];
      } else if (targetTerm && Array.isArray(administrativeRows)) {
        const otherTermsAdmin = existingAdminRows.filter(r => (r.term || '1st') !== targetTerm);
        mergedAdminRows = [...otherTermsAdmin, ...administrativeRows];
      }

      const updatedRaw = {
        ...existingRaw,
        workloadRows: mergedWorkloadRows,
        teachingRelatedRows: teachingRelatedRows !== undefined ? teachingRelatedRows : (existingRaw.teachingRelatedRows || existingRaw.teaching_related_rows || []),
        administrativeRows: mergedAdminRows,
        workloadSavedAt
      };
      await client.query(
        `UPDATE esf7_personnel_profile SET raw_payload = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(updatedRaw), targetPersonId]
      );
    } else {
      const generatedPrn = String(targetPersonId).startsWith('PRN-') ? targetPersonId : `PRN-${String(targetPersonId).replace(/^PER-/, '')}`;
      // Baseline profile fallback so foreign key constraint does not fail
      await client.query(`
        INSERT INTO esf7_personnel_profile (id, prn, school_id, school_year, first_name, last_name, raw_payload, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'TEACHER', 'STAFF', $5::jsonb, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET raw_payload = EXCLUDED.raw_payload, updated_at = NOW()
      `, [targetPersonId, generatedPrn, targetSchoolId, targetSchoolYear, JSON.stringify({ workloadRows: rowsToSave, teachingRelatedRows, administrativeRows, workloadSavedAt })]);
    }

    // Clean school ID
    targetSchoolId = String(targetSchoolId).replace('SCH-', '');

    // 2. Delete existing workload rows for this personnel (scoped by terms present in payload to preserve other terms)
    const termsInPayload = replaceTerms();
    if (termsInPayload.length > 0) {
      await client.query(
        `DELETE FROM esf7_workload_rows WHERE personnel_id = $1 AND COALESCE(term, '1st') = ANY($2::text[])`,
        [targetPersonId, termsInPayload]
      );
    } else if (targetTerm) {
      await client.query(
        `DELETE FROM esf7_workload_rows WHERE personnel_id = $1 AND (term = $2 OR (term IS NULL AND $2 = '1st'))`,
        [targetPersonId, targetTerm]
      );
    } else {
      await client.query(
        `DELETE FROM esf7_workload_rows WHERE personnel_id = $1`,
        [targetPersonId]
      );
    }

    // 3. Insert each workload row
    const insertedRows = [];
    for (let i = 0; i < rowsToSave.length; i++) {
      const r = rowsToSave[i];
      const seq = String(i + 1).padStart(3, '0');
      const wklId = r.id && !String(r.id).startsWith('new-') && !String(r.id).startsWith('wk-')
        ? String(r.id)
        : `WKL-${targetSchoolId}-${targetPersonId.replace('PER-', '').replace('PRN-', '')}-${seq}-${Date.now().toString(36).slice(-4)}`;

      const gradeLevel = r.gradeLevel || r.grade_level || '';
      const sectionId = r.sectionId || r.section_id || null;
      const sectionName = r.sectionName || r.section_name || '';
      const subject = r.subject || r.subjectName || r.subject_name || 'MATHEMATICS';
      const subjectId = r.subjectId || r.subject_id || null;
      const remediationSubject = r.remediationSubject || r.remediation_subject || null;
      const startTime = r.startTime || r.start_time || null;
      const endTime = r.endTime || r.end_time || null;
      const days = r.days || (r.daySchedule ? String(r.daySchedule).split(',').map(s => s.trim()) : ['M', 'T', 'W', 'TH', 'F']);
      const term = r.term || targetTerm || '1st';

      const insertQuery = `
        INSERT INTO esf7_workload_rows (
          id, personnel_id, school_id, school_year, grade_level, section_id, section_name,
          subject, subject_id, remediation_subject, start_time, end_time, days, term, raw_payload, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15::jsonb, NOW(), NOW())
        RETURNING *;
      `;

      const insertValues = [
        wklId,
        targetPersonId,
        targetSchoolId,
        targetSchoolYear,
        gradeLevel,
        sectionId,
        sectionName,
        subject,
        subjectId,
        remediationSubject,
        startTime,
        endTime,
        JSON.stringify(days),
        term,
        JSON.stringify({ ...r, id: wklId, sectionId, sectionName, gradeLevel, subject, startTime, endTime, days, term })
      ];

      const resRow = await client.query(insertQuery, insertValues);
      insertedRows.push(formatWorkloadRecord(resRow.rows[0]));
    }

    // 4. Also handle SHS workloads if provided or present
    if (shsWorkloads) {
      if (targetTerm) {
        await client.query(`DELETE FROM esf7_shs_workload_rows WHERE personnel_id = $1 AND (term = $2 OR (term IS NULL AND $2 = '1st'))`, [targetPersonId, targetTerm]);
      } else {
        await client.query(`DELETE FROM esf7_shs_workload_rows WHERE personnel_id = $1`, [targetPersonId]);
      }

      let allShsList = [];
      if (Array.isArray(shsWorkloads)) {
        allShsList = shsWorkloads;
      } else if (typeof shsWorkloads === 'object') {
        Object.entries(shsWorkloads).forEach(([tKey, tRows]) => {
          if (Array.isArray(tRows)) {
            tRows.forEach(tr => allShsList.push({ ...tr, term: tr.term || tKey }));
          }
        });
      }

      for (let sIdx = 0; sIdx < allShsList.length; sIdx++) {
        const sr = allShsList[sIdx];
        const sSeq = String(sIdx + 1).padStart(3, '0');
        const shsId = sr.id && !String(sr.id).startsWith('shs-')
          ? String(sr.id)
          : `SHS-WKL-${targetSchoolId}-${targetPersonId.replace('PER-', '')}-${sSeq}`;

        await client.query(`
          INSERT INTO esf7_shs_workload_rows (
            id, personnel_id, school_id, school_year, term, semester, grade_level,
            track_strand, shs_subject_category, section_id, section_name,
            subject, subject_id, remediation_subject, start_time, end_time, days, raw_payload, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18::jsonb, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, days = EXCLUDED.days, raw_payload = EXCLUDED.raw_payload, updated_at = NOW()
        `, [
          shsId,
          targetPersonId,
          targetSchoolId,
          targetSchoolYear,
          sr.term || targetTerm || '1st',
          sr.semester || null,
          sr.gradeLevel || sr.grade_level || 'Grade 11',
          sr.trackStrand || sr.track_strand || null,
          sr.shsSubjectCategory || sr.shs_subject_category || sr.category || null,
          sr.sectionId || sr.section_id || null,
          sr.sectionName || sr.section_name || null,
          sr.subject || 'GENERAL MATHEMATICS',
          sr.subjectId || sr.subject_id || null,
          sr.remediationSubject || sr.remediation_subject || null,
          sr.startTime || sr.start_time || null,
          sr.endTime || sr.end_time || null,
          JSON.stringify(sr.days || ['M', 'T', 'W', 'TH', 'F']),
          JSON.stringify(sr)
        ]);
      }
    }

    // 5. Ingest Teaching-Related Tasks (esf7_related_task)
    if (Array.isArray(teachingRelatedRows)) {
      await client.query('DELETE FROM esf7_related_task WHERE personnel_id = $1', [targetPersonId]);
      let trCounter = 1;
      for (const tr of teachingRelatedRows) {
        if (!tr || (!tr.task && !tr.task_name && !tr.designationName)) continue;
        const trId = `TRT-${targetSchoolId}-${targetPersonId.split('-').pop()}-${String(trCounter++).padStart(3, '0')}`;
        const tName = tr.task || tr.task_name || tr.designationName || 'Teaching-Related Task';
        const freq = String(tr.cadence || tr.frequency || 'weekly').toLowerCase();
        
        let durMins = 60;
        if (tr.duration_minutes !== undefined && tr.duration_minutes !== null) {
          durMins = parseInt(tr.duration_minutes, 10) || 60;
        } else if (tr.durationMinutes !== undefined && tr.durationMinutes !== null) {
          durMins = parseInt(tr.durationMinutes, 10) || 60;
        } else if (tr.hours !== undefined && tr.hours !== null) {
          durMins = Math.round(parseFloat(tr.hours) * 60) || 60;
        }

        const durHours = durMins / 60;
        let t1Hrs = 0;
        if (freq === 'daily') {
          t1Hrs = parseFloat((durHours * 60).toFixed(2));
        } else if (freq === 'monthly') {
          t1Hrs = parseFloat((durHours * 3).toFixed(2));
        } else {
          t1Hrs = parseFloat((durHours * 12).toFixed(2));
        }

        const isDesig = !!(tr.isDesignationSynced || tr.is_designation_synced || tr.isLocked || tr.isSdsApproved);

        await client.query(
          `INSERT INTO esf7_related_task (
             id, personnel_id, school_id, school_year, task_name, frequency,
             duration_minutes, term1_hours, is_designation_synced, raw_payload, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
          [
            trId,
            targetPersonId,
            targetSchoolId,
            targetSchoolYear,
            tName,
            freq,
            durMins,
            t1Hrs,
            isDesig,
            JSON.stringify(tr)
          ]
        );
      }
    }

    // 6. Ingest Administrative Tasks (esf7_admin_task)
    if (Array.isArray(administrativeRows)) {
      if (targetTerm) {
        await client.query('DELETE FROM esf7_admin_task WHERE personnel_id = $1 AND (term = $2 OR (term IS NULL AND $2 = \'1st\'))', [targetPersonId, targetTerm]);
      } else {
        await client.query('DELETE FROM esf7_admin_task WHERE personnel_id = $1', [targetPersonId]);
      }
      let admCounter = 1;
      for (const adm of administrativeRows) {
        if (!adm || (!adm.task && !adm.task_name && !adm.name && !adm.subject)) continue;
        const admId = `ADM-${targetSchoolId}-${targetPersonId.split('-').pop()}-${String(admCounter++).padStart(3, '0')}`;
        const tName = adm.task || adm.task_name || adm.name || adm.subject || 'Administrative Task';
        const datesArr = Array.isArray(adm.dates) ? adm.dates : (adm.taskDate ? [adm.taskDate] : (adm.date ? [adm.date] : []));
        const category = adm.category || adm.taskCategory || adm.task_category || 'General Administration';
        const term = adm.term || targetTerm || '1st';
        const days = Array.isArray(adm.days) ? adm.days : ['M', 'T', 'W', 'TH', 'F'];
        const startTime = adm.startTime || adm.start_time || null;
        const endTime = adm.endTime || adm.end_time || null;
        const startDate = adm.startDate || adm.start_date || null;
        const endDate = adm.endDate || adm.end_date || null;

        let durMins = 60;
        if (adm.duration_minutes !== undefined && adm.duration_minutes !== null) {
          durMins = parseInt(adm.duration_minutes, 10) || 60;
        } else if (adm.durationMinutes !== undefined && adm.durationMinutes !== null) {
          durMins = parseInt(adm.durationMinutes, 10) || 60;
        } else if (adm.minutes !== undefined && adm.minutes !== null) {
          durMins = parseInt(adm.minutes, 10) || 60;
        } else if (adm.hours !== undefined && adm.hours !== null) {
          durMins = Math.round(parseFloat(adm.hours) * 60) || 60;
        } else if (startTime && endTime) {
          const [sh, sm] = startTime.split(':').map(Number);
          const [eh, em] = endTime.split(':').map(Number);
          if (!isNaN(sh) && !isNaN(eh)) {
            durMins = Math.max(15, (eh * 60 + em) - (sh * 60 + sm));
          }
        }

        const daysCount = days.length > 0 ? days.length : 5;
        const weeklyHours = (durMins / 60) * daysCount;
        const termTotalHours = parseFloat((weeklyHours * 12).toFixed(2));
        const isDesig = !!(adm.isDesignationSynced || adm.is_designation_synced);

        await client.query(
          `INSERT INTO esf7_admin_task (
             id, personnel_id, school_id, school_year, task_name, task_category,
             start_date, end_date, start_time, end_time, days, dates, term,
             duration_minutes, term_total_hours, is_designation_synced, status,
             raw_payload, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15, $16, $17, $18::jsonb, NOW(), NOW())`,
          [
            admId,
            targetPersonId,
            targetSchoolId,
            targetSchoolYear,
            tName,
            category,
            startDate,
            endDate,
            startTime,
            endTime,
            JSON.stringify(days),
            JSON.stringify(datesArr),
            term,
            durMins,
            termTotalHours,
            isDesig,
            'ACTIVE',
            JSON.stringify(adm)
          ]
        );
      }
    }

    // Zero (or fewer) rows written for rows that were sent is a failure, never a quiet success: roll everything back.
    if (insertedRows.length !== rowsToSave.length) {
      throw new Error(`Workload save wrote ${insertedRows.length} of ${rowsToSave.length} rows for ${targetPersonId}; nothing was saved.`);
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      message: `Saved ${insertedRows.length} workload rows for personnel ${targetPersonId} successfully.`,
      rowsRequested: rowsToSave.length,
      rowsWritten: insertedRows.length,
      count: insertedRows.length,
      workloadSavedAt,
      data: insertedRows
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating personnel workload rows:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
};

router.put('/personnel/:personnel_id', saveWorkloadBatchHandler);
router.post('/personnel/:personnel_id', saveWorkloadBatchHandler);
router.post('/bulk', saveWorkloadBatchHandler);
router.put('/bulk', saveWorkloadBatchHandler);

// PUT Update an existing workload row
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      grade_level, gradeLevel,
      section_id, sectionId,
      section_name, sectionName,
      subject,
      subject_id, subjectId,
      remediation_subject, remediationSubject,
      start_time, startTime,
      end_time, endTime,
      days
    } = req.body;

    const existingRes = await db.query(`SELECT * FROM esf7_workload_rows WHERE id = $1`, [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: `Workload row ${id} not found` });
    }

    const current = existingRes.rows[0];
    const mergedRaw = { ...(current.raw_payload || {}), ...req.body };

    const query = `
      UPDATE esf7_workload_rows
      SET
        grade_level = COALESCE($1, grade_level),
        section_id = COALESCE($2, section_id),
        section_name = COALESCE($3, section_name),
        subject = COALESCE($4, subject),
        subject_id = COALESCE($5, subject_id),
        remediation_subject = COALESCE($6, remediation_subject),
        start_time = COALESCE($7, start_time),
        end_time = COALESCE($8, end_time),
        days = COALESCE($9::jsonb, days),
        raw_payload = $10::jsonb,
        updated_at = NOW()
      WHERE id = $11
      RETURNING *;
    `;

    const values = [
      grade_level || gradeLevel || null,
      section_id || sectionId || null,
      section_name || sectionName || null,
      subject || null,
      subject_id || subjectId || null,
      remediation_subject || remediationSubject || null,
      start_time || startTime || null,
      end_time || endTime || null,
      days ? JSON.stringify(days) : null,
      JSON.stringify(mergedRaw),
      id
    ];

    const result = await db.query(query, values);
    res.json(formatWorkloadRecord(result.rows[0]));
  } catch (err) {
    console.error('Error updating esf7_workload_rows:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE all workload rows for a personnel
router.delete('/personnel/:personnel_id', async (req, res) => {
  try {
    const { personnel_id } = req.params;
    await db.query(`DELETE FROM esf7_workload_rows WHERE personnel_id = $1`, [personnel_id]);
    res.json({ success: true, message: `All workload rows for personnel ${personnel_id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE all workload rows in a school
router.delete('/school/:school_id', async (req, res) => {
  try {
    const { school_id } = req.params;
    await db.query(`DELETE FROM esf7_workload_rows WHERE school_id = $1`, [school_id]);
    res.json({ success: true, message: `All workload rows for school ${school_id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE all workload rows (bulk clear)
router.delete('/clear-all', async (req, res) => {
  try {
    await db.query(`DELETE FROM esf7_workload_rows`);
    res.json({ success: true, message: 'All workload rows deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a specific workload row by ID
router.delete('/:id', async (req, res) => {
  try {
    const rowRes = await db.query(`SELECT personnel_id FROM esf7_workload_rows WHERE id = $1`, [req.params.id]);
    const pId = rowRes.rows.length > 0 ? rowRes.rows[0].personnel_id : null;

    await db.query(`DELETE FROM esf7_workload_rows WHERE id = $1`, [req.params.id]);
    const workloadSavedAt = new Date().toISOString();

    if (pId) {
      const pRes = await db.query(`SELECT raw_payload FROM esf7_personnel_profile WHERE id = $1`, [pId]);
      if (pRes.rows.length > 0 && pRes.rows[0].raw_payload) {
        const raw = pRes.rows[0].raw_payload;
        if (Array.isArray(raw.workloadRows)) {
          raw.workloadRows = raw.workloadRows.filter(r => String(r.id) !== String(req.params.id));
          raw.workloadSavedAt = workloadSavedAt;
          await db.query(`UPDATE esf7_personnel_profile SET raw_payload = $1::jsonb, updated_at = NOW() WHERE id = $2`, [JSON.stringify(raw), pId]);
        }
      }
    }

    res.json({ success: true, workloadSavedAt, message: `Workload row ${req.params.id} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ───────────────────────── Source-of-truth reads and term-scoped clears ─────────────────────────
const cleanSchool = (v) => String(v || '').replace(/^SCH-/i, '').trim();

// The school is always named in the query (?schoolId=...) so the auth gate can check it against the login token.
function requireSchoolQuery(req, res) {
  const schoolId = cleanSchool(req.query.schoolId || req.query.school_id);
  if (!schoolId) {
    res.status(400).json({ error: 'schoolId is required' });
    return null;
  }
  return schoolId;
}

// Loads the teacher and confirms they belong to the named school. Returns null after sending the error response.
async function loadTeacherInSchool(runner, res, personnelId, schoolId) {
  const r = await runner.query(
    `SELECT id, school_id, raw_payload FROM esf7_personnel_profile WHERE id = $1 OR prn = $1 LIMIT 1`,
    [personnelId]
  );
  if (r.rows.length === 0) {
    res.status(404).json({ error: 'Personnel not found' });
    return null;
  }
  if (cleanSchool(r.rows[0].school_id) !== schoolId) {
    res.status(403).json({ error: 'This teacher does not belong to the named school.' });
    return null;
  }
  return r.rows[0];
}

// GET one teacher's saved workload for a term plus the version marker the page uses to detect newer saved data.
router.get('/personnel/:personnel_id/state', async (req, res) => {
  try {
    const schoolId = requireSchoolQuery(req, res);
    if (!schoolId) return;
    const teacher = await loadTeacherInSchool(db, res, req.params.personnel_id, schoolId);
    if (!teacher) return;
    const term = req.query.term ? String(req.query.term) : null;
    const result = term
      ? await db.query(`SELECT * FROM esf7_workload_rows WHERE personnel_id = $1 AND COALESCE(term, '1st') = $2 ORDER BY created_at ASC`, [teacher.id, term])
      : await db.query(`SELECT * FROM esf7_workload_rows WHERE personnel_id = $1 ORDER BY created_at ASC`, [teacher.id]);
    const raw = teacher.raw_payload || {};
    res.json({
      personnelId: teacher.id,
      term,
      version: raw.workloadSavedAt || null,
      rows: result.rows.map(formatWorkloadRecord)
    });
  } catch (err) {
    console.error('[Workload State GET Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Removes one term's rows from raw_payload.workloadRows (every other term is kept) and stamps the version marker.
// $2 = term, $3 = new marker.
const SQL_STRIP_TERM_FROM_PAYLOAD = `
  jsonb_set(
    jsonb_set(
      COALESCE(raw_payload, '{}'::jsonb),
      '{workloadRows}',
      COALESCE((
        SELECT jsonb_agg(e) FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(raw_payload->'workloadRows') = 'array' THEN raw_payload->'workloadRows' ELSE '[]'::jsonb END
        ) e WHERE COALESCE(e->>'term', '1st') <> $2
      ), '[]'::jsonb)
    ),
    '{workloadSavedAt}', to_jsonb($3::text)
  )`;

// DELETE one teacher's rows for one term (workload rows, SHS rows, and the copy in the profile payload).
router.delete('/personnel/:personnel_id/term/:term', async (req, res) => {
  const client = await db.getClient();
  try {
    const schoolId = requireSchoolQuery(req, res);
    if (!schoolId) return;
    const term = String(req.params.term);
    await client.query('BEGIN');
    const teacher = await loadTeacherInSchool(client, res, req.params.personnel_id, schoolId);
    if (!teacher) {
      await client.query('ROLLBACK');
      return;
    }
    const workloadSavedAt = new Date().toISOString();
    const del = await client.query(`DELETE FROM esf7_workload_rows WHERE personnel_id = $1 AND COALESCE(term, '1st') = $2`, [teacher.id, term]);
    await client.query(`DELETE FROM esf7_shs_workload_rows WHERE personnel_id = $1 AND COALESCE(term, '1st') = $2`, [teacher.id, term]);
    await client.query(
      `UPDATE esf7_personnel_profile SET raw_payload = ${SQL_STRIP_TERM_FROM_PAYLOAD}, updated_at = NOW() WHERE id = $1`,
      [teacher.id, term, workloadSavedAt]
    );
    await client.query('COMMIT');
    res.json({ success: true, deleted: del.rowCount, term, workloadSavedAt });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* already rolled back */ }
    console.error('[Workload term clear (teacher) Error]:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE every teacher's rows for one term in the named school (other terms and other schools are untouched).
router.delete('/term-clear/school', async (req, res) => {
  const client = await db.getClient();
  try {
    const schoolId = requireSchoolQuery(req, res);
    if (!schoolId) return;
    const term = req.query.term ? String(req.query.term) : '';
    if (!term) return res.status(400).json({ error: 'term is required' });
    const ids = [schoolId, `SCH-${schoolId}`];
    const workloadSavedAt = new Date().toISOString();
    await client.query('BEGIN');
    const del = await client.query(`DELETE FROM esf7_workload_rows WHERE school_id = ANY($1::text[]) AND COALESCE(term, '1st') = $2`, [ids, term]);
    await client.query(`DELETE FROM esf7_shs_workload_rows WHERE school_id = ANY($1::text[]) AND COALESCE(term, '1st') = $2`, [ids, term]);
    const upd = await client.query(
      `UPDATE esf7_personnel_profile SET raw_payload = ${SQL_STRIP_TERM_FROM_PAYLOAD}, updated_at = NOW() WHERE school_id = ANY($1::text[])`,
      [ids, term, workloadSavedAt]
    );
    await client.query('COMMIT');
    res.json({ success: true, deleted: del.rowCount, teachers: upd.rowCount, term, workloadSavedAt });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* already rolled back */ }
    console.error('[Workload term clear (school) Error]:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.formatWorkloadRecord = formatWorkloadRecord;
module.exports = router;
