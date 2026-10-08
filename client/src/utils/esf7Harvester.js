import * as xlsx from 'xlsx';

/**
 * Converts Excel time fraction (e.g. 0.326388) to HH:MM (24-hr format).
 * @param {string|number} fracStr 
 * @returns {string} HH:MM
 */
export const formatTimeStr = (fracStr) => {
  if (!fracStr) return '';
  const frac = parseFloat(fracStr);
  if (isNaN(frac)) return '';
  const totalMins = Math.round(frac * 1440);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

/**
 * Converts month string or number (e.g. 'FEBRUARY', 'FEB', '2') to two-digit month string '02'.
 * @param {string|number} monthStr 
 * @returns {string}
 */
export const monthNameToNum = (monthStr) => {
  if (!monthStr) return '';
  const m = String(monthStr).trim().toUpperCase();
  const months = {
    'JAN': '01', 'JANUARY': '01', '1': '01', '01': '01',
    'FEB': '02', 'FEBRUARY': '02', '2': '02', '02': '02',
    'MAR': '03', 'MARCH': '03', '3': '03', '03': '03',
    'APR': '04', 'APRIL': '04', '4': '04', '04': '04',
    'MAY': '05', '5': '05', '05': '05',
    'JUN': '06', 'JUNE': '06', '6': '06', '06': '06',
    'JUL': '07', 'JULY': '07', '7': '07', '07': '07',
    'AUG': '08', 'AUGUST': '08', '8': '08', '08': '08',
    'SEP': '09', 'SEPT': '09', 'SEPTEMBER': '09', '9': '09', '09': '09',
    'OCT': '10', 'OCTOBER': '10', '10': '10',
    'NOV': '11', 'NOVEMBER': '11', '11': '11',
    'DEC': '12', 'DECEMBER': '12', '12': '12'
  };
  return months[m] || (m.length === 1 ? `0${m}` : m);
};

/**
 * Formats DepEd split year, month, day into ISO YYYY-MM-DD format.
 */
export const formatDate = (year, month, day) => {
  if (!year || !month || !day) return '';
  const m = monthNameToNum(month);
  const d = String(day).trim().padStart(2, '0');
  const y = String(year).trim();
  if (y && m && d) {
    return `${y}-${m}-${d}`;
  }
  return '';
};

/**
 * Parses an eSF7 binary Excel file (.xlsb / .xlsx) and extracts personnel & workload details.
 * Supports both standard 'VIEW' sheet layouts and direct 'DB_USER' / 'USER_DB' database sheet extraction.
 * @param {ArrayBuffer} fileBuffer - The binary file buffer read from FileReader
 * @returns {Object} Extracted data containing schoolInfo, personnelList, and statistics
 */
export const parseESF7File = (fileBuffer) => {
  try {
    const wb = xlsx.read(fileBuffer, {
      type: 'array',
      sheets: ['VIEW', 'DB_USER', 'USER_DB', 'USERFORM'],
      cellStyles: false,
      cellNF: false,
      cellDates: false,
      sheetStubs: false
    });

    const getSheetVal = (ws, r, c) => {
      if (!ws) return '';
      const cell = ws[xlsx.utils.encode_cell({ r, c })];
      return cell && cell.v !== undefined ? String(cell.v).trim() : '';
    };

    let extractedSchoolId = '';
    let extractedSchoolName = '';
    let personnelList = [];

    // Scan DB_USER / USER_DB sheet for personnel lookup & metadata enrichment
    const userDbMap = {};
    const dbUserSheetName = wb.SheetNames.find(s => s === 'DB_USER' || s === 'USER_DB');
    const userDbWs = dbUserSheetName ? wb.Sheets[dbUserSheetName] : null;

    if (userDbWs && userDbWs['!ref']) {
      const uRange = xlsx.utils.decode_range(userDbWs['!ref']);

      for (let r = 1; r <= uRange.e.r; r++) {
        const schId = getSheetVal(userDbWs, r, 1);
        const uTin = getSheetVal(userDbWs, r, 7) || getSheetVal(userDbWs, r, 0);
        const uFn = getSheetVal(userDbWs, r, 8) || getSheetVal(userDbWs, r, 2);
        const uMn = getSheetVal(userDbWs, r, 9) || getSheetVal(userDbWs, r, 3);
        const uLn = getSheetVal(userDbWs, r, 10) || getSheetVal(userDbWs, r, 4);
        const uSex = getSheetVal(userDbWs, r, 11) || getSheetVal(userDbWs, r, 5);
        const uFund = getSheetVal(userDbWs, r, 12);
        const uPos = getSheetVal(userDbWs, r, 13) || getSheetVal(userDbWs, r, 6);
        const uAppt = getSheetVal(userDbWs, r, 14);
        const uDeg = getSheetVal(userDbWs, r, 15);
        const uMaj = getSheetVal(userDbWs, r, 16);
        const uMin = getSheetVal(userDbWs, r, 17);
        const uPostGrad = getSheetVal(userDbWs, r, 18);
        const rawEmpNo = String(getSheetVal(userDbWs, r, 19) || '').trim();
        const uEmpNo = rawEmpNo.toUpperCase().startsWith('PRN') ? '' : rawEmpNo;
        const uHiring = getSheetVal(userDbWs, r, 20);
        const uRel = getSheetVal(userDbWs, r, 21);

        const bMonth = getSheetVal(userDbWs, r, 387);
        const bDay = getSheetVal(userDbWs, r, 388);
        const bYear = getSheetVal(userDbWs, r, 389);
        const birthdate = formatDate(bYear, bMonth, bDay);

        const sMonth = getSheetVal(userDbWs, r, 397);
        const sDay = getSheetVal(userDbWs, r, 398);
        const sYear = getSheetVal(userDbWs, r, 399);
        const stationDate = formatDate(sYear, sMonth, sDay);

        const uCivil = getSheetVal(userDbWs, r, 400);
        const uElig = getSheetVal(userDbWs, r, 396);
        const uPhilsys = getSheetVal(userDbWs, r, 395);
        const uDepStatus = getSheetVal(userDbWs, r, 323) || 'OWN STATION';

        if (!extractedSchoolId && schId) extractedSchoolId = schId;

        // Parse up to 20 workload blocks (each block is 15 columns wide starting at col 22)
        const workloads = [];
        for (let block = 0; block < 20; block++) {
          const baseCol = 22 + (block * 15);
          if (baseCol + 13 > uRange.e.c) break;

          const dept = getSheetVal(userDbWs, r, baseCol);
          const subj = getSheetVal(userDbWs, r, baseCol + 1);
          const lvl = getSheetVal(userDbWs, r, baseCol + 2);
          const sec = getSheetVal(userDbWs, r, baseCol + 3);
          const d1 = getSheetVal(userDbWs, r, baseCol + 4).toLowerCase() === 'true';
          const d2 = getSheetVal(userDbWs, r, baseCol + 5).toLowerCase() === 'true';
          const d3 = getSheetVal(userDbWs, r, baseCol + 6).toLowerCase() === 'true';
          const d4 = getSheetVal(userDbWs, r, baseCol + 7).toLowerCase() === 'true';
          const d5 = getSheetVal(userDbWs, r, baseCol + 8).toLowerCase() === 'true';
          const d6 = getSheetVal(userDbWs, r, baseCol + 9).toLowerCase() === 'true';
          const d7 = getSheetVal(userDbWs, r, baseCol + 10).toLowerCase() === 'true';
          const fromFrac = getSheetVal(userDbWs, r, baseCol + 11);
          const toFrac = getSheetVal(userDbWs, r, baseCol + 12);
          const mins = getSheetVal(userDbWs, r, baseCol + 13);
          const cat = getSheetVal(userDbWs, r, baseCol + 14);

          if (!subj && !sec && !fromFrac && !toFrac) continue;

          const daysArr = [];
          if (d1) daysArr.push('M');
          if (d2) daysArr.push('T');
          if (d3) daysArr.push('W');
          if (d4) daysArr.push('TH');
          if (d5) daysArr.push('F');
          if (d6) daysArr.push('S');
          if (d7) daysArr.push('SU');

          const startTime = formatTimeStr(fromFrac);
          const endTime = formatTimeStr(toFrac);

          const subjUpper = (subj || '').toUpperCase();
          let rowType = 'teaching';
          if (subjUpper.includes('ADMINISTRATIVE') || subjUpper.includes('ADMIN')) {
            rowType = 'administrative';
          } else if (subjUpper.includes('RELATED') || subjUpper.includes('COACHING') || subjUpper.includes('MENTORING')) {
            rowType = 'teaching-related';
          }

          workloads.push({
            rowType,
            subject: subj || (rowType === 'administrative' ? 'Administrative Duty' : 'Teaching Subject'),
            task: sec || subj,
            gradeLevel: lvl ? (String(lvl).startsWith('Grade') ? String(lvl) : `Grade ${lvl}`) : 'Grade 7',
            sectionName: sec || '',
            days: daysArr.length > 0 ? daysArr : ['M', 'T', 'W', 'TH', 'F'],
            startTime: startTime || (rowType === 'administrative' ? '08:00' : ''),
            endTime: endTime || (rowType === 'administrative' ? '17:00' : ''),
            minsPerDay: parseInt(mins, 10) || 0,
            category: cat || dept || ''
          });
        }

        const posUpper = (uPos || '').toUpperCase();
        let pType = 'teaching';
        if (posUpper.includes('PRINCIPAL') || posUpper.includes('TIC') || posUpper.includes('HEAD TEACHER') || posUpper.includes('SUPERVISOR')) {
          pType = 'teaching-related';
        } else if (posUpper.includes('ADMINISTRATIVE') || posUpper.includes('ACCOUNTANT') || posUpper.includes('CLERK') || posUpper.includes('DISBURSING') || posUpper.includes('DRIVER')) {
          pType = 'non-teaching';
        }

        const keyByTin = uTin ? uTin.replace(/[^0-9]/g, '') : '';
        const keyByName = `${uFn.toLowerCase().trim()}_${uLn.toLowerCase().trim()}`;

        const entry = {
          tin: uTin,
          firstName: uFn,
          middleName: uMn,
          lastName: uLn,
          sex: uSex ? (uSex.toUpperCase().startsWith('M') ? 'Male' : 'Female') : '',
          fundSource: uFund || 'NATIONAL',
          position: uPos,
          appointmentStatus: uAppt,
          degree: uDeg,
          major: uMaj,
          minor: uMin,
          postGraduateDegree: uPostGrad,
          employeeNo: uEmpNo,
          hiringArrangement: uHiring,
          religion: uRel,
          civilStatus: uCivil,
          birthdate,
          newStationDate: stationDate,
          eligibility: uElig ? [uElig] : [],
          philsysNo: uPhilsys,
          deploymentStatus: uDepStatus,
          type: pType,
          workloads
        };

        if (keyByTin) userDbMap[keyByTin] = entry;
        if (keyByName) userDbMap[keyByName] = entry;
      }
    }

    // 1. If DB_USER exists and has personnel with rich workloads, use it directly as authoritative source!
    const dbUserKeys = Object.keys(userDbMap);
    if (userDbWs && dbUserKeys.length > 0) {
      const seenTins = new Set();
      for (const key of dbUserKeys) {
        const p = userDbMap[key];
        const uniqueKey = p.tin || (p.firstName + '_' + p.lastName);
        if (seenTins.has(uniqueKey)) continue;
        seenTins.add(uniqueKey);
        personnelList.push(p);
      }
    }

    // 2. Fallback: Parse 'VIEW' sheet if DB_USER was not present
    const viewWs = wb.Sheets['VIEW'];
    if (personnelList.length === 0 && viewWs && viewWs['!ref']) {
      if (!extractedSchoolId) extractedSchoolId = getSheetVal(viewWs, 4, 29) || getSheetVal(viewWs, 4, 28);
      if (!extractedSchoolName) extractedSchoolName = getSheetVal(viewWs, 6, 29) || getSheetVal(viewWs, 6, 28);

      const vRange = xlsx.utils.decode_range(viewWs['!ref']);
      let currentPerson = null;

      for (let r = 30; r <= vRange.e.r; r++) {
        const tin = getSheetVal(viewWs, r, 0);
        const firstName = getSheetVal(viewWs, r, 1);
        const middleName = getSheetVal(viewWs, r, 2);
        const lastName = getSheetVal(viewWs, r, 3);
        const sex = getSheetVal(viewWs, r, 4);
        const fundSource = getSheetVal(viewWs, r, 5);
        const position = getSheetVal(viewWs, r, 6);
        const appointmentStatus = getSheetVal(viewWs, r, 7);
        const degree = getSheetVal(viewWs, r, 8);
        const major = getSheetVal(viewWs, r, 9);
        const minor = getSheetVal(viewWs, r, 10);

        const subj = getSheetVal(viewWs, r, 11);
        const gradeLevel = getSheetVal(viewWs, r, 12);
        const sectionName = getSheetVal(viewWs, r, 13);
        const m = getSheetVal(viewWs, r, 14) === 'true';
        const t = getSheetVal(viewWs, r, 15) === 'true';
        const w = getSheetVal(viewWs, r, 16) === 'true';
        const th = getSheetVal(viewWs, r, 17) === 'true';
        const f = getSheetVal(viewWs, r, 18) === 'true';
        const startTimeFrac = getSheetVal(viewWs, r, 21);
        const endTimeFrac = getSheetVal(viewWs, r, 22);
        const minsPerDay = getSheetVal(viewWs, r, 24);

        if (tin) {
          if (currentPerson) {
            personnelList.push(currentPerson);
          }

          const posUpper = (position || '').toUpperCase();
          let pType = 'teaching';
          if (posUpper.includes('PRINCIPAL') || posUpper.includes('TIC') || posUpper.includes('HEAD TEACHER') || posUpper.includes('SUPERVISOR')) {
            pType = 'teaching-related';
          } else if (posUpper.includes('ADMINISTRATIVE') || posUpper.includes('ACCOUNTANT') || posUpper.includes('CLERK') || posUpper.includes('DISBURSING') || posUpper.includes('DRIVER')) {
            pType = 'non-teaching';
          }

          const keyByTin = tin ? tin.replace(/[^0-9]/g, '') : '';
          const keyByName = `${(firstName || '').toLowerCase().trim()}_${(lastName || '').toLowerCase().trim()}`;
          const dbMeta = userDbMap[keyByTin] || userDbMap[keyByName] || {};

          currentPerson = {
            tin: tin || dbMeta.tin || '',
            firstName: firstName || dbMeta.firstName || 'Personnel',
            middleName: middleName || dbMeta.middleName || '',
            lastName: lastName || dbMeta.lastName || 'Teacher',
            sex: sex ? (sex.toUpperCase().startsWith('M') ? 'Male' : 'Female') : (dbMeta.sex || 'Male'),
            fundSource: fundSource || dbMeta.fundSource || 'NATIONAL',
            position: position || dbMeta.position || 'TEACHER I',
            appointmentStatus: appointmentStatus || dbMeta.appointmentStatus || 'REGULAR PERMANENT',
            degree: degree || dbMeta.degree || 'BACHELOR',
            major: major || dbMeta.major || 'GENERAL EDUCATION',
            minor: minor || dbMeta.minor || 'N/A',
            postGraduateDegree: dbMeta.postGraduateDegree || 'N/A',
            type: pType,
            employeeNo: dbMeta.employeeNo || '',
            civilStatus: dbMeta.civilStatus || 'Single',
            birthdate: dbMeta.birthdate || '',
            newStationDate: dbMeta.newStationDate || '',
            eligibility: dbMeta.eligibility || [],
            philsysNo: dbMeta.philsysNo || '',
            deploymentStatus: dbMeta.deploymentStatus || 'Stationed',
            workloads: []
          };
        }

        if (currentPerson && (subj || sectionName || startTimeFrac)) {
          const daysArr = [];
          if (m) daysArr.push('M');
          if (t) daysArr.push('T');
          if (w) daysArr.push('W');
          if (th) daysArr.push('TH');
          if (f) daysArr.push('F');

          const subjUpper = (subj || '').toUpperCase();
          let rowType = 'teaching';
          if (subjUpper.includes('ADMINISTRATIVE') || subjUpper.includes('ADMIN')) {
            rowType = 'administrative';
          } else if (subjUpper.includes('RELATED') || subjUpper.includes('COACHING') || subjUpper.includes('MENTORING')) {
            rowType = 'teaching-related';
          }

          currentPerson.workloads.push({
            rowType,
            subject: subj,
            task: sectionName || subj,
            gradeLevel: gradeLevel || 'MONO-GRADE',
            sectionName: sectionName || '',
            days: daysArr.length > 0 ? daysArr : ['M', 'T', 'W', 'TH', 'F'],
            startTime: formatTimeStr(startTimeFrac) || '08:00',
            endTime: formatTimeStr(endTimeFrac) || '09:00',
            minsPerDay: parseInt(minsPerDay, 10) || 0
          });
        }
      }

      if (currentPerson) {
        personnelList.push(currentPerson);
      }
    }

    // 2. If VIEW returned 0 personnel, extract directly from DB_USER / USER_DB sheet!
    if (personnelList.length === 0 && userDbWs && userDbWs['!ref']) {
      const uRange = xlsx.utils.decode_range(userDbWs['!ref']);

      for (let r = 1; r <= uRange.e.r; r++) {
        const schId = getSheetVal(userDbWs, r, 1);
        const tin = getSheetVal(userDbWs, r, 7);
        const fn = getSheetVal(userDbWs, r, 8);
        const mn = getSheetVal(userDbWs, r, 9);
        const ln = getSheetVal(userDbWs, r, 10);
        const gender = getSheetVal(userDbWs, r, 11);
        const fundSource = getSheetVal(userDbWs, r, 12);
        const position = getSheetVal(userDbWs, r, 13);
        const appointment = getSheetVal(userDbWs, r, 14);
        const degree = getSheetVal(userDbWs, r, 15);
        const major = getSheetVal(userDbWs, r, 16);
        const minor = getSheetVal(userDbWs, r, 17);
        const postGrad = getSheetVal(userDbWs, r, 18);
        const rawEmpNo = getSheetVal(userDbWs, r, 19);
        const empNo = rawEmpNo.toUpperCase().startsWith('PRN') ? '' : rawEmpNo;
        const hiringArrangement = getSheetVal(userDbWs, r, 20);
        const religion = getSheetVal(userDbWs, r, 21);

        if (!tin && !fn && !ln) continue;

        if (!extractedSchoolId && schId) extractedSchoolId = schId;

        const posUpper = (position || '').toUpperCase();
        let pType = 'teaching';
        if (posUpper.includes('PRINCIPAL') || posUpper.includes('TIC') || posUpper.includes('HEAD TEACHER') || posUpper.includes('SUPERVISOR')) {
          pType = 'teaching-related';
        } else if (posUpper.includes('ADMINISTRATIVE') || posUpper.includes('ACCOUNTANT') || posUpper.includes('CLERK') || posUpper.includes('DISBURSING') || posUpper.includes('DRIVER')) {
          pType = 'non-teaching';
        }

        const bMonth = getSheetVal(userDbWs, r, 387);
        const bDay = getSheetVal(userDbWs, r, 388);
        const bYear = getSheetVal(userDbWs, r, 389);
        const birthdate = formatDate(bYear, bMonth, bDay);

        const sMonth = getSheetVal(userDbWs, r, 397);
        const sDay = getSheetVal(userDbWs, r, 398);
        const sYear = getSheetVal(userDbWs, r, 399);
        const stationDate = formatDate(sYear, sMonth, sDay);

        const civilStatus = getSheetVal(userDbWs, r, 400) || 'Single';
        const eligibility = getSheetVal(userDbWs, r, 396);
        const philsysNo = getSheetVal(userDbWs, r, 395);
        const depStatus = getSheetVal(userDbWs, r, 323) || 'Stationed';

        // Parse up to 20 workload blocks (each block is 15 columns wide starting at col 22)
        const workloads = [];
        for (let block = 0; block < 20; block++) {
          const baseCol = 22 + (block * 15);
          if (baseCol + 13 > uRange.e.c) break;

          const dept = getSheetVal(userDbWs, r, baseCol);
          const subj = getSheetVal(userDbWs, r, baseCol + 1);
          const lvl = getSheetVal(userDbWs, r, baseCol + 2);
          const sec = getSheetVal(userDbWs, r, baseCol + 3);
          const d1 = getSheetVal(userDbWs, r, baseCol + 4).toLowerCase() === 'true';
          const d2 = getSheetVal(userDbWs, r, baseCol + 5).toLowerCase() === 'true';
          const d3 = getSheetVal(userDbWs, r, baseCol + 6).toLowerCase() === 'true';
          const d4 = getSheetVal(userDbWs, r, baseCol + 7).toLowerCase() === 'true';
          const d5 = getSheetVal(userDbWs, r, baseCol + 8).toLowerCase() === 'true';
          const d6 = getSheetVal(userDbWs, r, baseCol + 9).toLowerCase() === 'true';
          const d7 = getSheetVal(userDbWs, r, baseCol + 10).toLowerCase() === 'true';
          const fromFrac = getSheetVal(userDbWs, r, baseCol + 11);
          const toFrac = getSheetVal(userDbWs, r, baseCol + 12);
          const mins = getSheetVal(userDbWs, r, baseCol + 13);
          const cat = getSheetVal(userDbWs, r, baseCol + 14);

          if (!subj && !sec && !fromFrac) continue;

          const daysArr = [];
          if (d1) daysArr.push('M');
          if (d2) daysArr.push('T');
          if (d3) daysArr.push('W');
          if (d4) daysArr.push('TH');
          if (d5) daysArr.push('F');
          if (d6) daysArr.push('S');
          if (d7) daysArr.push('SU');

          const startTime = formatTimeStr(fromFrac) || '08:00';
          const endTime = formatTimeStr(toFrac) || '09:00';

          const subjUpper = (subj || '').toUpperCase();
          let rowType = 'teaching';
          if (subjUpper.includes('ADMINISTRATIVE') || subjUpper.includes('ADMIN')) {
            rowType = 'administrative';
          } else if (subjUpper.includes('RELATED') || subjUpper.includes('COACHING') || subjUpper.includes('MENTORING')) {
            rowType = 'teaching-related';
          }

          workloads.push({
            rowType,
            subject: subj || (rowType === 'administrative' ? 'Administrative Duty' : 'Teaching Subject'),
            task: sec || subj,
            gradeLevel: lvl ? (String(lvl).startsWith('Grade') ? String(lvl) : `Grade ${lvl}`) : 'Grade 7',
            sectionName: sec || '',
            days: daysArr.length > 0 ? daysArr : ['M', 'T', 'W', 'TH', 'F'],
            startTime,
            endTime,
            minsPerDay: parseInt(mins, 10) || 0,
            category: cat || dept || ''
          });
        }

        personnelList.push({
          tin: tin || '',
          firstName: fn || 'Personnel',
          middleName: mn || '',
          lastName: ln || 'Teacher',
          sex: gender ? (gender.toUpperCase().startsWith('M') ? 'Male' : 'Female') : 'Female',
          fundSource: fundSource || 'NATIONAL',
          position: position || 'TEACHER I',
          appointmentStatus: appointment || 'REGULAR PERMANENT',
          degree: degree || 'BACHELOR',
          major: major || 'GENERAL EDUCATION',
          minor: minor || 'N/A',
          postGraduateDegree: postGrad || 'N/A',
          employeeNo: empNo || '',
          hiringArrangement: hiringArrangement || 'Regular',
          religion: religion || '',
          civilStatus: civilStatus || 'Single',
          birthdate,
          newStationDate: stationDate,
          eligibility: eligibility ? [eligibility] : [],
          philsysNo: philsysNo || '',
          deploymentStatus: depStatus,
          type: pType,
          workloads
        });
      }
    }

    // 3. Fallback School Header from USERFORM if missing in VIEW
    const userformWs = wb.Sheets['USERFORM'];
    if (userformWs && (!extractedSchoolName || !extractedSchoolId)) {
      if (!extractedSchoolId) extractedSchoolId = getSheetVal(userformWs, 2, 2);
      if (!extractedSchoolName) extractedSchoolName = getSheetVal(userformWs, 3, 2);
    }

    const totalWorkloads = personnelList.reduce((acc, p) => acc + p.workloads.length, 0);

    return {
      success: true,
      schoolId: extractedSchoolId,
      schoolName: extractedSchoolName,
      personnelList,
      stats: {
        totalPersonnel: personnelList.length,
        totalWorkloads
      }
    };
  } catch (err) {
    console.error('eSF7 Harvester Error:', err);
    return {
      success: false,
      error: err.message || 'Failed to parse eSF7 spreadsheet file.'
    };
  }
};

