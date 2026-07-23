/**
 * esf7_worker_thread.js
 * Generates eSF7 report with strictly ONLY the 'VIEW' sheet.
 * Implements the exact cell mapping matching official eSF7 VBA specification.
 */
const { workerData, parentPort } = require('worker_threads');
const xlsx = require('xlsx');
const fs   = require('fs');

const timeToExcelFrac = (tStr) => {
  if (!tStr || typeof tStr !== 'string') return 0;
  const parts = tStr.trim().split(':');
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return (h * 60 + m) / 1440;
};

const getMinutesBetween = (startStr, endStr) => {
  if (!startStr || !endStr) return 0;
  const sParts = startStr.trim().split(':');
  const eParts = endStr.trim().split(':');
  if (sParts.length < 2 || eParts.length < 2) return 0;
  const sMins = (parseInt(sParts[0], 10) || 0) * 60 + (parseInt(sParts[1], 10) || 0);
  const eMins = (parseInt(eParts[0], 10) || 0) * 60 + (parseInt(eParts[1], 10) || 0);
  return Math.max(0, eMins - sMins);
};

const formatGradeLevel = (gl) => {
  if (!gl) return 'NG';
  const str = String(gl).toUpperCase().trim();
  if (str.includes('MULTI')) return 'MG';
  if (str.includes('NON') || str.includes('NG')) return 'NG';
  if (str.includes('KINDER')) return 'K';
  if (str.includes('GRADE 10')) return 'G10';
  if (str.includes('GRADE 11')) return 'G11';
  if (str.includes('GRADE 12')) return 'G12';
  if (str.includes('GRADE 1')) return 'G1';
  if (str.includes('GRADE 2')) return 'G2';
  if (str.includes('GRADE 3')) return 'G3';
  if (str.includes('GRADE 4')) return 'G4';
  if (str.includes('GRADE 5')) return 'G5';
  if (str.includes('GRADE 6')) return 'G6';
  if (str.includes('GRADE 7')) return 'G7';
  if (str.includes('GRADE 8')) return 'G8';
  if (str.includes('GRADE 9')) return 'G9';
  return str;
};

