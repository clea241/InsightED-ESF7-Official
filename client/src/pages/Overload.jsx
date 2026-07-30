import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import SearchableDropdown from '../components/SearchableDropdown';
import { api } from '../services/api';

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
  { name: 'September', quarter: 'Term 2', index: 8 },
  { name: 'October', quarter: 'Term 2', index: 9 },
  { name: 'November', quarter: 'Term 2', index: 10 },
  { name: 'January', quarter: 'Term 3', index: 0 },
  { name: 'February', quarter: 'Term 3', index: 1 },
  { name: 'March', quarter: 'Term 3', index: 2 }
];

// End-of-Term blocks & Vacation where teachers have no teaching load and NO overload pay
const NON_INSTRUCTIONAL_RANGES = [
  { start: '2026-09-02', end: '2026-09-15', label: 'Term 1 End-of-Term Block' },
  { start: '2026-12-07', end: '2026-12-18', label: 'Term 2 End-of-Term Block' },
  { start: '2027-03-24', end: '2027-04-08', label: 'Term 3 End-of-Term Block' },
  { start: '2027-04-09', end: '2027-06-06', label: 'Vacation' }
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

  const checkSubstituteConflict = (candidateTeacher, slotRow) => {
    if (!candidateTeacher || !slotRow || !slotRow.startTime || !slotRow.endTime) {
      return { hasConflict: false };
    }
    const slotStartMins = timeToMins(slotRow.startTime);
    const slotEndMins = timeToMins(slotRow.endTime);
    const slotDays = Array.isArray(slotRow.days) 
      ? slotRow.days 
      : String(slotRow.days || '').split(/[\s,]+/).filter(Boolean);

    for (const subRow of candidateTeacher.workloadRows || []) {
      if (!subRow.startTime || !subRow.endTime) continue;
      const subDays = Array.isArray(subRow.days) 
        ? subRow.days 
        : String(subRow.days || '').split(/[\s,]+/).filter(Boolean);
      const hasCommonDay = slotDays.some(d => subDays.includes(d));

      if (hasCommonDay) {
        const subStartMins = timeToMins(subRow.startTime);
        const subEndMins = timeToMins(subRow.endTime);
        if (subStartMins < slotEndMins && subEndMins > slotStartMins) {
          return {
            hasConflict: true,
            conflictingSubject: subRow.subject || 'Class',
            conflictingTime: `${subRow.startTime} - ${subRow.endTime}`
          };
        }
      }
    }
    return { hasConflict: false };
  };

  const [activeStep, setActiveStep] = useState(1); // 1: Tardiness Log, 2: Absences & Leave, 3: Workload Transfers, 4: Overload Computation
  
  // Roster Tab filters
  const [selectedMonth, setSelectedMonth] = useState('June');
  const [selectedQuarter, setSelectedQuarter] = useState('Term 1');
  const [teacherSearch, setTeacherSearch] = useState('');

  // Tardiness & Late Log form state (Step 1)
  const [tardinessTeacherId, setTardinessTeacherId] = useState('');
  const [tardinessMonth, setTardinessMonth] = useState('June');

  // Absences & Leave Log form state (Step 2)
  const [leaveType, setLeaveType] = useState('Sick Leave');
  const [absentTeacherId, setAbsentTeacherId] = useState('');
  const [absenceMonth, setAbsenceMonth] = useState('June');
  const [rangeStartDate, setRangeStartDate] = useState(null);
  const [rangeEndDate, setRangeEndDate] = useState(null);

  // Workload Transfer form state (Step 3)
  const [transferAbsentTeacherId, setTransferAbsentTeacherId] = useState('');
  const [transferMonth, setTransferMonth] = useState('June');
  const [transferRangeStart, setTransferRangeStart] = useState(null);
  const [transferRangeEnd, setTransferRangeEnd] = useState(null);
  const [transferStartDate, setTransferStartDate] = useState('');
  const [transferEndDate, setTransferEndDate] = useState('');
  const [selectedTransferSlots, setSelectedTransferSlots] = useState({}); // { rowIdx: substituteTeacherId }

  // Work Immersion form state (Step 4)
  const [workImmersionTeacherId, setWorkImmersionTeacherId] = useState('');
  const [workImmersionMonth, setWorkImmersionMonth] = useState('June');
  const [workImmersionData, setWorkImmersionData] = useState({}); // { [dayInt]: minutes }
  const [workImmersionLoading, setWorkImmersionLoading] = useState(false);

  // Overload Reasons state (Step 5)
  const [overloadReasonsMap, setOverloadReasonsMap] = useState({});
  const [activeReasonModalTeacher, setActiveReasonModalTeacher] = useState(null);

  // Fetch Work Immersion data when Step 4 is active
  useEffect(() => {
    if (activeStep !== 4 || !workImmersionTeacherId) return;
    let isMounted = true;
    setWorkImmersionLoading(true);
    const sy = schoolInfo?.schoolYear || 'SY 26-27';
    api.getWorkImmersion({
      personnelId: workImmersionTeacherId,
      schoolYear: sy,
      month: workImmersionMonth
    })
      .then(res => {
        if (!isMounted) return;
        const rows = res.rows || [];
        const data = {};
        rows.forEach(r => { data[r.day] = r.minutes; });
        setWorkImmersionData(data);
      })
      .catch(err => {
        console.error('Failed to fetch work immersion data:', err);
      })
      .finally(() => {
        if (isMounted) setWorkImmersionLoading(false);
      });
    return () => { isMounted = false; };
  }, [activeStep, workImmersionTeacherId, workImmersionMonth, schoolInfo?.schoolYear]);

  const handleSaveWorkImmersion = async (day, minutes) => {
    if (!workImmersionTeacherId) return;
    const sy = schoolInfo?.schoolYear || 'SY 26-27';

    setWorkImmersionData(prev => ({
      ...prev,
      [day]: minutes
    }));

    try {
      await api.saveWorkImmersion({
        personnelId: workImmersionTeacherId,
        schoolYear: sy,
        month: workImmersionMonth,
        day,
        minutes
      });
      showToast(`Work immersion for day ${day} updated`, 'success');
    } catch (err) {
      console.error('Failed to save work immersion minutes:', err);
      showToast('Failed to save work immersion minutes', 'error');
    }
  };

  useEffect(() => {
    const fetchReasons = async () => {
      try {
        const sy = schoolInfo?.schoolYear || 'SY 26-27';
        const res = await api.getOverloadReasons(sy, selectedQuarter);
        if (res && res.success && res.data) {
          setOverloadReasonsMap(res.data);
        }
      } catch (e) {
        console.error('Failed to load overload reasons:', e);
      }
    };
    fetchReasons();
  }, [schoolInfo?.schoolYear, selectedQuarter]);

  const handleToggleReasonForTeacher = async (personnelId, reasonName) => {
    const current = overloadReasonsMap[personnelId] || ['Teacher Shortage'];
    let updated = [];
    if (current.includes(reasonName)) {
      updated = current.filter(r => r !== reasonName);
    } else {
      updated = [...current, reasonName];
    }

    setOverloadReasonsMap(prev => ({
      ...prev,
      [personnelId]: updated
    }));

    if (updated.length >= 1) {
      try {
        const sy = schoolInfo?.schoolYear || 'SY 26-27';
        await api.saveOverloadReasons({
          personnelId,
          schoolYear: sy,
          term: selectedQuarter,
          reasons: updated
        });
      } catch (e) {
        console.error('Failed to save overload reason:', e);
      }
    }
  };

  // Filter out draft personnel for all selectors
  const activePersonnel = personnel.filter(p => !p.isDraft);

  // Filter active personnel who have recorded absences (for Step 3 Workload Transfer filtering)
  const personnelWithAbsences = activePersonnel.filter(p => {
    return absences.some(abs => {
      const pId = String(abs.personnelId || abs.personnel_id || '');
      if (pId !== String(p.id)) return false;
      const lType = abs.leaveType || abs.leave_type || '';
      return !lType.includes('Late') && !lType.includes('Tardiness');
    });
  });

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
      
      // Check if date falls into an End-of-Term block or Vacation
      const isNonInstructional = NON_INSTRUCTIONAL_RANGES.some(r => dateStr >= r.start && dateStr <= r.end);
      if (isNonInstructional) {
        return; // Teachers have no teaching load / overload pay during End-of-Term blocks or Vacation
      }
      
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
            if (row.subject === 'HGP') {
              // HGP is stored for tracking program duration only and does not add extra teaching load minutes
            } else if (row.subject === 'ADVISORY') {
              dailyTeachingMinutes += 60;
            } else {
              dailyTeachingMinutes += Math.max(0, timeToMins(row.endTime) - timeToMins(row.startTime));
            }
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
              if (row.subject === 'HGP') {
                // HGP does not add extra teaching load minutes
              } else if (row.subject === 'ADVISORY') {
                dailyTeachingMinutes += 60;
              } else {
                dailyTeachingMinutes += Math.max(0, timeToMins(row.endTime) - timeToMins(row.startTime));
              }
            }
          });
        }
      });
      
      // Daily hours
      const dailyHours = dailyTeachingMinutes / 60;
      
      // Gross daily overload
      const grossDailyOverload = Math.max(0, dailyHours - 6.0);
      
      const isAbsent = absences.some(a => String(a.personnelId || a.personnel_id) === String(teacher.id) && (a.absenceDate || a.absence_date) === dateStr);
      
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

  const handleAddTardinessSubmit = async (e) => {
    e.preventDefault();
    if (!tardinessTeacherId || !tardinessStartDate || !tardinessEndDate) {
      await showAlert("Missing Fields", "Please select a teacher, start date, and end date for tardiness logging.");
      return;
    }
    if (new Date(tardinessEndDate) < new Date(tardinessStartDate)) {
      await showAlert("Invalid Range", "End date cannot be before start date.");
      return;
    }

    const teacherAbsences = absences.filter(a => String(a.personnelId) === String(tardinessTeacherId));
    let hasConflict = false;
    let conflictDate = '';

    let cur = new Date(tardinessStartDate);
    const end = new Date(tardinessEndDate);
    while (cur <= end) {
      const dStr = getLocalDateString(cur);
      if (teacherAbsences.some(a => a.absenceDate === dStr)) {
        hasConflict = true;
        conflictDate = dStr;
        break;
      }
      cur.setDate(cur.getDate() + 1);
    }

    if (hasConflict) {
      await showAlert("Record Conflict", `This teacher already has an absence or tardiness logged on ${conflictDate}. Duplicate records on the same date are not allowed.`);
      return;
    }

    const res = await addPersonnelAbsence({
      personnelId: tardinessTeacherId,
      startDate: tardinessStartDate,
      endDate: tardinessEndDate,
      leaveType: 'Tardiness / Late'
    });
    if (res.success) {
      setTardinessTeacherId('');
      setTardinessStartDate('');
      setTardinessEndDate('');
    }
  };

  const handleAddAbsenceSubmit = async (e) => {
    e.preventDefault();
    if (!absentTeacherId || !absenceStartDate || !absenceEndDate || !leaveType) {
      await showAlert("Missing Fields", "Please select a type of leave, teacher, start date, and end date.");
      return;
    }
    if (new Date(absenceEndDate) < new Date(absenceStartDate)) {
      await showAlert("Invalid Range", "End date cannot be before start date.");
      return;
    }

    // Guard against duplicate / overlapping absence dates for this teacher across all leave types
    const teacherAbsences = absences.filter(a => String(a.personnelId) === String(absentTeacherId));
    let hasConflict = false;
    let conflictDate = '';

    let cur = new Date(absenceStartDate);
    const end = new Date(absenceEndDate);
    while (cur <= end) {
      const dStr = getLocalDateString(cur);
      if (teacherAbsences.some(a => a.absenceDate === dStr)) {
        hasConflict = true;
        conflictDate = dStr;
        break;
      }
      cur.setDate(cur.getDate() + 1);
    }

    if (hasConflict) {
      await showAlert("Absence Conflict", `This teacher already has an absence logged on ${conflictDate}. Duplicate absence dates across leave types are not allowed.`);
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

    // Schedule conflict check for all assigned slots
    for (const slot of slotsToTransfer) {
      const subTeacher = activePersonnel.find(p => p.id === slot.substituteTeacherId);
      const conflict = checkSubstituteConflict(subTeacher, slot);
      if (conflict.hasConflict) {
        await showAlert("Schedule Conflict Detected", `Cannot assign ${subTeacher.firstName} ${subTeacher.lastName} to ${slot.subject} (${slot.startTime}-${slot.endTime}) because they have a conflicting schedule (${conflict.conflictingSubject} ${conflict.conflictingTime}).`);
        return;
      }
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
      const substituteTeacher = activePersonnel.find(p => String(p.id) === String(subId));
      await addWorkloadTransfer({
        absentTeacherId: transferAbsentTeacherId,
        absentTeacherName: absentTeacher ? `${absentTeacher.lastName}, ${absentTeacher.firstName}` : '',
        substituteTeacherId: subId,
        substituteTeacherName: substituteTeacher ? `${substituteTeacher.lastName}, ${substituteTeacher.firstName}` : '',
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
    const missingReasonsTeacher = filteredRoster.find(item => {
      const reasons = overloadReasonsMap[item.teacher.id] || ['Teacher Shortage'];
      return !Array.isArray(reasons) || reasons.length < 1;
    });

    if (missingReasonsTeacher) {
      showAlert(
        "Overload Reason Required",
        `Please select at least 1 overload reason for ${missingReasonsTeacher.teacher.firstName} ${missingReasonsTeacher.teacher.lastName} before generating the report.`
      );
      return;
    }

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

      const teacherReasons = overloadReasonsMap[teacher.id] || ['Teacher Shortage'];
      const formattedReasons = Array.isArray(teacherReasons) && teacherReasons.length > 0 ? teacherReasons.join(', ') : 'Teacher Shortage';
      
      return `
        <tr>
          <td style="padding: 6px; border: 1px solid #475569; text-align: center;">${index + 1}</td>
          <td style="padding: 6px; border: 1px solid #475569; font-weight: bold;">${teacher.lastName}, ${teacher.firstName}</td>
          <td style="padding: 6px; border: 1px solid #475569;">${teacher.position}</td>
          ${wCols}
          <td style="padding: 6px; border: 1px solid #475569; text-align: center; font-weight: bold; background-color: #f8fafc;">${totalMinutes}</td>
          <td style="padding: 6px; border: 1px solid #475569; text-align: center; font-weight: bold; background-color: #f8fafc;">${totalHours}</td>
          <td style="padding: 6px; border: 1px solid #475569; text-align: right; font-weight: bold; background-color: #f8fafc; font-family: monospace;">₱${formattedPay}</td>
          <td style="padding: 6px; border: 1px solid #475569; text-align: center; font-size: 11px;">${formattedReasons}</td>
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

      {/* 5-Step Wizard Navigation Stepper */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '8px' }}>
        <button 
          onClick={() => setActiveStep(1)}
          style={{
            padding: '14px 18px',
            borderRadius: '14px',
            border: '2px solid',
            borderColor: activeStep === 1 ? 'var(--blue)' : 'var(--line)',
            background: activeStep === 1 ? 'linear-gradient(180deg, var(--blue-50), #fff)' : 'white',
            color: activeStep === 1 ? 'var(--navy)' : 'var(--muted)',
            fontWeight: 'bold',
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: activeStep === 1 ? '0 4px 12px rgba(14, 116, 144, 0.12)' : 'none'
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8 }}>Step 1</div>
          <div style={{ fontSize: '14px', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>⏰ Tardiness Log</div>
        </button>

        <button 
          onClick={() => setActiveStep(2)}
          style={{
            padding: '14px 18px',
            borderRadius: '14px',
            border: '2px solid',
            borderColor: activeStep === 2 ? 'var(--blue)' : 'var(--line)',
            background: activeStep === 2 ? 'linear-gradient(180deg, var(--blue-50), #fff)' : 'white',
            color: activeStep === 2 ? 'var(--navy)' : 'var(--muted)',
            fontWeight: 'bold',
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: activeStep === 2 ? '0 4px 12px rgba(14, 116, 144, 0.12)' : 'none'
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8 }}>Step 2</div>
          <div style={{ fontSize: '14px', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>🏖️ Absences & Leave</div>
        </button>

        <button 
          onClick={() => setActiveStep(3)}
          style={{
            padding: '14px 18px',
            borderRadius: '14px',
            border: '2px solid',
            borderColor: activeStep === 3 ? 'var(--blue)' : 'var(--line)',
            background: activeStep === 3 ? 'linear-gradient(180deg, var(--blue-50), #fff)' : 'white',
            color: activeStep === 3 ? 'var(--navy)' : 'var(--muted)',
            fontWeight: 'bold',
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: activeStep === 3 ? '0 4px 12px rgba(14, 116, 144, 0.12)' : 'none'
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8 }}>Step 3</div>
          <div style={{ fontSize: '14px', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>🔄 Workload Transfers</div>
        </button>

        <button 
          onClick={() => setActiveStep(4)}
          style={{
            padding: '14px 18px',
            borderRadius: '14px',
            border: '2px solid',
            borderColor: activeStep === 4 ? 'var(--blue)' : 'var(--line)',
            background: activeStep === 4 ? 'linear-gradient(180deg, var(--blue-50), #fff)' : 'white',
            color: activeStep === 4 ? 'var(--navy)' : 'var(--muted)',
            fontWeight: 'bold',
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: activeStep === 4 ? '0 4px 12px rgba(14, 116, 144, 0.12)' : 'none'
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8 }}>Step 4</div>
          <div style={{ fontSize: '14px', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>💼 Work Immersion (for SHS)</div>
        </button>

        <button 
          onClick={() => setActiveStep(5)}
          style={{
            padding: '14px 18px',
            borderRadius: '14px',
            border: '2px solid',
            borderColor: activeStep === 5 ? 'var(--blue)' : 'var(--line)',
            background: activeStep === 5 ? 'linear-gradient(180deg, var(--blue-50), #fff)' : 'white',
            color: activeStep === 5 ? 'var(--navy)' : 'var(--muted)',
            fontWeight: 'bold',
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: activeStep === 5 ? '0 4px 12px rgba(14, 116, 144, 0.12)' : 'none'
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8 }}>Step 5</div>
          <div style={{ fontSize: '14px', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>📈 Teaching Overload</div>
        </button>
      </div>

      {/* STEP 1: Tardiness & Late Log */}
      {activeStep === 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: '440px 1fr', gap: '20px' }}>
          {/* Interactive Calendar Selector Card */}
          <article className="card" style={{ height: 'fit-content' }}>
            <div className="card-inner" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)', margin: 0 }}>⏰ Interactive Tardiness Picker</h2>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0 }}>Select a teacher and click any weekday on the calendar below to toggle them as Tardy / Late on that day.</p>

              {/* Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>1. SELECT TEACHER</label>
                  <SearchableDropdown 
                    options={activePersonnel.map(p => `${p.firstName} ${p.lastName} · ${p.position}`)}
                    value={activePersonnel.find(p => p.id === tardinessTeacherId) ? (() => {
                      const p = activePersonnel.find(p => p.id === tardinessTeacherId);
                      return `${p.firstName} ${p.lastName} · ${p.position}`;
                    })() : ''}
                    onChange={(val) => {
                      const p = activePersonnel.find(p => `${p.firstName} ${p.lastName} · ${p.position}` === val);
                      setTardinessTeacherId(p ? p.id : '');
                    }}
                    placeholder="Select teacher to log tardiness..."
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>2. SELECT MONTH</label>
                  <select 
                    value={tardinessMonth}
                    onChange={(e) => setTardinessMonth(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid var(--line)', background: 'white', fontWeight: 'bold', fontSize: '13px' }}
                  >
                    {MONTHS_LIST.map(m => (
                      <option key={m.name} value={m.name}>{m.name} ({m.quarter})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: '12px', fontSize: '11px', background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b91c1c', fontWeight: 'bold' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#fee2e2', border: '1px solid #fca5a5' }}></span> ⏰ Tardy / Late
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b45309', fontWeight: 'bold' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#fef3c7', border: '1px solid #fde68a' }}></span> 🏖️ Leave
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--muted)' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'white', border: '1px solid var(--line)' }}></span> Regular
                </span>
              </div>

              {/* Interactive Calendar Grid */}
              {!tardinessTeacherId ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', background: '#F8FAFC', borderRadius: '12px', border: '1.5px dashed var(--line)', color: 'var(--muted)', fontSize: '13px' }}>
                  👈 Please select a teacher above to enable the interactive calendar picker.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--navy)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{tardinessMonth} 2026 Workdays Calendar</span>
                    <small style={{ color: 'var(--muted)', fontWeight: 'normal' }}>Click date to toggle</small>
                  </div>

                  {/* Calendar Grid (5 Weekdays) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
                      <div key={day} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', padding: '4px', background: '#e2e8f0', borderRadius: '4px' }}>
                        {day}
                      </div>
                    ))}
                    {(() => {
                      const monthDates = getWeekdaysInMonth(tardinessMonth, 'SY 26-27');
                      const teacherAbsences = absences.filter(a => String(a.personnelId || a.personnel_id) === String(tardinessTeacherId));

                      return monthDates.map((dateObj, idx) => {
                        const dateStr = getLocalDateString(dateObj);
                        const dayNum = dateObj.getDate();
                        const existingLog = teacherAbsences.find(a => (a.absenceDate || a.absence_date) === dateStr);
                        const lType = existingLog?.leaveType || existingLog?.leave_type || '';
                        const isTardy = existingLog && (lType.includes('Late') || lType.includes('Tardiness'));
                        const isLeave = existingLog && !isTardy;

                        let bg = 'white';
                        let border = '1.5px solid var(--line)';
                        let color = 'var(--navy)';
                        let badgeText = '';

                        if (isTardy) {
                          bg = '#fee2e2';
                          border = '1.5px solid #fca5a5';
                          color = '#991b1b';
                          badgeText = '⏰ LATE';
                        } else if (isLeave) {
                          bg = '#fef3c7';
                          border = '1.5px solid #fde68a';
                          color = '#92400e';
                          badgeText = '🏖️ LEAVE';
                        }

                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={async () => {
                              if (isLeave) {
                                await showAlert("Official Leave Logged", `This teacher is already logged for ${existingLog.leaveType} on ${dateStr} in Step 2.`);
                                return;
                              }
                              if (isTardy) {
                                if (await showConfirm("Remove Tardiness?", `Remove tardiness entry for ${dateStr}?`)) {
                                  await removePersonnelAbsence(existingLog.id);
                                }
                              } else {
                                await addPersonnelAbsence({
                                  personnelId: tardinessTeacherId,
                                  startDate: dateStr,
                                  endDate: dateStr,
                                  leaveType: 'Tardiness / Late'
                                });
                              }
                            }}
                            style={{
                              padding: '10px 4px',
                              borderRadius: '10px',
                              background: bg,
                              border: border,
                              color: color,
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minHeight: '52px',
                              boxShadow: isTardy ? '0 2px 6px rgba(185, 28, 28, 0.15)' : 'none',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span style={{ fontSize: '15px' }}>{dayNum}</span>
                            <span style={{ fontSize: '9px', textTransform: 'uppercase', marginTop: '2px', fontWeight: '800' }}>
                              {badgeText || 'Normal'}
                            </span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
          </article>

          {/* Tardiness Log List */}
          <article className="card">
            <div className="card-inner" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)', margin: 0 }}>Tardiness & Late Log History</h2>
                <button 
                  className="btn" 
                  onClick={() => setActiveStep(2)}
                  style={{ background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white', fontSize: '12px', padding: '6px 14px' }}
                >
                  Proceed to Step 2: Absences & Leave →
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--line)', background: '#F8FAFC' }}>
                      <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Teacher Name</th>
                      <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Date of Tardiness</th>
                      <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Record Type</th>
                      <th style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 'bold', color: 'var(--navy)', width: '80px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {absences.filter(abs => {
                      const lType = abs.leaveType || abs.leave_type || '';
                      return lType.includes('Late') || lType.includes('Tardiness');
                    }).map((abs, idx) => {
                      const teacher = activePersonnel.find(p => String(p.id) === String(abs.personnelId || abs.personnel_id));
                      const teacherName = teacher ? `${teacher.lastName}, ${teacher.firstName}` : (abs.lastName ? `${abs.lastName}, ${abs.firstName}` : 'Unknown Teacher');
                      const aDate = abs.absenceDate || abs.absence_date || '';

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                          <td style={{ padding: '12px 10px', fontWeight: 'bold', color: 'var(--navy)' }}>{teacherName}</td>
                          <td style={{ padding: '12px 10px' }}>{aDate}</td>
                          <td style={{ padding: '12px 10px' }}>
                            <span style={{
                              background: '#fee2e2',
                              color: '#b91c1c',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 'bold'
                            }}>
                              ⏰ Tardiness / Late (Overload Pay Deduction)
                            </span>
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                            <button 
                              className="btn danger"
                              onClick={async () => {
                                if (await showConfirm("Remove Log?", `Are you sure you want to remove this tardiness log for ${teacherName}?`)) {
                                  await removePersonnelAbsence(abs.id);
                                }
                              }}
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                            >
                              ✕ Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {absences.filter(abs => abs.leaveType?.includes('Late') || abs.leaveType?.includes('Tardiness')).length === 0 && (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)' }}>No tardiness / late entries logged yet. Select a teacher on the left and click calendar days to log tardiness.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </article>
        </div>
      )}

      {/* STEP 2: Absences & Leave Log */}
      {activeStep === 2 && (
        <div style={{ display: 'grid', gridTemplateColumns: '440px 1fr', gap: '20px' }}>
          {/* Interactive Range Picker Card */}
          <article className="card" style={{ height: 'fit-content' }}>
            <div className="card-inner" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)', margin: 0 }}>🏖️ Interactive Leave Range Picker</h2>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0 }}>Select teacher and leave type, then click a **Start Date** and **End Date** on the calendar to select a range.</p>

              {/* Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>1. LEAVE / ABSENCE TYPE</label>
                  <select 
                    value={leaveType} 
                    onChange={(e) => setLeaveType(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid var(--line)', background: 'white', fontWeight: 'bold', fontSize: '13px' }}
                  >
                    <option value="Sick Leave">Sick Leave</option>
                    <option value="Wellness Leave">Wellness Leave</option>
                    <option value="Maternity Leave">Maternity Leave</option>
                    <option value="Paternity Leave">Paternity Leave</option>
                    <option value="Vacation Leave">Vacation Leave</option>
                    <option value="Unexcused Absence">Unexcused Absence</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>2. SELECT TEACHER</label>
                  <SearchableDropdown 
                    options={activePersonnel.map(p => `${p.firstName} ${p.lastName} · ${p.position}`)}
                    value={activePersonnel.find(p => p.id === absentTeacherId) ? (() => {
                      const p = activePersonnel.find(p => p.id === absentTeacherId);
                      return `${p.firstName} ${p.lastName} · ${p.position}`;
                    })() : ''}
                    onChange={(val) => {
                      const p = activePersonnel.find(p => `${p.firstName} ${p.lastName} · ${p.position}` === val);
                      setAbsentTeacherId(p ? p.id : '');
                      setRangeStartDate(null);
                      setRangeEndDate(null);
                    }}
                    placeholder="Select absent teacher..."
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>3. SELECT MONTH</label>
                  <select 
                    value={absenceMonth}
                    onChange={(e) => {
                      setAbsenceMonth(e.target.value);
                      setRangeStartDate(null);
                      setRangeEndDate(null);
                    }}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid var(--line)', background: 'white', fontWeight: 'bold', fontSize: '13px' }}
                  >
                    {MONTHS_LIST.map(m => (
                      <option key={m.name} value={m.name}>{m.name} ({m.quarter})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: '12px', fontSize: '11px', background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b45309', fontWeight: 'bold' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#fef08a', border: '1px solid #eab308' }}></span> Selected Range
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b91c1c', fontWeight: 'bold' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#fee2e2', border: '1px solid #fca5a5' }}></span> ⏰ Tardy
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--muted)' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'white', border: '1px solid var(--line)' }}></span> Available
                </span>
              </div>

              {/* Interactive Calendar Range Grid */}
              {!absentTeacherId ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', background: '#F8FAFC', borderRadius: '12px', border: '1.5px dashed var(--line)', color: 'var(--muted)', fontSize: '13px' }}>
                  👈 Please select a teacher above to enable the interactive calendar range picker.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--navy)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{absenceMonth} 2026 Workdays Calendar</span>
                    <small style={{ color: 'var(--muted)', fontWeight: 'normal' }}>
                      {!rangeStartDate ? 'Click 1st date for Start Date' : (!rangeEndDate ? 'Click 2nd date for End Date' : 'Range selected!')}
                    </small>
                  </div>

                  {/* Calendar Grid (5 Weekdays) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
                      <div key={day} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', padding: '4px', background: '#e2e8f0', borderRadius: '4px' }}>
                        {day}
                      </div>
                    ))}
                    {(() => {
                      const monthDates = getWeekdaysInMonth(absenceMonth, 'SY 26-27');
                      const teacherAbsences = absences.filter(a => String(a.personnelId || a.personnel_id) === String(absentTeacherId));

                      return monthDates.map((dateObj, idx) => {
                        const dateStr = getLocalDateString(dateObj);
                        const dayNum = dateObj.getDate();
                        const existingLog = teacherAbsences.find(a => (a.absenceDate || a.absence_date) === dateStr);
                        const lType = existingLog?.leaveType || existingLog?.leave_type || '';
                        const isTardy = existingLog && (lType.includes('Late') || lType.includes('Tardiness'));
                        const isLoggedLeave = existingLog && !isTardy;

                        // Range calculation
                        const effectiveStart = rangeStartDate;
                        const effectiveEnd = rangeEndDate || rangeStartDate;
                        const isInSelectedRange = effectiveStart && dateStr >= effectiveStart && dateStr <= effectiveEnd;

                        let bg = 'white';
                        let border = '1.5px solid var(--line)';
                        let color = 'var(--navy)';
                        let badgeText = '';

                        if (isInSelectedRange) {
                          bg = '#fef08a';
                          border = '2px solid #ca8a04';
                          color = '#854d0e';
                          badgeText = 'SELECTED';
                        } else if (isLoggedLeave) {
                          bg = '#fef3c7';
                          border = '1.5px solid #fde68a';
                          color = '#92400e';
                          badgeText = '🏖️ ' + (lType.split(' ')[0].toUpperCase());
                        } else if (isTardy) {
                          bg = '#fee2e2';
                          border = '1.5px solid #fca5a5';
                          color = '#991b1b';
                          badgeText = '⏰ LATE';
                        }

                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              if (!rangeStartDate || (rangeStartDate && rangeEndDate)) {
                                setRangeStartDate(dateStr);
                                setRangeEndDate(null);
                              } else {
                                if (dateStr < rangeStartDate) {
                                  setRangeEndDate(rangeStartDate);
                                  setRangeStartDate(dateStr);
                                } else {
                                  setRangeEndDate(dateStr);
                                }
                              }
                            }}
                            style={{
                              padding: '10px 4px',
                              borderRadius: '10px',
                              background: bg,
                              border: border,
                              color: color,
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minHeight: '52px',
                              boxShadow: isInSelectedRange ? '0 2px 8px rgba(202, 138, 4, 0.25)' : 'none',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span style={{ fontSize: '15px' }}>{dayNum}</span>
                            <span style={{ fontSize: '9px', textTransform: 'uppercase', marginTop: '2px', fontWeight: '800' }}>
                              {badgeText || 'Normal'}
                            </span>
                          </button>
                        );
                      });
                    })()}
                  </div>

                  {/* Range Status & Action Panel */}
                  {rangeStartDate && (
                    <div style={{ marginTop: '10px', background: '#fefce8', border: '1.5px solid #fef08a', padding: '12px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#854d0e' }}>
                        📅 Selected Range: <strong>{rangeStartDate}</strong> {rangeEndDate ? `to ${rangeEndDate}` : '(1 day range)'}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={async () => {
                            const res = await addPersonnelAbsence({
                              personnelId: absentTeacherId,
                              startDate: rangeStartDate,
                              endDate: rangeEndDate || rangeStartDate,
                              leaveType: leaveType
                            });
                            if (res.success) {
                              setRangeStartDate(null);
                              setRangeEndDate(null);
                            }
                          }}
                          style={{ flex: 1, padding: '8px', background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white', border: 0, borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
                        >
                          Confirm & Log {leaveType}
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => {
                            setRangeStartDate(null);
                            setRangeEndDate(null);
                          }}
                          style={{ padding: '8px 12px', fontSize: '12px', background: 'white', border: '1px solid var(--line)' }}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </article>

          {/* Absences Log List */}
          <article className="card">
            <div className="card-inner" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)', margin: 0 }}>Absence & Leave Log History</h2>
                <button 
                  className="btn" 
                  onClick={() => setActiveStep(3)}
                  style={{ background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white', fontSize: '12px', padding: '6px 14px' }}
                >
                  Proceed to Step 3: Workload Transfers →
                </button>
              </div>
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
                    {absences.filter(abs => {
                      const lType = abs.leaveType || abs.leave_type || '';
                      return !lType.includes('Late') && !lType.includes('Tardiness');
                    }).map((abs, idx) => {
                      const teacher = activePersonnel.find(p => String(p.id) === String(abs.personnelId || abs.personnel_id));
                      const teacherName = teacher ? `${teacher.lastName}, ${teacher.firstName}` : (abs.lastName ? `${abs.lastName}, ${abs.firstName}` : 'Unknown Teacher');
                      const aDate = abs.absenceDate || abs.absence_date || '';
                      const lType = abs.leaveType || abs.leave_type || '';

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                          <td style={{ padding: '12px 10px', fontWeight: 'bold', color: 'var(--navy)' }}>{teacherName}</td>
                          <td style={{ padding: '12px 10px' }}>{aDate}</td>
                          <td style={{ padding: '12px 10px' }}>
                            <span style={{
                              background: '#fef3c7',
                              color: '#b45309',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 'bold'
                            }}>
                              {lType}
                            </span>
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                            <button 
                              className="btn danger"
                              onClick={async () => {
                                if (await showConfirm("Remove Log?", `Are you sure you want to remove this absence log for ${teacherName}?`)) {
                                  await removePersonnelAbsence(abs.id);
                                }
                              }}
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                            >
                              ✕ Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {absences.filter(abs => !abs.leaveType?.includes('Late') && !abs.leaveType?.includes('Tardiness')).length === 0 && (
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

      {/* STEP 3: Workload Transfers */}
      {activeStep === 3 && (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '20px' }}>
          {/* Create Transfer Form */}
          <article className="card" style={{ height: 'fit-content' }}>
            <div className="card-inner" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)', margin: 0 }}>Create Workload Transfer</h2>
              <form onSubmit={handleCreateTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>ABSENT TEACHER (WITH RECORDED ABSENCES)</label>
                  {personnelWithAbsences.length === 0 ? (
                    <div style={{ padding: '10px 12px', background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: '8px', color: '#B45309', fontSize: '12px', fontWeight: 'bold' }}>
                      ⚠️ No teachers with recorded absences found. Please log an absence in Step 2 first.
                    </div>
                  ) : (
                    <SearchableDropdown 
                      options={personnelWithAbsences.map(p => `${p.firstName} ${p.lastName} · ${p.position}`)}
                      value={personnelWithAbsences.find(p => p.id === transferAbsentTeacherId) ? (() => {
                        const p = personnelWithAbsences.find(p => p.id === transferAbsentTeacherId);
                        return `${p.firstName} ${p.lastName} · ${p.position}`;
                      })() : ''}
                      onChange={(val) => {
                        const p = personnelWithAbsences.find(p => `${p.firstName} ${p.lastName} · ${p.position}` === val);
                        setTransferAbsentTeacherId(p ? p.id : '');
                        setSelectedTransferSlots({}); // reset slots
                      }}
                      placeholder="Select absent teacher..."
                    />
                  )}
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
                                style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '4px', border: '1.5px solid var(--line)', fontWeight: 'bold' }}
                              >
                                <option value="">Select substitute teacher...</option>
                                {activePersonnel.filter(p => p.id !== transferAbsentTeacherId).map(p => {
                                  const conflictInfo = checkSubstituteConflict(p, row);
                                  return (
                                    <option 
                                      key={p.id} 
                                      value={p.id} 
                                      disabled={conflictInfo.hasConflict}
                                      style={{ color: conflictInfo.hasConflict ? '#b91c1c' : '#15803d' }}
                                    >
                                      {conflictInfo.hasConflict 
                                        ? `⚠️ WITH CONFLICT: ${p.lastName}, ${p.firstName} (${p.position}) — Conflict: ${conflictInfo.conflictingSubject} (${conflictInfo.conflictingTime})`
                                        : `✓ AVAILABLE: ${p.lastName}, ${p.firstName} (${p.position})`
                                      }
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Single-Calendar Range Picker for Transfer Dates */}
                <div style={{ marginTop: '4px', background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', margin: 0 }}>COVERAGE DATES (SINGLE CALENDAR RANGE)</label>
                    <select 
                      value={transferMonth}
                      onChange={(e) => {
                        setTransferMonth(e.target.value);
                        setTransferRangeStart(null);
                        setTransferRangeEnd(null);
                        setTransferStartDate('');
                        setTransferEndDate('');
                      }}
                      style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'white', fontWeight: 'bold', fontSize: '11px' }}
                    >
                      {MONTHS_LIST.map(m => (
                        <option key={m.name} value={m.name}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Calendar Grid (5 Weekdays) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
                      <div key={day} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 'bold', color: 'var(--navy)', padding: '3px', background: '#e2e8f0', borderRadius: '4px' }}>
                        {day}
                      </div>
                    ))}
                    {(() => {
                      const monthDates = getWeekdaysInMonth(transferMonth, 'SY 26-27');
                      const effectiveStart = transferRangeStart;
                      const effectiveEnd = transferRangeEnd || transferRangeStart;

                      return monthDates.map((dateObj) => {
                        const dateStr = getLocalDateString(dateObj);
                        const dayNum = dateObj.getDate();
                        const isInRange = effectiveStart && dateStr >= effectiveStart && dateStr <= effectiveEnd;

                        return (
                          <button
                            key={dateStr}
                            type="button"
                            onClick={() => {
                              if (!transferRangeStart || (transferRangeStart && transferRangeEnd)) {
                                setTransferRangeStart(dateStr);
                                setTransferRangeEnd(null);
                                setTransferStartDate(dateStr);
                                setTransferEndDate(dateStr);
                              } else {
                                if (dateStr >= transferRangeStart) {
                                  setTransferRangeEnd(dateStr);
                                  setTransferStartDate(transferRangeStart);
                                  setTransferEndDate(dateStr);
                                } else {
                                  setTransferRangeStart(dateStr);
                                  setTransferRangeEnd(null);
                                  setTransferStartDate(dateStr);
                                  setTransferEndDate(dateStr);
                                }
                              }
                            }}
                            style={{
                              padding: '6px 2px',
                              borderRadius: '6px',
                              border: isInRange ? '1.5px solid #eab308' : '1px solid var(--line)',
                              background: isInRange ? '#fef08a' : 'white',
                              color: isInRange ? '#854d0e' : 'var(--navy)',
                              fontWeight: 'bold',
                              fontSize: '12px',
                              cursor: 'pointer',
                              textAlign: 'center',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {dayNum}
                          </button>
                        );
                      });
                    })()}
                  </div>

                  {/* Range Status Preview */}
                  {transferStartDate && (
                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#854d0e', background: '#fefce8', padding: '6px 10px', borderRadius: '6px', border: '1px solid #fef08a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>📅 Selected Range: <strong>{transferStartDate}</strong> {transferEndDate && transferEndDate !== transferStartDate ? `to ${transferEndDate}` : ''}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setTransferRangeStart(null);
                          setTransferRangeEnd(null);
                          setTransferStartDate('');
                          setTransferEndDate('');
                        }}
                        style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontWeight: 'bold', fontSize: '10px' }}
                      >
                        Clear
                      </button>
                    </div>
                  )}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)', margin: 0 }}>Active Workload Transfers</h2>
                <button 
                  className="btn" 
                  onClick={() => setActiveStep(4)}
                  style={{ background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white', fontSize: '12px', padding: '6px 14px' }}
                >
                  Proceed to Step 4: Computation →
                </button>
              </div>
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
                      const absentId = t.absentTeacherId || t.absent_personnel_id || t.absent_teacher_id;
                      const subId = t.substituteTeacherId || t.substitute_personnel_id || t.substitute_teacher_id;

                      const absentee = activePersonnel.find(p => String(p.id) === String(absentId));
                      const substitute = activePersonnel.find(p => String(p.id) === String(subId));

                      const absenteeName = absentee 
                        ? `${absentee.lastName}, ${absentee.firstName}` 
                        : (t.absentTeacherName || t.absenteeName || t.absent_teacher_name || t.absent_name || 'Unknown Teacher');

                      const substituteName = substitute 
                        ? `${substitute.lastName}, ${substitute.firstName}` 
                        : (t.substituteTeacherName || t.substituteName || t.substitute_teacher_name || t.substitute_name || 'Unknown Teacher');

                      let rows = Array.isArray(t.workloadRows) && t.workloadRows.length > 0
                        ? t.workloadRows
                        : (Array.isArray(t.workload_rows) && t.workload_rows.length > 0 ? t.workload_rows : []);

                      if (rows.length === 0 && (t.workload_row_id || t.workloadRowId) && absentee) {
                        const matchedRow = (absentee.workloadRows || []).find(r => String(r.id) === String(t.workload_row_id || t.workloadRowId));
                        if (matchedRow) rows = [matchedRow];
                      }

                      const classSummary = rows.map(r => {
                        if (typeof r === 'string') return r;
                        const sub = r.subject || r.subject_name || r.subjectName || r.name || '';
                        const grade = r.gradeLevel || r.grade_level || r.grade || '';
                        if (sub && grade) return `${sub} (${grade})`;
                        return sub || grade || '';
                      }).filter(Boolean).join(', ');

                      const startDateVal = t.startDate || t.start_date || '';
                      const endDateVal = t.endDate || t.end_date || '';

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                          <td style={{ padding: '12px 10px', fontWeight: 'bold', color: '#b91c1c' }}>
                            {absenteeName}
                          </td>
                          <td style={{ padding: '12px 10px', fontWeight: 'bold', color: '#15803d' }}>
                            {substituteName}
                          </td>
                          <td style={{ padding: '12px 10px', color: 'var(--navy)', fontWeight: '600' }}>
                            {classSummary || 'Specific Class Slot'}
                          </td>
                          <td style={{ padding: '12px 10px', whiteSpace: 'nowrap' }}>
                            {startDateVal ? new Date(startDateVal).toLocaleDateString() : ''} - {endDateVal ? new Date(endDateVal).toLocaleDateString() : ''}
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

      {/* STEP 4: Work Immersion (for SHS) */}
      {activeStep === 4 && (
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '20px' }}>
          <article className="card">
            <div className="card-inner" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)' }}>Work Immersion Details</h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)', lineHeight: 1.4 }}>
                Select a Senior High School teacher and month to record daily work immersion minutes.
              </p>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '6px' }}>SELECT TEACHER</label>
                <SearchableDropdown
                  options={activePersonnel.map(p => `${p.firstName} ${p.lastName} · ${p.position || 'Teacher'}`)}
                  value={activePersonnel.find(p => p.id === workImmersionTeacherId) ? (() => {
                    const p = activePersonnel.find(p => p.id === workImmersionTeacherId);
                    return `${p.firstName} ${p.lastName} · ${p.position || 'Teacher'}`;
                  })() : ''}
                  onChange={(val) => {
                    const p = activePersonnel.find(p => `${p.firstName} ${p.lastName} · ${p.position || 'Teacher'}` === val);
                    setWorkImmersionTeacherId(p ? p.id : '');
                  }}
                  placeholder="Select teacher..."
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '6px' }}>SELECT MONTH</label>
                <select
                  value={workImmersionMonth}
                  onChange={(e) => setWorkImmersionMonth(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1.5px solid var(--line)', background: 'white' }}
                >
                  {MONTHS_LIST.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                </select>
              </div>

              <button
                className="btn primary"
                onClick={() => setActiveStep(5)}
                disabled={!workImmersionTeacherId}
                style={{ marginTop: '10px', width: '100%', padding: '12px', fontWeight: 'bold' }}
              >
                Proceed to Step 5 (Teaching Overload) →
              </button>
            </div>
          </article>

          <article className="card">
            <div className="card-inner" style={{ padding: '20px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '6px', fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)' }}>Work Immersion Calendar</h3>
              <p style={{ marginBottom: '16px', fontSize: '12px', color: 'var(--muted)' }}>
                Enter the number of minutes each teacher performed work immersion activities per day. Changes save automatically when moving between fields.
              </p>

              {!workImmersionTeacherId ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', fontSize: '13px' }}>
                  👈 Please select a teacher on the left to record work immersion minutes.
                </div>
              ) : workImmersionLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', fontSize: '13px' }}>
                  Loading work immersion records...
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '12px', color: 'var(--navy)', padding: '6px 0', background: '#F8FAFC', borderRadius: '6px' }}>
                      {d}
                    </div>
                  ))}
                  {(() => {
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                    const monthIdx = monthNames.indexOf(workImmersionMonth) !== -1 ? monthNames.indexOf(workImmersionMonth) : 5;
                    const syYearStr = schoolInfo?.schoolYear || 'SY 26-27';
                    const years = syYearStr.match(/\d+/g) || ['26', '27'];
                    const startYear = 2000 + parseInt(years[0], 10);
                    const endYear = 2000 + parseInt(years[1] || years[0], 10);
                    const yearInt = monthIdx >= 5 ? startYear : endYear;

                    const firstDayOfWeek = new Date(yearInt, monthIdx, 1).getDay();
                    const daysInMonth = new Date(yearInt, monthIdx + 1, 0).getDate();
                    const cells = [];

                    for (let i = 0; i < firstDayOfWeek; i++) {
                      cells.push(<div key={`pad-${i}`} style={{ background: '#f8fafc', borderRadius: '8px', minHeight: '60px' }} />);
                    }

                    for (let day = 1; day <= daysInMonth; day++) {
                      const mins = workImmersionData[day] ?? 0;
                      cells.push(
                        <div
                          key={day}
                          style={{
                            background: mins > 0 ? '#EFF6FF' : '#FFFFFF',
                            border: mins > 0 ? '1.5px solid #BFDBFE' : '1px solid var(--line)',
                            borderRadius: '8px',
                            padding: '6px',
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            minHeight: '60px'
                          }}
                        >
                          <div style={{ fontSize: '11px', fontWeight: 'bold', color: mins > 0 ? '#1E40AF' : '#64748B', marginBottom: '4px' }}>
                            {day}
                          </div>
                          <input
                            type="number"
                            min="0"
                            max="480"
                            placeholder="0"
                            defaultValue={mins === 0 ? '' : mins}
                            key={`${workImmersionTeacherId}-${workImmersionMonth}-${day}-${mins}`}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value, 10) || 0;
                              handleSaveWorkImmersion(day, val);
                            }}
                            style={{
                              width: '100%',
                              border: '1px solid var(--line)',
                              borderRadius: '6px',
                              background: 'white',
                              textAlign: 'center',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              color: 'var(--navy)',
                              padding: '4px 0'
                            }}
                          />
                        </div>
                      );
                    }
                    return cells;
                  })()}
                </div>
              )}
            </div>
          </article>
        </div>
      )}

      {/* STEP 5: Computation of Teaching Overload */}
      {activeStep === 5 && (
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
                    <option value="Term 1">Term 1 (June – August)</option>
                    <option value="Term 2">Term 2 (September – November)</option>
                    <option value="Term 3">Term 3 (January – March)</option>
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
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Reason for Overload</th>
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
                    const teacherReasons = overloadReasonsMap[item.teacher.id] || ['Teacher Shortage'];
                    const isInvalid = !Array.isArray(teacherReasons) || teacherReasons.length < 1;

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
                        <td style={{ padding: '8px 10px', minWidth: '260px' }}>
                          {(() => {
                            const teacherReasons = overloadReasonsMap[item.teacher.id] || ['Teacher Shortage'];
                            const allOptions = [
                              'Teacher Shortage',
                              'Relieving Duty',
                              'Remediation or Enhancement Class',
                              'Class Advising Duty'
                            ];
                            const isInvalid = !Array.isArray(teacherReasons) || teacherReasons.length < 1;
                            const remainingOptions = allOptions.filter(opt => !teacherReasons.includes(opt));

                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {/* Active Reason Badges / Pills */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                  {teacherReasons.map((reason, rIdx) => (
                                    <div
                                      key={rIdx}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: '#eff6ff',
                                        border: '1px solid #bfdbfe',
                                        borderRadius: '6px',
                                        padding: '3px 8px',
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        color: '#1e40af'
                                      }}
                                    >
                                      <span>{reason}</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = teacherReasons.filter((_, idx) => idx !== rIdx);
                                          setOverloadReasonsMap(prev => ({
                                            ...prev,
                                            [item.teacher.id]: updated
                                          }));
                                          if (updated.length >= 1) {
                                            const sy = schoolInfo?.schoolYear || 'SY 26-27';
                                            api.saveOverloadReasons({
                                              personnelId: item.teacher.id,
                                              schoolYear: sy,
                                              term: selectedQuarter,
                                              reasons: updated
                                            });
                                          }
                                        }}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          color: '#2563eb',
                                          cursor: 'pointer',
                                          fontWeight: 'bold',
                                          fontSize: '12px',
                                          lineHeight: 1,
                                          padding: 0
                                        }}
                                        title="Remove Reason"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}

                                  {isInvalid && (
                                    <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 'bold' }}>
                                      ⚠️ At least 1 reason required
                                    </div>
                                  )}
                                </div>

                                {/* Dropdown to add another reason */}
                                {remainingOptions.length > 0 && (
                                  <select
                                    value=""
                                    onChange={(e) => {
                                      const selectedVal = e.target.value;
                                      if (!selectedVal) return;
                                      handleToggleReasonForTeacher(item.teacher.id, selectedVal);
                                    }}
                                    style={{
                                      fontSize: '11px',
                                      padding: '4px 8px',
                                      borderRadius: '6px',
                                      border: '1.5px dashed #cbd5e1',
                                      background: '#ffffff',
                                      color: '#475569',
                                      cursor: 'pointer',
                                      width: 'fit-content'
                                    }}
                                  >
                                    <option value="">+ Add Overload Reason...</option>
                                    {remainingOptions.map(opt => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredRoster.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)' }}>No teachers with active overloads found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </article>
      )}
    </main>
  );
}
