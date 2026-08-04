const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const db = require('../../db');
const XLSX = require('xlsx');
const { generateESF7Xlsb } = require('./esf7_xlsb');

// GET /api/reports/esf7-xlsb - Generate 1-sheet VIEW eSF7 Binary Report
router.get('/esf7-xlsb', generateESF7Xlsb);

// ── Default SY 2026-2027 3-Term School Calendar ──────────────────────────────
const DEFAULT_SY_TERMS = [
  { term_name: 'Term 1 - Opening & Instructional', block_type: 'instructional', start_date: '2026-06-08', end_date: '2026-09-01', is_teaching: true },
  { term_name: 'Term 1 - End-of-Term Block', block_type: 'end_of_term', start_date: '2026-09-02', end_date: '2026-09-15', is_teaching: false },
  { term_name: 'Term 2 - Instructional Block', block_type: 'instructional', start_date: '2026-09-16', end_date: '2026-12-04', is_teaching: true },
  { term_name: 'Term 2 - End-of-Term Block', block_type: 'end_of_term', start_date: '2026-12-07', end_date: '2026-12-18', is_teaching: false },
  { term_name: 'Term 3 - Instructional Block', block_type: 'instructional', start_date: '2027-01-04', end_date: '2027-03-23', is_teaching: true },
  { term_name: 'Term 3 - End-of-Term Block', block_type: 'end_of_term', start_date: '2027-03-24', end_date: '2027-04-08', is_teaching: false },
  { term_name: 'Summer / End of SY Vacation', block_type: 'vacation', start_date: '2027-04-09', end_date: '2027-06-06', is_teaching: false }
];

// Helper: Calculate monthly working day breakdown given effective calendar terms
function calculateMonthlyBreakdown(year, month, terms) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10); // 1-indexed
  const daysInMonth = new Date(y, m, 0).getDate();

  let totalWeekdays = 0;
  let instructionalDays = 0;
  let nonTeachingDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const mm = String(m).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const dateStr = `${y}-${mm}-${dd}`;
    const dateObj = new Date(y, m - 1, day);
    const dayOfWeek = dateObj.getDay();

    // Only count Mon-Fri
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      totalWeekdays++;

      // Check if this date falls into an instructional block
      let isInstructional = false;
      for (const t of terms) {
        const startStr = typeof t.start_date === 'string' ? t.start_date.substring(0, 10) : new Date(t.start_date).toISOString().substring(0, 10);
        const endStr = typeof t.end_date === 'string' ? t.end_date.substring(0, 10) : new Date(t.end_date).toISOString().substring(0, 10);

        if (dateStr >= startStr && dateStr <= endStr) {
          if (t.is_teaching && t.block_type === 'instructional') {
            isInstructional = true;
          } else {
            isInstructional = false;
            break;
          }
        }
      }

      if (isInstructional) {
        instructionalDays++;
      } else {
        nonTeachingDays++;
      }
    }
  }

  const ratio = totalWeekdays > 0 ? (instructionalDays / totalWeekdays) : 0;
  return {
    month: `${y}-${String(m).padStart(2, '0')}`,
    totalWeekdays,
    instructionalDays,
    nonTeachingDays,
    ratio: Math.round(ratio * 10000) / 10000,
    ratioPercent: `${(ratio * 100).toFixed(1)}%`
  };
}

