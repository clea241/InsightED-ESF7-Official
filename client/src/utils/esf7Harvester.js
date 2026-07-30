import * as xlsx from 'xlsx';

/**
 * Parses an eSF7 binary Excel file (.xlsb / .xlsx) and extracts personnel & workload details.
 * @param {ArrayBuffer} fileBuffer - The binary file buffer read from FileReader
 * @returns {Object} Extracted data containing schoolInfo, personnelList, and statistics
 */
export const parseESF7File = (fileBuffer) => {
  try {
    // Read 'VIEW' and hidden 'DB_USER' / 'USER_DB' sheets where raw DepEd data lives
    const wb = xlsx.read(fileBuffer, {
      type: 'array',
      sheets: ['VIEW', 'DB_USER', 'USER_DB'],
      cellStyles: false,
      cellNF: false,
      cellDates: false,
      sheetStubs: false
    });

    // Scan DB_USER / USER_DB sheet if available for extra personnel details
    const userDbMap = {};
    const dbUserSheetName = wb.SheetNames.find(s => s === 'DB_USER' || s === 'USER_DB');
    if (dbUserSheetName) {
      const userDbSheet = wb.Sheets[dbUserSheetName];
      if (userDbSheet && userDbSheet['!ref']) {
        const uRange = xlsx.utils.decode_range(userDbSheet['!ref']);
        const getUVal = (r, c) => {
          const cell = userDbSheet[xlsx.utils.encode_cell({ r, c })];
          return cell && cell.v !== undefined ? String(cell.v).trim() : '';
        };

        for (let r = 1; r <= uRange.e.r; r++) {
          const uTin = getUVal(r, 0) || getUVal(r, 1);
          const uFn = getUVal(r, 2) || getUVal(r, 1);
          const uMn = getUVal(r, 3);
          const uLn = getUVal(r, 4);
          const uSex = getUVal(r, 5);
          const uPos = getUVal(r, 6);
          const uEmail = getUVal(r, 7) || getUVal(r, 8);
          const uEmpNo = getUVal(r, 9);
          const uCivil = getUVal(r, 10);
          const uBirth = getUVal(r, 11);

          const keyByTin = uTin ? uTin.replace(/[^0-9]/g, '') : '';
          const keyByName = `${uFn.toLowerCase().trim()}_${uLn.toLowerCase().trim()}`;

          const entry = {
            tin: uTin,
            firstName: uFn,
            middleName: uMn,
            lastName: uLn,
            sex: uSex ? (uSex.toUpperCase().startsWith('M') ? 'Male' : 'Female') : '',
            position: uPos,
            depedEmail: uEmail,
            employeeNo: uEmpNo,
            civilStatus: uCivil,
            birthdate: uBirth
          };

          if (keyByTin) userDbMap[keyByTin] = entry;
          if (keyByName) userDbMap[keyByName] = entry;
        }
      }
    }

    const sheetName = wb.SheetNames.includes('VIEW') ? 'VIEW' : wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) {
      throw new Error("Invalid eSF7 file format: Required sheet 'VIEW' or 'USER_DB' is empty or missing.");
    }

    const range = xlsx.utils.decode_range(ws['!ref']);

    const getVal = (r, c) => {
      const cell = ws[xlsx.utils.encode_cell({ r, c })];
      return cell && cell.v !== undefined ? String(cell.v).trim() : '';
    };

    // Header extraction
    const extractedSchoolId = getVal(4, 29) || getVal(4, 28); // AD5 or AC5
    const extractedSchoolName = getVal(6, 29) || getVal(6, 28); // AD7 or AC7

    let personnelList = [];
    let currentPerson = null;

    // Convert Excel time fraction (e.g. 0.326388) to HH:MM (24-hr)
    const formatTimeStr = (fracStr) => {
      if (!fracStr) return '';
      const frac = parseFloat(fracStr);
      if (isNaN(frac)) return '';
      const totalMins = Math.round(frac * 1440);
      const hrs = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    };

    for (let r = 30; r <= range.e.r; r++) {
      const tin = getVal(r, 0);
      const firstName = getVal(r, 1);
      const middleName = getVal(r, 2);
      const lastName = getVal(r, 3);
      const sex = getVal(r, 4);
      const fundSource = getVal(r, 5);
      const position = getVal(r, 6);
      const appointmentStatus = getVal(r, 7);
      const degree = getVal(r, 8);
      const major = getVal(r, 9);
      const minor = getVal(r, 10);

      const subj = getVal(r, 11);
      const gradeLevel = getVal(r, 12);
      const sectionName = getVal(r, 13);
      const m = getVal(r, 14) === 'true';
      const t = getVal(r, 15) === 'true';
      const w = getVal(r, 16) === 'true';
      const th = getVal(r, 17) === 'true';
      const f = getVal(r, 18) === 'true';
      const startTimeFrac = getVal(r, 21);
      const endTimeFrac = getVal(r, 22);
      const minsPerDay = getVal(r, 24);

      // New personnel row detected
      if (tin) {
        if (currentPerson) {
          personnelList.push(currentPerson);
        }

        // Determine general type
        const posUpper = position.toUpperCase();
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
          fundSource: fundSource || 'NATIONAL',
          position: position || dbMeta.position || 'TEACHER I',
          appointmentStatus: appointmentStatus || 'REGULAR PERMANENT',
          degree: degree || 'BACHELOR',
          major: major || 'GENERAL EDUCATION',
          minor: minor || 'N/A',
          type: pType,
          depedEmail: dbMeta.depedEmail || '',
          employeeNo: dbMeta.employeeNo || '',
          civilStatus: dbMeta.civilStatus || '',
          birthdate: dbMeta.birthdate || '',
          workloads: []
        };
      }

      // Workload assignment row detected
      if (currentPerson && (subj || sectionName || startTimeFrac)) {
        const startTime = formatTimeStr(startTimeFrac);
        const endTime = formatTimeStr(endTimeFrac);

        const daysArr = [];
        if (m) daysArr.push('M');
        if (t) daysArr.push('T');
        if (w) daysArr.push('W');
        if (th) daysArr.push('TH');
        if (f) daysArr.push('F');

        const subjUpper = (subj || '').toUpperCase();
        let rowType = 'teaching';
        if (subjUpper.includes('ADMINISTRATIVE')) {
          rowType = 'administrative';
        } else if (subjUpper.includes('RELATED') || subjUpper.includes('COACHING') || subjUpper.includes('MENTORING')) {
          rowType = 'teaching-related';
        }

        currentPerson.workloads.push({
          rowType,
          subject: subj,
          task: sectionName,
          gradeLevel: gradeLevel || 'MONO-GRADE',
          sectionName: sectionName || '',
          days: daysArr.length > 0 ? daysArr : ['M', 'T', 'W', 'TH', 'F'],
          startTime: startTime || '08:00',
          endTime: endTime || '09:00',
          minsPerDay: parseInt(minsPerDay, 10) || 0
        });
      }
    }

    if (currentPerson) {
      personnelList.push(currentPerson);
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
      error: err.message || 'Failed to parse eSF7 .xlsb file.'
    };
  }
};