try {
  const { templatePath, school, personnelList } = workerData;

  const rawBuf = fs.readFileSync(templatePath);
  const wb = xlsx.read(rawBuf, {
    type: 'buffer',
    cellStyles: false,
    cellNF:     false,
    cellDates:  false,
    sheetStubs: false
  });

  // Strictly enforce 1 sheet: VIEW
  const ws = wb.Sheets['VIEW'] || wb.Sheets[wb.SheetNames[0]];
  wb.SheetNames = ['VIEW'];
  wb.Sheets = { VIEW: ws };

  const setCell = (ref, val) => {
    if (!ws[ref]) ws[ref] = { t: 's', v: '' };
    ws[ref].v = val;
    ws[ref].t = typeof val === 'number' ? 'n' : typeof val === 'boolean' ? 'b' : 's';
  };

  // 1. School Header Metadata
  const schoolId   = String(school.schoolId || school.school_id || '199999');
  const schoolName = String(school.schoolName || school.school_name || 'TEST ELEMENTARY SCHOOL');
  const region     = String(school.region || 'REGION VIII');
  const division   = String(school.division || 'SAMAR (WESTERN SAMAR)');
  const district   = String(school.district || 'BASEY I');
  const schoolYear = String(school.schoolYear || school.school_year || 'SY 26-27');

  setCell('AD5', schoolId);
  setCell('AI5', region);
  setCell('AL5', division);
  setCell('AD7', schoolName);
  setCell('AL7', district);
  setCell('AV7', schoolYear);

  // 2. Clear old hardcoded summary counts (Rows 12 to 26)
  const clearCols = ['AB', 'AF', 'AV', 'AW'];
  for (let r = 12; r <= 26; r++) {
    clearCols.forEach(c => setCell(c + r, 0));
  }

  // 3. Position Summary Counts
  const posCounts = {};
  let totalTeaching = 0;
  let totalNonTeaching = 0;

  personnelList.forEach(p => {
    const pos = (p.position || 'TEACHER I').toUpperCase();
    posCounts[pos] = (posCounts[pos] || 0) + 1;
    if (p.type === 'non-teaching') totalNonTeaching++;
    else totalTeaching++;
  });

  const posRowMap = {
    'SCHOOL PRINCIPAL IV': 12, 'SCHOOL PRINCIPAL III': 12, 'SCHOOL PRINCIPAL II': 12, 'SCHOOL PRINCIPAL I': 12,
    'MASTER TEACHER II': 13, 'MASTER TEACHER I': 14,
    'SPED TEACHER I': 15, 'TEACHER VI': 16, 'TEACHER IV': 17,
    'TEACHER III': 18, 'TEACHER II': 19, 'TEACHER I': 20
  };

  Object.keys(posCounts).forEach(pos => {
    const r = posRowMap[pos];
    if (r) setCell(`AB${r}`, posCounts[pos]);
  });

  setCell('AB27', totalTeaching);
  setCell('AF27', totalNonTeaching);

  // 4. Populate Personnel & Workload Rows Starting at Row 31
  let curRow = 31;

  personnelList.forEach((p) => {
    const idVal      = p.tin || p.philsysNo || p.philsys_no || p.id || '';
    const firstName  = (p.firstName || p.first_name || '').toUpperCase();
    const middleName = (p.middleName || p.middle_name || '').toUpperCase();
    const lastName   = (p.lastName || p.last_name || '').toUpperCase();
    const fullName   = [lastName, firstName, middleName].filter(Boolean).join(', ');
    const sex        = (p.sexAtBirth || p.sex_at_birth || 'FEMALE').toUpperCase();
    const fund       = (p.fundSource || p.fund_source || 'NATIONAL').toUpperCase();
    const pos        = (p.position || 'TEACHER I').toUpperCase();
    const appt       = (p.natureOfAppointment || p.nature_of_appointment || 'REGULAR PERMANENT').toUpperCase();
    const degree     = (p.collegeDegree || p.college_degree || 'BACHELOR DEGREE').toUpperCase();
    const major      = (p.major || 'N/A').toUpperCase();
    const minor      = (p.minor || 'N/A').toUpperCase();

    const workloads = (p.workloadRows && p.workloadRows.length > 0) ? p.workloadRows : [{}];
    const firstRow  = curRow;
    let personTotalMins = 0;

    workloads.forEach((w) => {
      const subject    = (w.subject || w.task || (p.isSchoolHead ? 'ADMINISTRATIVE' : 'TEACHING')).toUpperCase();
      const gradeLevel = (w.gradeLevel || w.grade_level || 'NON-GRADED').toUpperCase();
      const glAbbr     = formatGradeLevel(gradeLevel);
      const section    = (w.sectionName || w.section_name || 'N/A').toUpperCase();

      const startTime  = w.startTime || w.start_time || '';
      const endTime    = w.endTime || w.end_time || '';
      const startFrac  = timeToExcelFrac(startTime);
      const endFrac    = timeToExcelFrac(endTime);
      const dailyMins  = getMinutesBetween(startTime, endTime);
      const daysCount  = Array.isArray(w.days) ? w.days.length : 5;
      const weeklyMins = dailyMins * (daysCount || 5);
      personTotalMins += dailyMins;

      const daysArr    = Array.isArray(w.days) ? w.days.map(d => String(d).toUpperCase()) : ['MON', 'TUE', 'WED', 'THU', 'FRI'];
      const hasMon     = daysArr.some(d => d.includes('MON') || d.includes('M'));
      const hasTue     = daysArr.some(d => d.includes('TUE') || d.includes('T'));
      const hasWed     = daysArr.some(d => d.includes('WED') || d.includes('W'));
      const hasThu     = daysArr.some(d => d.includes('THU') || d.includes('TH'));
      const hasFri     = daysArr.some(d => d.includes('FRI') || d.includes('F'));

      // --- Data Columns (A to Y) ---
      setCell(`A${curRow}`, idVal);
      setCell(`B${curRow}`, firstName);
      setCell(`C${curRow}`, middleName);
      setCell(`D${curRow}`, lastName);
      setCell(`E${curRow}`, sex);
      setCell(`F${curRow}`, fund);
      setCell(`G${curRow}`, pos);
      setCell(`H${curRow}`, appt);
      setCell(`I${curRow}`, degree);
      setCell(`J${curRow}`, major);
      setCell(`K${curRow}`, minor);
      setCell(`L${curRow}`, subject);
      setCell(`M${curRow}`, gradeLevel);
      setCell(`N${curRow}`, section);
      setCell(`O${curRow}`, hasMon);
      setCell(`P${curRow}`, hasTue);
      setCell(`Q${curRow}`, hasWed);
      setCell(`R${curRow}`, hasThu);
      setCell(`S${curRow}`, hasFri);
      setCell(`V${curRow}`, startFrac);
      setCell(`W${curRow}`, endFrac);
      setCell(`X${curRow}`, dailyMins);
      setCell(`Y${curRow}`, weeklyMins);

      // --- Printable Summary Block (Z to AU) ---
      setCell(`Z${curRow}`, idVal);
      setCell(`AA${curRow}`, fullName);
      setCell(`AB${curRow}`, sex);
      setCell(`AC${curRow}`, fund);
      setCell(`AD${curRow}`, pos);
      setCell(`AE${curRow}`, appt);
      setCell(`AF${curRow}`, degree);
      setCell(`AG${curRow}`, major);
      setCell(`AH${curRow}`, minor);
      setCell(`AI${curRow}`, subject);
      setCell(`AJ${curRow}`, glAbbr);
      setCell(`AK${curRow}`, section);
      setCell(`AL${curRow}`, hasMon ? 'M' : '');
      setCell(`AM${curRow}`, hasTue ? 'T' : '');
      setCell(`AN${curRow}`, hasWed ? 'W' : '');
      setCell(`AO${curRow}`, hasThu ? 'TH' : '');
      setCell(`AP${curRow}`, hasFri ? 'F' : '');
      setCell(`AS${curRow}`, startFrac);
      setCell(`AT${curRow}`, endFrac);
      setCell(`AU${curRow}`, dailyMins);

      curRow++;
    });

    // Add Totals row for this personnel if they have workloads
    if (workloads.length > 0) {
      setCell(`W${curRow - 1}`, 'Total');
      setCell(`X${curRow - 1}`, personTotalMins);
    }
  });

  // Prune empty rows past active dataset
  const maxRow = Math.max(50, curRow + 5);
  ws['!ref'] = `A1:AW${maxRow}`;
  Object.keys(ws).forEach((k) => {
    if (!k.startsWith('!')) {
      const r = parseInt(k.match(/\d+/)[0], 10);
      if (r > maxRow) delete ws[k];
    }
  });

  const fileBuffer = xlsx.write(wb, { bookType: 'xlsb', type: 'buffer' });
  parentPort.postMessage({ ok: true, buffer: fileBuffer }, [fileBuffer.buffer]);

} catch (err) {
  parentPort.postMessage({ ok: false, error: err.message });
}