// GET /api/reports/calendar-terms/:schoolId - Fetch terms & monthly ratios preview
router.get('/calendar-terms/:schoolId', async (req, res) => {
  const { schoolId } = req.params;
  const schoolYear = req.query.school_year || 'SY 2026-2027';

  try {
    const termRes = await db.query(
      `SELECT id, school_id, school_year, term_name, block_type, 
              to_char(start_date, 'YYYY-MM-DD') as start_date, 
              to_char(end_date, 'YYYY-MM-DD') as end_date, 
              is_teaching 
       FROM school_calendar_terms 
       WHERE school_id = $1 AND school_year = $2 
       ORDER BY start_date ASC`,
      [schoolId, schoolYear]
    );

    const terms = termRes.rows.length > 0 ? termRes.rows : DEFAULT_SY_TERMS.map(t => ({ ...t, school_id: schoolId, school_year: schoolYear }));

    // Generate monthly ratios for June 2026 through June 2027
    const monthsToCalculate = [
      '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11',
      '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06'
    ];

    const monthlyBreakdown = monthsToCalculate.map(mStr => {
      const [y, m] = mStr.split('-');
      return calculateMonthlyBreakdown(y, m, terms);
    });

    res.json({
      success: true,
      schoolId,
      schoolYear,
      terms,
      monthlyBreakdown
    });
  } catch (err) {
    console.error('Error fetching calendar terms:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reports/calendar-terms - Upsert calendar term overrides
router.post('/calendar-terms', async (req, res) => {
  const { school_id, school_year, terms } = req.body;
  if (!school_id || !terms || !Array.isArray(terms)) {
    return res.status(400).json({ error: 'school_id and terms array are required' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM school_calendar_terms WHERE school_id = $1 AND school_year = $2', [school_id, school_year || 'SY 2026-2027']);

    for (const t of terms) {
      await client.query(
        `INSERT INTO school_calendar_terms (school_id, school_year, term_name, block_type, start_date, end_date, is_teaching)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [school_id, school_year || 'SY 2026-2027', t.term_name, t.block_type, t.start_date, t.end_date, t.is_teaching === true]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, message: 'School calendar terms saved successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/reports/generate-overload-pay - Generate Overload Pay Report Excel
router.post('/generate-overload-pay', async (req, res) => {
  const { school_id, school_year, months, calendar_overrides } = req.body;
  const sId = school_id || '123456';
  const sYear = school_year || 'SY 2026-2027';
  const selectedMonths = months || ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05'];

  try {
    // 1. Fetch Calendar Terms
    let terms = calendar_overrides;
    if (!terms || !Array.isArray(terms) || terms.length === 0) {
      const termRes = await db.query(
        `SELECT id, school_id, school_year, term_name, block_type, 
                to_char(start_date, 'YYYY-MM-DD') as start_date, 
                to_char(end_date, 'YYYY-MM-DD') as end_date, 
                is_teaching 
         FROM school_calendar_terms 
         WHERE school_id = $1 AND school_year = $2 
         ORDER BY start_date ASC`,
        [sId, sYear]
      );
      terms = termRes.rows.length > 0 ? termRes.rows : DEFAULT_SY_TERMS;
    }

    // 2. Compute Ratios for Selected Months
    const monthRatios = {};
    const monthlySummary = selectedMonths.map(mStr => {
      const [y, m] = mStr.split('-');
      const res = calculateMonthlyBreakdown(y, m, terms);
      monthRatios[mStr] = res;
      return res;
    });

    // 3. Fetch Active Personnel & Workload Rows
    const personnelRes = await db.query(
      `SELECT p.id, p.prn, p.employee_no, p.first_name, p.middle_name, p.last_name, p.name_extension,
              e.position, e.employment_status, e.nature_of_appointment
       FROM personnel p
       LEFT JOIN personnel_employment e ON p.id = e.personnel_id
       WHERE p.school_id = $1 AND p.school_year = $2
       ORDER BY p.last_name ASC`,
      [sId, sYear]
    );

    const personnelList = personnelRes.rows;

    const workloadRes = await db.query(
      `SELECT id, personnel_id, subject, start_time, end_time, days
       FROM workload_rows
       WHERE school_id = $1 AND school_year = $2 AND row_type = 'teaching'`,
      [sId, sYear]
    );

    const workloadsByPersonnel = {};
    for (const w of workloadRes.rows) {
      if (!workloadsByPersonnel[w.personnel_id]) {
        workloadsByPersonnel[w.personnel_id] = [];
      }
      workloadsByPersonnel[w.personnel_id].push(w);
    }

    // 4. Compute Overload per Personnel
    const reportRows = [];
    const monthlyMatrixRows = [];

    for (const p of personnelList) {
      const fullName = `${p.last_name}, ${p.first_name} ${p.middle_name ? p.middle_name[0] + '.' : ''}`.trim();
      const pWorkloads = workloadsByPersonnel[p.id] || [];

      // Calculate total weekly teaching minutes assigned
      let totalWeeklyMins = 0;
      for (const w of pWorkloads) {
        if (w.start_time && w.end_time) {
          const [sh, sm] = w.start_time.split(':').map(Number);
          const [eh, em] = w.end_time.split(':').map(Number);
          const durationMins = (eh * 60 + em) - (sh * 60 + sm);
          const dayCount = (w.days || []).length || 5;
          if (durationMins > 0) {
            totalWeeklyMins += (durationMins * dayCount);
          }
        }
      }

      const totalWeeklyHours = totalWeeklyMins / 60;
      // DepEd Standard regular teaching load = 30 hrs/week (6 hrs/day)
      const baseOverloadWeeklyHours = Math.max(0, totalWeeklyHours - 30);

      // Compute monthly breakdown for this personnel
      let totalAdjustedOverloadHours = 0;
      const matrixRow = {
        'Employee ID': p.employee_no || p.id,
        'PRN': p.prn || '',
        'Full Name': fullName,
        'Position': p.position || 'Teacher',
        'Base Weekly Overload (Hrs)': baseOverloadWeeklyHours.toFixed(2)
      };

      for (const mStr of selectedMonths) {
        const rData = monthRatios[mStr] || { ratio: 0 };
        // Base monthly overload = weekly overload * 4 weeks
        const baseMonthlyOverload = baseOverloadWeeklyHours * 4;
        const adjustedMonthlyOverload = baseMonthlyOverload * rData.ratio;
        totalAdjustedOverloadHours += adjustedMonthlyOverload;

        matrixRow[`${mStr} (Ratio: ${(rData.ratio * 100).toFixed(0)}%)`] = adjustedMonthlyOverload.toFixed(2);
      }

      matrixRow['Total Adjusted Overload (Hrs)'] = totalAdjustedOverloadHours.toFixed(2);
      monthlyMatrixRows.push(matrixRow);

      reportRows.push({
        personnelId: p.id,
        employeeNo: p.employee_no || p.id,
        prn: p.prn || '',
        fullName,
        position: p.position || 'Teacher',
        baseWeeklyOverloadHours: baseOverloadWeeklyHours,
        totalAdjustedOverloadHours: Math.round(totalAdjustedOverloadHours * 100) / 100,
        remarks: baseOverloadWeeklyHours > 0 ? 'Eligible for Overload Pay' : 'Regular Load (No Overload)'
      });
    }

    // 5. Generate Excel Workbook using XLSX
    const wb = XLSX.utils.book_new();

    // Sheet 1: Overload Pay Summary
    const summarySheetData = reportRows.map(r => ({
      'Employee No': r.employeeNo,
      'PRN': r.prn,
      'Full Name': r.fullName,
      'Position': r.position,
      'Weekly Overload Load (Hrs)': r.baseWeeklyOverloadHours.toFixed(2),
      'Total Adjusted Overload Pay (Hrs)': r.totalAdjustedOverloadHours.toFixed(2),
      'Remarks': r.remarks
    }));
    const ws1 = XLSX.utils.json_to_sheet(summarySheetData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Overload Pay Summary');

    // Sheet 2: Term Ratios & Monthly Schedule
    const ratioSheetData = monthlySummary.map(m => ({
      'Month (YYYY-MM)': m.month,
      'Total Weekdays': m.totalWeekdays,
      'Actual Instructional Days': m.instructionalDays,
      'Vacation / Non-Teaching Days': m.nonTeachingDays,
      'Effective Teaching Ratio': m.ratioPercent
    }));
    const ws2 = XLSX.utils.json_to_sheet(ratioSheetData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Term Ratios & Calendar');

    // Sheet 3: Monthly Overload Breakdown Matrix
    const ws3 = XLSX.utils.json_to_sheet(monthlyMatrixRows);
    XLSX.utils.book_append_sheet(wb, ws3, 'Monthly Breakdown Matrix');

    // Ensure output scratch folder
    const scratchDir = path.join(__dirname, '../../scratch');
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }

    const timestamp = Date.now();
    const filename = `Overload_Pay_Report_${sId}_${timestamp}.xlsx`;
    const filePath = path.join(scratchDir, filename);

    XLSX.writeFile(wb, filePath);

    res.json({
      success: true,
      schoolId: sId,
      schoolYear: sYear,
      filename,
      downloadUrl: `/api/reports/download-overload-pay/${filename}`,
      summary: reportRows,
      monthlyRatios: monthlySummary
    });

  } catch (err) {
    console.error('Error generating Overload Pay Report:', err);
    res.status(500).json({ error: 'Failed to generate overload pay report', message: err.message });
  }
});

// GET /api/reports/download-overload-pay/:filename - Serve generated report file
router.get('/download-overload-pay/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, '../../scratch', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Report file not found or expired' });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(filePath);
});

router.get('/esf7/:schoolId', async (req, res) => {
  const { schoolId } = req.params;
  
  try {
    let school = {
      school_id: schoolId || '108348',
      school_name: 'MAJAYJAY ELEMENTARY SCHOOL',
      region: 'REGION IV-A',
      division: 'LAGUNA',
      district: 'MAJAYJAY',
      school_year: 'SY 2026-2027'
    };
    let personnel = [];

    // 1. Try school_drafts payload lookup
    try {
      const draftRes = await db.query('SELECT payload FROM school_drafts LIMIT 1');
      if (draftRes.rows.length > 0 && draftRes.rows[0].payload) {
        const payload = draftRes.rows[0].payload;
        if (payload.schoolInfo) {
          school = {
            school_id: payload.schoolInfo.schoolId || payload.schoolInfo.school_id || school.school_id,
            school_name: payload.schoolInfo.schoolName || payload.schoolInfo.school_name || school.school_name,
            region: payload.schoolInfo.region || school.region,
            division: payload.schoolInfo.division || school.division,
            district: payload.schoolInfo.district || school.district,
            school_year: payload.schoolInfo.schoolYear || payload.schoolInfo.school_year || school.school_year
          };
        }
        if (Array.isArray(payload.personnel)) {
          personnel = payload.personnel;
        }
      }
    } catch (draftErr) {
      console.warn('[eSF7-PDF] school_drafts lookup failed:', draftErr.message);
    }

    // 2. Fallback to DB query if personnel is empty
    if (personnel.length === 0) {
      try {
        const schoolRes = await db.query('SELECT * FROM schools WHERE school_id = $1 LIMIT 1', [schoolId]);
        if (schoolRes.rows.length > 0) school = schoolRes.rows[0];

        const personnelRes = await db.query('SELECT * FROM personnel ORDER BY last_name ASC');
        personnel = personnelRes.rows;
      } catch (dbErr) {
        console.warn('[eSF7-PDF] DB lookup failed:', dbErr.message);
      }
    }

    // 3. Load PDF Template
    const templatePath = path.join(__dirname, '../../../eSF7-R##-SDO-SchoolID_SchoolName-SY2026-2027_0609 - Copy (1).pdf');
    if (!fs.existsSync(templatePath)) {
       return res.status(500).json({ error: 'PDF Template not found on server' });
    }
    const pdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    // Get the first page to draw on
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];

    // --- OVERLAY DATA ---
    const drawText = (text, x, y, size = 10) => {
      if (text) {
        firstPage.drawText(String(text), {
          x,
          y,
          size,
          color: rgb(0, 0, 0),
        });
      }
    };

    // Draw School Info (Coordinates are examples)
    // You will likely need to adjust these coordinates perfectly to match the boxes
    drawText(school.school_id, 160, 755, 10); 
    drawText(school.school_name, 160, 735, 10);
    drawText(school.region, 410, 755, 10);
    drawText(school.division, 580, 755, 10);
    drawText(school.district, 580, 735, 10);
    drawText(school.school_year, 740, 735, 10);

    // Draw Personnel (Example starting at Y=500, moving down 20px per row)
    // We will need to white out the old table data here as well eventually
    let currentY = 500;
    personnel.forEach((p, i) => {
      if (currentY < 50) return; // simple page bounds check
      const fullName = `${p.last_name}, ${p.first_name} ${p.middle_name ? p.middle_name[0] + '.' : ''}`;
      drawText(fullName, 50, currentY, 8);
      drawText(p.position || 'N/A', 250, currentY, 8);
      drawText(p.nature_of_appointment || 'N/A', 400, currentY, 8);
      currentY -= 20;
    });

    // 4. Save and send PDF
    const pdfBytesOut = await pdfDoc.save();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=eSF7_${school.school_id}_${school.school_year}.pdf`);
    res.send(Buffer.from(pdfBytesOut));
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF report', message: error.message, stack: error.stack });
  }
});

module.exports = router;
