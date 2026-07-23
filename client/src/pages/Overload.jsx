import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import SearchableDropdown from '../components/SearchableDropdown';

// Helper to convert "HH:MM" time to minutes
const timeToMins = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

// Day mapping helper from short code to full name
const DAY_MAP = {
  'M': 'Monday',
  'T': 'Tuesday',
  'W': 'Wednesday',
  'TH': 'Thursday',
  'F': 'Friday'
};

const MONTHS_LIST = [
  { name: 'June', quarter: 'Term 1', index: 5 },
  { name: 'July', quarter: 'Term 1', index: 6 },
  { name: 'August', quarter: 'Term 1', index: 7 },
  { name: 'September', quarter: 'Term 1', index: 8 },
  { name: 'October', quarter: 'Term 2', index: 9 },
  { name: 'November', quarter: 'Term 2', index: 10 },
  { name: 'December', quarter: 'Term 2', index: 11 },
  { name: 'January', quarter: 'Term 3', index: 0 },
  { name: 'February', quarter: 'Term 3', index: 1 },
  { name: 'March', quarter: 'Term 3', index: 2 },
  { name: 'April', quarter: 'Term 3', index: 3 },
  { name: 'May', quarter: 'Term 3', index: 4 }
];

export default function Overload() {
  const {
    personnel,
    workloadTransfers,
    addWorkloadTransfer,
    removeWorkloadTransfer,
    absences,
    addPersonnelAbsence,
    removePersonnelAbsence,
    schoolInfo,
    showConfirm,
    showAlert,
    salaryMatrix
  } = useApp();

  const calculatePHTR = (teacher) => {
    const pos = (teacher.position || 'TEACHER I').toUpperCase();
    const step = Number(teacher.stepIncrement || 1);
    const match = salaryMatrix.find(r => 
      r.positionTitle.toUpperCase() === pos && 
      Number(r.stepNumber) === step
    );
    if (match) {
      return 0.000781 * 12 * Number(match.basicSalary);
    }
    const fallbackSalaries = {
      'TEACHER I': [31705, 31820, 32109, 32401, 32697, 32998, 33302, 33611],
      'TEACHER II': [33947, 34069, 34357, 34648, 34943, 35242, 35544, 35850],
      'TEACHER III': [36125, 36283, 36599, 36919, 37244, 37572, 37904, 38241],
      'TEACHER IV': [38764, 39141, 39523, 39910, 40300, 40696, 41097, 41503],
      'TEACHER V': [42178, 42594, 43015, 43442, 43874, 44310, 44753, 45202],
      'TEACHER VI': [45694, 46152, 46615, 47084, 47559, 48040, 48528, 49020],
      'TEACHER VII': [49562, 50066, 50576, 51092, 51614, 52144, 52678, 53221],
      'MASTER TEACHER I': [53818, 54371, 54933, 55499, 56075, 56657, 57246, 57842],
      'MASTER TEACHER II': [59153, 59966, 60793, 61632, 62486, 63353, 64236, 65132],
      'MASTER TEACHER III': [66052, 66970, 67904, 68853, 69818, 70772, 71727, 72671],
      'MASTER TEACHER IV': [73303, 74337, 75388, 76456, 77542, 78645, 79692, 80831],
      'MASTER TEACHER V': [81796, 82963, 84151, 85356, 86582, 87746, 89011, 90295]
    };
    const steps = fallbackSalaries[pos] || fallbackSalaries['TEACHER I'];
    const salary = steps[step - 1] || steps[0];
    return 0.000781 * 12 * salary;
  };

  const [activeTab, setActiveTab] = useState('roster'); // 'roster' | 'absences' | 'transfers'
  
  // Roster Tab filters
  const [selectedMonth, setSelectedMonth] = useState('June');
  const [selectedQuarter, setSelectedQuarter] = useState('Term 1');
  const [teacherSearch, setTeacherSearch] = useState('');

  // Absences Log form state
  const [absentTeacherId, setAbsentTeacherId] = useState('');
  const [absenceStartDate, setAbsenceStartDate] = useState('');
  const [absenceEndDate, setAbsenceEndDate] = useState('');
  const [leaveType, setLeaveType] = useState('Sick Leave');

  // Workload Transfer form state
  const [transferAbsentTeacherId, setTransferAbsentTeacherId] = useState('');
  const [transferStartDate, setTransferStartDate] = useState('');
  const [transferEndDate, setTransferEndDate] = useState('');
  const [selectedTransferSlots, setSelectedTransferSlots] = useState({}); // { rowIdx: substituteTeacherId }

  // Filter out draft personnel for all selectors
  const activePersonnel = personnel.filter(p => !p.isDraft);

  // Helper to get weekdays in a month for calculations
  const getWeekdaysInMonth = (monthName, yearString = 'SY 26-27') => {
    const monthObj = MONTHS_LIST.find(m => m.name === monthName);
    const monthIndex = monthObj ? monthObj.index : 5;
    
    // Extract any numbers from string (e.g. "SY 26-27" -> [26, 27], "2026-2027" -> [2026, 2027])
    const matches = (yearString || '').match(/\d+/g);
    let year = 2026;
    if (matches && matches.length > 0) {
      year = parseInt(matches[0]);
      if (year < 100) year += 2000;
    }
    
    // Adjust year based on school year (June-Dec in first year, Jan-May in second year)
    if (monthIndex < 5) {
      if (matches && matches.length > 1) {
        let secondYear = parseInt(matches[1]);
        if (secondYear < 100) secondYear += 2000;
        year = secondYear;
      } else {
        year += 1;
      }
    }
    
    const dates = [];
    const date = new Date(year, monthIndex, 1);
    while (date.getMonth() === monthIndex) {
      const day = date.getDay();
      // Monday = 1, Tuesday = 2, Wednesday = 3, Thursday = 4, Friday = 5
      if (day >= 1 && day <= 5) {
        dates.push(new Date(date));
      }
      date.setDate(date.getDate() + 1);
    }
    return dates;
  };

  // Helper to get weekdays in a quarter
  const getWeekdaysInQuarter = (quarterCode, yearString = 'SY 26-27') => {
    const months = MONTHS_LIST.filter(m => m.quarter === quarterCode);
    let allDates = [];
    months.forEach(m => {
      allDates = [...allDates, ...getWeekdaysInMonth(m.name, yearString)];
    });
    return allDates;
  };

  // Helper to format local Date safely to YYYY-MM-DD
  const getLocalDateString = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Main overload calculator logic
  const calculateOverloadForTeacher = (teacher, dates) => {
    let grossOverloadTotal = 0;
    let deductionTotal = 0;
    let netOverloadTotal = 0;
    
    // Helper to map weekday indexes to short codes
    const dayIndexMap = { 1: 'M', 2: 'T', 3: 'W', 4: 'TH', 5: 'F' };
    
    dates.forEach(date => {
      const dateStr = getLocalDateString(date);
      const dayShort = dayIndexMap[date.getDay()];
      
      // Calculate teaching load for this teacher on this day
      let dailyTeachingMinutes = 0;
      
      // 1. Process base workload rows
      const currentYearWorkloads = (teacher.workloadRows || []).filter(row => !row.schoolYear || row.schoolYear === syYear);
      currentYearWorkloads.forEach(row => {
        if (row.days && row.days.includes(dayShort)) {
          // Check if this slot was transferred to someone else on this date
          const isTransferred = workloadTransfers.some(t => 
            t.absentTeacherId === teacher.id && 
            t.status !== 'ended' &&
            t.startDate <= dateStr && 
            t.endDate >= dateStr &&
            (String(t.workloadRowId) === String(row.id) || (t.workloadRows && t.workloadRows.some(wr => wr.subject === row.subject && wr.startTime === row.startTime && wr.endTime === row.endTime)))
          );
          
          if (!isTransferred) {
            dailyTeachingMinutes += Math.max(0, timeToMins(row.endTime) - timeToMins(row.startTime));
          }
        }
      });
      
      // 2. Process workloads transferred TO this teacher on this date
      workloadTransfers.forEach(t => {
        if (t.substituteTeacherId === teacher.id && 
            t.status !== 'ended' &&
            t.startDate <= dateStr && 
            t.endDate >= dateStr) {
          (t.workloadRows || []).forEach(row => {
            if (row.days && row.days.includes(dayShort)) {
              dailyTeachingMinutes += Math.max(0, timeToMins(row.endTime) - timeToMins(row.startTime));
            }
          });
        }
      });
      
      // Daily hours
      const dailyHours = dailyTeachingMinutes / 60;
      
      // Gross daily overload
      const grossDailyOverload = Math.max(0, dailyHours - 6.0);
      
      // If teacher has a general absence logged on this date
      const isAbsent = absences.some(a => a.personnelId === teacher.id && a.absenceDate === dateStr);
      
      if (grossDailyOverload > 0) {
        grossOverloadTotal += grossDailyOverload;
        if (isAbsent) {
          deductionTotal += grossDailyOverload;
        } else {
          netOverloadTotal += grossDailyOverload;
        }
      }
    });

    return {
      gross: Math.round(grossOverloadTotal * 100) / 100,
      deductions: Math.round(deductionTotal * 100) / 100,
      net: Math.round(netOverloadTotal * 100) / 100
    };
  };

  // Compute stats for all active teachers
  const syYear = 'SY 26-27';
  const monthDates = getWeekdaysInMonth(selectedMonth, syYear);
  const quarterDates = getWeekdaysInQuarter(selectedQuarter, syYear);

  const overloadRoster = activePersonnel.map(teacher => {
    // Base weekly overload (no absences/transfers considered, pure schedule check)
    let weeklyOverload = 0;
    const dailyLoads = { M: 0, T: 0, W: 0, TH: 0, F: 0 };
    
    const currentYearWorkloads = (teacher.workloadRows || []).filter(row => !row.schoolYear || row.schoolYear === syYear);
    currentYearWorkloads.forEach(row => {
      if (row.days) {
        row.days.forEach(day => {
          if (dailyLoads[day] !== undefined) {
            dailyLoads[day] += Math.max(0, timeToMins(row.endTime) - timeToMins(row.startTime));
          }
        });
      }
    });
    
    const dailyOverloads = {};
    Object.entries(dailyLoads).forEach(([day, mins]) => {
      const hrs = mins / 60;
      dailyOverloads[day] = Math.max(0, hrs - 6.0);
      weeklyOverload += dailyOverloads[day];
    });

    const monthStats = calculateOverloadForTeacher(teacher, monthDates);
    const quarterStats = calculateOverloadForTeacher(teacher, quarterDates);

    return {
      teacher,
      dailyOverloads,
      weeklyOverload: Math.round(weeklyOverload * 100) / 100,
      monthStats,
      quarterStats
    };
  }).filter(item => 
    item.weeklyOverload > 0 || 
    item.monthStats.net > 0 || 
    item.quarterStats.net > 0
  );

  const filteredRoster = overloadRoster.filter(item => {
    const fullName = `${item.teacher.firstName} ${item.teacher.lastName}`.toLowerCase();
    return fullName.includes(teacherSearch.toLowerCase().trim());
  });

  const handleAddAbsenceSubmit = async (e) => {
    e.preventDefault();
    if (!absentTeacherId || !absenceStartDate || !absenceEndDate || !leaveType) {
      await showAlert("Missing Fields", "Please select a teacher, start date, end date, and type of leave.");
      return;
    }
    if (new Date(absenceEndDate) < new Date(absenceStartDate)) {
      await showAlert("Invalid Range", "End date cannot be before start date.");
      return;
    }
    const res = await addPersonnelAbsence({
      personnelId: absentTeacherId,
      startDate: absenceStartDate,
      endDate: absenceEndDate,
      leaveType
    });
    if (res.success) {
      setAbsentTeacherId('');
      setAbsenceStartDate('');
      setAbsenceEndDate('');
    }
  };

  const handleCreateTransfer = async (e) => {
    e.preventDefault();
    if (!transferAbsentTeacherId || !transferStartDate || !transferEndDate) {
      await showAlert("Missing Fields", "Please select the absent teacher, and the transfer start/end dates.");
      return;
    }

    const slotsToTransfer = [];
    const absentTeacher = activePersonnel.find(p => p.id === transferAbsentTeacherId);
    
    (absentTeacher?.workloadRows || []).forEach((row, idx) => {
      const subId = selectedTransferSlots[idx];
      if (subId) {
        slotsToTransfer.push({
          ...row,
          substituteTeacherId: subId
        });
      }
    });

    if (slotsToTransfer.length === 0) {
      await showAlert("No Slots Assigned", "Please select at least one class slot and assign a substitute teacher to it.");
      return;
    }

    // Group transfers by substitute
    const grouped = {};
    slotsToTransfer.forEach(slot => {
      if (!grouped[slot.substituteTeacherId]) {
        grouped[slot.substituteTeacherId] = [];
      }
      grouped[slot.substituteTeacherId].push(slot);
    });

    for (const [subId, rows] of Object.entries(grouped)) {
      await addWorkloadTransfer({
        absentTeacherId: transferAbsentTeacherId,
        substituteTeacherId: subId,
        startDate: transferStartDate,
        endDate: transferEndDate,
        workloadRows: rows,
        reason: 'Temporary Transfer'
      });
    }

    setTransferAbsentTeacherId('');
    setTransferStartDate('');
    setTransferEndDate('');
    setSelectedTransferSlots({});
    await showAlert("Transfer Completed", "Workloads transferred successfully! Overloads will now recalculate for the substitutes.");
  };

  const handleGeneratePDF = () => {
    const quarterMonths = MONTHS_LIST.filter(m => m.quarter === selectedQuarter);
    const monthNames = quarterMonths.map(m => m.name);

    // Generate simple print page window
    const printWindow = window.open('', '_blank');
    
    const tableRows = filteredRoster.map((item, index) => {
      const teacher = item.teacher;
      const monthlyWeeklyMinutes = []; 
      let totalMinutes = 0;
      
      quarterMonths.forEach(monthObj => {
        const monthDates = getWeekdaysInMonth(monthObj.name, syYear);
        let w1 = 0, w2 = 0, w3 = 0, w4 = 0;
        
        monthDates.forEach(date => {
          const stats = calculateOverloadForTeacher(teacher, [date]);
          const dailyOverloadMinutes = stats.net * 60; 
          
          const day = date.getDate();
          if (day >= 1 && day <= 7) w1 += dailyOverloadMinutes;
          else if (day >= 8 && day <= 14) w2 += dailyOverloadMinutes;
          else if (day >= 15 && day <= 21) w3 += dailyOverloadMinutes;
          else if (day >= 22) w4 += dailyOverloadMinutes;
        });
        
        w1 = Math.round(w1);
        w2 = Math.round(w2);
        w3 = Math.round(w3);
        w4 = Math.round(w4);
        
        totalMinutes += (w1 + w2 + w3 + w4);
        monthlyWeeklyMinutes.push([w1, w2, w3, w4]);
      });
      
      const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
      const phtr = calculatePHTR(teacher);
      const overloadPay = Math.round(totalHours * phtr * 100) / 100;
      const formattedPay = overloadPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      const wCols = monthlyWeeklyMinutes.map(weeks => 
        weeks.map(w => `<td style="padding: 6px; border: 1px solid #475569; text-align: center; font-size: 11px;">${w || '-'}</td>`).join('')
      ).join('');
      
      return `
        <tr>
          <td style="padding: 6px; border: 1px solid #475569; text-align: center;">${index + 1}</td>
          <td style="padding: 6px; border: 1px solid #475569; font-weight: bold;">${teacher.lastName}, ${teacher.firstName}</td>
          <td style="padding: 6px; border: 1px solid #475569;">${teacher.position}</td>
          ${wCols}
          <td style="padding: 6px; border: 1px solid #475569; text-align: center; font-weight: bold; background-color: #f8fafc;">${totalMinutes}</td>
          <td style="padding: 6px; border: 1px solid #475569; text-align: center; font-weight: bold; background-color: #f8fafc;">${totalHours}</td>
          <td style="padding: 6px; border: 1px solid #475569; text-align: right; font-weight: bold; background-color: #f8fafc; font-family: monospace;">₱${formattedPay}</td>
          <td style="padding: 6px; border: 1px solid #475569; text-align: center; font-size: 11px;">Teacher Shortage</td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Certification for Eligible Teachers with Teaching Overload Pay</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #0f172a; }
            .header { text-align: center; margin-bottom: 25px; }
            .header h2 { margin: 5px 0; font-size: 20px; text-decoration: underline; text-transform: uppercase; }
            .header h3 { margin: 5px 0; font-size: 24px; font-weight: 800; letter-spacing: 1px; }
            .signature-block { margin-top: 70px; display: flex; justify-content: space-between; }
            .sig { text-align: center; width: 280px; }
            .sig-line { border-top: 1.5px solid #000; margin-top: 50px; padding-top: 5px; font-weight: bold; }
          </style>
        </head>
        <body onload="window.print()">
          <div class="header">
            <h2>Certification for Eligible Teachers with Teaching Overload Pay</h2>
            <h3>CERTIFICATION</h3>
          </div>

          <div style="font-size: 12px; line-height: 1.6; margin-bottom: 20px;">
            This is to certify that the following teaching personnel of <strong>${schoolInfo?.schoolName || 'Capas Integrated School'}</strong> are eligible for the payment of teaching overload S.Y. <strong>${syYear}</strong>:
            <div style="margin-top: 5px; font-weight: bold;">Term: ${selectedQuarter} | FY: ${syYear.replace(/[^0-9]/g, '').substring(0, 4)}</div>
          </div>
          
          <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #475569; font-size: 11px; margin-top: 15px;">
            <thead>
              <tr style="background-color: #f1f5f9;">
                <th rowspan="3" style="border: 1px solid #475569; padding: 8px 4px; text-align: center;">No.</th>
                <th rowspan="3" style="border: 1px solid #475569; padding: 8px 4px; text-align: left; min-width: 140px;">Name of Teacher</th>
                <th rowspan="3" style="border: 1px solid #475569; padding: 8px 4px; text-align: left; min-width: 100px;">Position</th>
                <th colspan="12" style="border: 1px solid #475569; padding: 6px; text-align: center; font-weight: bold;">Teaching Overload (in minutes)</th>
                <th rowspan="3" style="border: 1px solid #475569; padding: 6px; text-align: center; font-weight: bold;">Total<br>(in minutes)</th>
                <th rowspan="3" style="border: 1px solid #475569; padding: 6px; text-align: center; font-weight: bold;">Total<br>(in hours)</th>
                <th rowspan="3" style="border: 1px solid #475569; padding: 6px; text-align: center; font-weight: bold; min-width: 90px;">Overload Pay<br>(in ₱)</th>
                <th rowspan="3" style="border: 1px solid #475569; padding: 6px; text-align: center; font-weight: bold; min-width: 110px;">Reasons for Teaching Overload</th>
              </tr>
              <tr style="background-color: #f1f5f9;">
                <th colspan="4" style="border: 1px solid #475569; padding: 4px; text-align: center; font-weight: bold;">${monthNames[0] || 'Month 1'}</th>
                <th colspan="4" style="border: 1px solid #475569; padding: 4px; text-align: center; font-weight: bold;">${monthNames[1] || 'Month 2'}</th>
                <th colspan="4" style="border: 1px solid #475569; padding: 4px; text-align: center; font-weight: bold;">${monthNames[2] || 'Month 3'}</th>
              </tr>
              <tr style="background-color: #f8fafc; font-size: 9px;">
                <th style="border: 1px solid #475569; padding: 3px; text-align: center;">W1</th>
                <th style="border: 1px solid #475569; padding: 3px; text-align: center;">W2</th>
                <th style="border: 1px solid #475569; padding: 3px; text-align: center;">W3</th>
                <th style="border: 1px solid #475569; padding: 3px; text-align: center;">W4</th>
                <th style="border: 1px solid #475569; padding: 3px; text-align: center;">W1</th>
                <th style="border: 1px solid #475569; padding: 3px; text-align: center;">W2</th>
                <th style="border: 1px solid #475569; padding: 3px; text-align: center;">W3</th>
                <th style="border: 1px solid #475569; padding: 3px; text-align: center;">W4</th>
                <th style="border: 1px solid #475569; padding: 3px; text-align: center;">W1</th>
                <th style="border: 1px solid #475569; padding: 3px; text-align: center;">W2</th>
                <th style="border: 1px solid #475569; padding: 3px; text-align: center;">W3</th>
                <th style="border: 1px solid #475569; padding: 3px; text-align: center;">W4</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows.length > 0 ? tableRows : '<tr><td colspan="19" style="text-align:center; padding:20px; border: 1px solid #475569; color: #64748b;">No eligible teachers found with teaching overload.</td></tr>'}
            </tbody>
          </table>

          <div style="font-size: 11px; margin-top: 25px; line-height: 1.6;">
            Attached are the following documents to support this certification:<br>
            1. DTR<br>
            2. eSF7
          </div>

          <div class="signature-block">
            <div class="sig" style="margin-left: auto;">
              <div class="sig-line">
                ${schoolInfo?.headFirstName || 'Bonifacio'} ${schoolInfo?.headLastName || 'Madero III'}<br>
                <span style="font-size:12px; font-weight:normal; color:#475569;">School Head</span>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <main style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 'bold', color: 'var(--navy)', margin: 0 }}>Teaching Overload Center</h1>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0 0', fontSize: '14px' }}>Automatically track, deduct, and transfer workloads to calculate official teacher overload.</p>
        </div>
      </header>

      {/* Tabs Menu */}
      <div className="tabs" style={{ display: 'flex', gap: '8px', borderBottom: '1.5px solid var(--line)', paddingBottom: '1px' }}>
        <button 
          className={`tab-btn ${activeTab === 'roster' ? 'active' : ''}`}
          onClick={() => setActiveTab('roster')}
          style={{ padding: '10px 16px', fontWeight: 'bold', border: 0, background: 'none', borderBottom: activeTab === 'roster' ? '3px solid var(--blue)' : 'none', cursor: 'pointer' }}
        >
          📈 Overload Roster
        </button>
        <button 
          className={`tab-btn ${activeTab === 'absences' ? 'active' : ''}`}
          onClick={() => setActiveTab('absences')}
          style={{ padding: '10px 16px', fontWeight: 'bold', border: 0, background: 'none', borderBottom: activeTab === 'absences' ? '3px solid var(--blue)' : 'none', cursor: 'pointer' }}
        >
          📅 Absences Log
        </button>
        <button 
          className={`tab-btn ${activeTab === 'transfers' ? 'active' : ''}`}
          onClick={() => setActiveTab('transfers')}
          style={{ padding: '10px 16px', fontWeight: 'bold', border: 0, background: 'none', borderBottom: activeTab === 'transfers' ? '3px solid var(--blue)' : 'none', cursor: 'pointer' }}
        >
          🔄 Workload Transfers
        </button>
      </div>

      {/* Roster Tab */}
      {activeTab === 'roster' && (
        <article className="card">
          <div className="card-inner" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>SELECT MONTH (For Monthly views)</label>
                  <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ padding: '8px', borderRadius: '8px', border: '1.5px solid var(--line)', background: 'white' }}>
                    {MONTHS_LIST.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>SELECT TERM</label>
                  <select value={selectedQuarter} onChange={(e) => setSelectedQuarter(e.target.value)} style={{ padding: '8px', borderRadius: '8px', border: '1.5px solid var(--line)', background: 'white' }}>
                    <option value="Term 1">Term 1 (June – Sept)</option>
                    <option value="Term 2">Term 2 (Sept – Dec)</option>
                    <option value="Term 3">Term 3 (Jan – April)</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
                <input 
                  type="text" 
                  placeholder="Search teacher..." 
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1.5px solid var(--line)', width: '220px' }}
                />
                <button className="btn" onClick={handleGeneratePDF} style={{ padding: '8px 16px', background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white', border: 0, borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                  🖨️ Generate Report (PDF)
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)', background: '#F8FAFC' }}>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Teacher Name</th>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Position</th>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Daily Overload Breakdown</th>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Weekly Total</th>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Net Monthly ({selectedMonth})</th>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Net Term ({selectedQuarter})</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', color: 'var(--navy)' }}>Overload Pay (₱)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoster.map((item, idx) => {
                    const daysBreakdown = Object.entries(item.dailyOverloads)
                      .filter(([_, hrs]) => hrs > 0)
                      .map(([day, hrs]) => `${DAY_MAP[day]}: +${hrs}h`)
                      .join(', ');

                    const phtr = calculatePHTR(item.teacher);
                    const overloadPay = Math.round(item.quarterStats.net * phtr * 100) / 100;
                    const formattedPay = overloadPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '12px 10px', fontWeight: 'bold', color: 'var(--navy)' }}>{item.teacher.lastName}, {item.teacher.firstName}</td>
                        <td style={{ padding: '12px 10px', color: 'var(--muted)' }}>{item.teacher.position}</td>
                        <td style={{ padding: '12px 10px', fontStyle: daysBreakdown ? 'normal' : 'italic', color: daysBreakdown ? 'var(--navy)' : 'var(--muted)' }}>
                          {daysBreakdown || 'None'}
                        </td>
                        <td style={{ padding: '12px 10px', fontWeight: 'bold' }}>{item.weeklyOverload} hrs</td>
                        <td style={{ padding: '12px 10px' }}>
                          <span style={{ fontWeight: 'bold', color: '#15803d' }}>{item.monthStats.net} hrs</span>
                          {item.monthStats.deductions > 0 && <span style={{ fontSize: '10px', color: '#b91c1c', marginLeft: '6px' }}>(-{item.monthStats.deductions} hrs leave)</span>}
                        </td>
                        <td style={{ padding: '12px 10px' }}>
                          <span style={{ fontWeight: 'bold', color: '#15803d' }}>{item.quarterStats.net} hrs</span>
                          {item.quarterStats.deductions > 0 && <span style={{ fontSize: '10px', color: '#b91c1c', marginLeft: '6px' }}>(-{item.quarterStats.deductions} hrs leave)</span>}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--navy)' }}>
                          ₱{formattedPay}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredRoster.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)' }}>No teachers with active overloads found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </article>
      )}

      {/* Absences Log Tab */}
      {activeTab === 'absences' && (
        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '20px' }}>
          {/* Add Absence Form */}
          <article className="card" style={{ height: 'fit-content' }}>
            <div className="card-inner" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)', margin: 0 }}>Log Teacher Absence / Leave</h2>
              <form onSubmit={handleAddAbsenceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>SELECT TEACHER</label>
                  <SearchableDropdown 
                    options={activePersonnel.map(p => `${p.firstName} ${p.lastName} · ${p.position}`)}
                    value={activePersonnel.find(p => p.id === absentTeacherId) ? (() => {
                      const p = activePersonnel.find(p => p.id === absentTeacherId);
                      return `${p.firstName} ${p.lastName} · ${p.position}`;
                    })() : ''}
                    onChange={(val) => {
                      const p = activePersonnel.find(p => `${p.firstName} ${p.lastName} · ${p.position}` === val);
                      setAbsentTeacherId(p ? p.id : '');
                    }}
                    placeholder="Select absent teacher..."
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>START DATE</label>
                    <input 
                      type="date" 
                      value={absenceStartDate} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setAbsenceStartDate(val);
                        if (!absenceEndDate || absenceEndDate < val) {
                          setAbsenceEndDate(val);
                        }
                      }}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid var(--line)', background: 'white' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>END DATE</label>
                    <input 
                      type="date" 
                      value={absenceEndDate} 
                      onChange={(e) => setAbsenceEndDate(e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid var(--line)', background: 'white' }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>LEAVE / ABSENCE TYPE</label>
                  <select 
                    value={leaveType} 
                    onChange={(e) => setLeaveType(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid var(--line)', background: 'white' }}
                  >
                    <option value="Sick Leave">Sick Leave</option>
                    <option value="Maternity Leave">Maternity Leave</option>
                    <option value="Paternity Leave">Paternity Leave</option>
                    <option value="Vacation Leave">Vacation Leave</option>
                    <option value="Unexcused Absence">Unexcused Absence</option>
                  </select>
                </div>
                <button type="submit" className="btn" style={{ padding: '10px', background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white', border: 0, borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '6px' }}>
                  Log Absence
                </button>
              </form>
            </div>
          </article>

          {/* Absences Log List */}
          <article className="card">
            <div className="card-inner" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)', margin: '0 0 16px 0' }}>Absence Log History</h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--line)', background: '#F8FAFC' }}>
                      <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Teacher Name</th>
                      <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Date of Absence</th>
                      <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Leave Type</th>
                      <th style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 'bold', color: 'var(--navy)', width: '80px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {absences.map((abs, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '12px 10px', fontWeight: 'bold', color: 'var(--navy)' }}>{abs.lastName}, {abs.firstName}</td>
                        <td style={{ padding: '12px 10px' }}>{abs.absenceDate}</td>
                        <td style={{ padding: '12px 10px' }}>
                          <span style={{ background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                            {abs.leaveType}
                          </span>
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                          <button 
                            className="btn danger"
                            onClick={async () => {
                              if (await showConfirm("Remove Log?", `Are you sure you want to remove this absence log for ${abs.firstName} ${abs.lastName}?`)) {
                                await removePersonnelAbsence(abs.id);
                              }
                            }}
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                          >
                            ✕ Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                    {absences.length === 0 && (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)' }}>No absences logged yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </article>
        </div>
      )}

      {/* Workload Transfers Tab */}
      {activeTab === 'transfers' && (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '20px' }}>
          {/* Create Transfer Form */}
          <article className="card" style={{ height: 'fit-content' }}>
            <div className="card-inner" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)', margin: 0 }}>Create Workload Transfer</h2>
              <form onSubmit={handleCreateTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>ABSENT TEACHER</label>
                  <SearchableDropdown 
                    options={activePersonnel.map(p => `${p.firstName} ${p.lastName} · ${p.position}`)}
                    value={activePersonnel.find(p => p.id === transferAbsentTeacherId) ? (() => {
                      const p = activePersonnel.find(p => p.id === transferAbsentTeacherId);
                      return `${p.firstName} ${p.lastName} · ${p.position}`;
                    })() : ''}
                    onChange={(val) => {
                      const p = activePersonnel.find(p => `${p.firstName} ${p.lastName} · ${p.position}` === val);
                      setTransferAbsentTeacherId(p ? p.id : '');
                      setSelectedTransferSlots({}); // reset slots
                    }}
                    placeholder="Select absent teacher..."
                  />
                </div>
                
                {transferAbsentTeacherId && (
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '6px' }}>ASSIGN SUBSTITUTE PER CLASS SLOT</label>
                    {(() => {
                      const absentTeacher = activePersonnel.find(p => p.id === transferAbsentTeacherId);
                      const slots = absentTeacher?.workloadRows || [];
                      if (slots.length === 0) {
                        return <span style={{ fontSize: '12px', color: 'var(--muted)' }}>This teacher has no active workloads scheduled.</span>;
                      }
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {slots.map((row, idx) => (
                            <div key={idx} style={{ background: 'white', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px' }}>
                              <strong style={{ color: 'var(--navy)' }}>{row.subject} ({row.gradeLevel})</strong>
                              <div style={{ color: 'var(--muted)', marginBottom: '4px' }}>Time: {row.startTime} - {row.endTime} [{(row.days || []).join(', ')}]</div>
                              <select 
                                value={selectedTransferSlots[idx] || ''}
                                onChange={(e) => setSelectedTransferSlots(prev => ({ ...prev, [idx]: e.target.value }))}
                                style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--line)' }}
                              >
                                <option value="">Select substitute teacher...</option>
                                {activePersonnel.filter(p => p.id !== transferAbsentTeacherId).map(p => (
                                  <option key={p.id} value={p.id}>{p.firstName} {p.lastName} ({p.position})</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>START DATE</label>
                    <input 
                      type="date" 
                      value={transferStartDate} 
                      onChange={(e) => setTransferStartDate(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1.5px solid var(--line)', background: 'white' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>END DATE</label>
                    <input 
                      type="date" 
                      value={transferEndDate} 
                      onChange={(e) => setTransferEndDate(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1.5px solid var(--line)', background: 'white' }}
                    />
                  </div>
                </div>
                
                <button type="submit" className="btn" style={{ padding: '10px', background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white', border: 0, borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '6px' }}>
                  Create Transfer
                </button>
              </form>
            </div>
          </article>

          {/* Active Transfers List */}
          <article className="card">
            <div className="card-inner" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)', margin: '0 0 16px 0' }}>Active Workload Transfers</h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--line)', background: '#F8FAFC' }}>
                      <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Absent Teacher</th>
                      <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Substitute Teacher</th>
                      <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Transferred Classes</th>
                      <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Duration</th>
                      <th style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 'bold', color: 'var(--navy)', width: '90px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workloadTransfers.filter(t => t.status !== 'ended').map((t, idx) => {
                      const absentee = activePersonnel.find(p => p.id === t.absentTeacherId);
                      const substitute = activePersonnel.find(p => p.id === t.substituteTeacherId);
                      const classSummary = (t.workloadRows || []).map(r => `${r.subject} (${r.gradeLevel})`).join(', ');

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                          <td style={{ padding: '12px 10px', fontWeight: 'bold', color: '#b91c1c' }}>
                            {absentee ? `${absentee.lastName}, ${absentee.firstName}` : 'Unknown'}
                          </td>
                          <td style={{ padding: '12px 10px', fontWeight: 'bold', color: '#15803d' }}>
                            {substitute ? `${substitute.lastName}, ${substitute.firstName}` : 'Unknown'}
                          </td>
                          <td style={{ padding: '12px 10px', color: 'var(--navy)' }}>{classSummary || 'All workloads'}</td>
                          <td style={{ padding: '12px 10px', whiteSpace: 'nowrap' }}>
                            {t.startDate ? new Date(t.startDate).toLocaleDateString() : ''} - {t.endDate ? new Date(t.endDate).toLocaleDateString() : ''}
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                            <button 
                              className="btn danger"
                              onClick={async () => {
                                if (await showConfirm("End Transfer?", "Are you sure you want to end this workload transfer and return the classes to the original teacher?")) {
                                  await removeWorkloadTransfer(t.id);
                                }
                              }}
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                            >
                              End Transfer
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {workloadTransfers.filter(t => t.status !== 'ended').length === 0 && (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)' }}>No active workload transfers.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </article>
        </div>
      )}
    </main>
  );
}
