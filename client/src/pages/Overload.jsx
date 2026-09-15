import React, { useState, useEffect, useRef } from 'react';
import { useApp, DEFAULT_PH_HOLIDAYS, detectPersonnelTypeFromPosition } from '../context/AppContext';
import SearchableDropdown from '../components/SearchableDropdown';
import PortalHeader from '../components/PortalHeader';
import LoadingScreen from '../components/LoadingScreen';
import { api } from '../services/api';
import { 
  FiCalendar, 
  FiClock, 
  FiRepeat, 
  FiBriefcase, 
  FiTrendingUp, 
  FiUserX, 
  FiAlertCircle, 
  FiCheck, 
  FiPrinter, 
  FiRefreshCw, 
  FiClipboard, 
  FiX, 
  FiCheckCircle,
  FiTrash2,
  FiBook 
} from 'react-icons/fi';


// Helper to convert "HH:MM" or "HH:MM AM/PM" time to minutes
const timeToMins = (t) => {
  if (!t) return 0;
  const str = String(t).trim();
  const match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) {
    const [h, m] = str.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3] ? match[3].toUpperCase() : null;

  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;

  return h * 60 + m;
};

// Day mapping helper from short code to full name
const DAY_MAP = {
  'M': 'Monday',
  'T': 'Tuesday',
  'W': 'Wednesday',
  'TH': 'Thursday',
  'F': 'Friday'
};

const ACADEMIC_TERMS = [
  { id: 'Term 1', label: 'Term 1 (June – August)', months: ['June', 'July', 'August'], fyLabel: 'FY Q2 & FY Q3' },
  { id: 'Term 2', label: 'Term 2 (September – December)', months: ['September', 'October', 'November', 'December'], fyLabel: 'FY Q3 & FY Q4' },
  { id: 'Term 3', label: 'Term 3 (January – March)', months: ['January', 'February', 'March'], fyLabel: 'FY Q1' }
];

const FY_QUARTERS = [
  { id: 'FY Q1', label: 'FY Q1 (January – March)', months: ['January', 'February', 'March'], termLabel: 'Term 3' },
  { id: 'FY Q2', label: 'FY Q2 (April – June)', months: ['April', 'May', 'June'], termLabel: 'Term 1 (June 8–30)' },
  { id: 'FY Q3', label: 'FY Q3 (July – September)', months: ['July', 'August', 'September'], termLabel: 'Term 1 & Term 2' },
  { id: 'FY Q4', label: 'FY Q4 (October – December)', months: ['October', 'November', 'December'], termLabel: 'Term 2 (Oct–Dec 4)' }
];

const MONTHS_LIST = [
  { name: 'June', quarter: 'Term 1', fy: 'FY Q2', index: 5 },
  { name: 'July', quarter: 'Term 1', fy: 'FY Q3', index: 6 },
  { name: 'August', quarter: 'Term 1', fy: 'FY Q3', index: 7 },
  { name: 'September', quarter: 'Term 2', fy: 'FY Q3', index: 8 },
  { name: 'October', quarter: 'Term 2', fy: 'FY Q4', index: 9 },
  { name: 'November', quarter: 'Term 2', fy: 'FY Q4', index: 10 },
  { name: 'December', quarter: 'Term 2', fy: 'FY Q4', index: 11 },
  { name: 'January', quarter: 'Term 3', fy: 'FY Q1', index: 0 },
  { name: 'February', quarter: 'Term 3', fy: 'FY Q1', index: 1 },
  { name: 'March', quarter: 'Term 3', fy: 'FY Q1', index: 2 },
  { name: 'April', quarter: 'Vacation', fy: 'FY Q2', index: 3 },
  { name: 'May', quarter: 'Vacation', fy: 'FY Q2', index: 4 }
];

// End-of-Term blocks & Vacation where teachers have no teaching load and NO overload pay
const NON_INSTRUCTIONAL_RANGES = [
  { start: '2026-09-02', end: '2026-09-15', label: 'Term 1 End-of-Term Block' },
  { start: '2026-12-07', end: '2026-12-18', label: 'Term 2 End-of-Term Block' },
  { start: '2026-12-19', end: '2027-01-03', label: 'Holiday Break' },
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
    salaryMatrix,
    localNonWorkingDays,
    setLocalNonWorkingDays,
    setActiveView
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
    const cleanPos = String(pos || '').replace(/\s*-\s*SNED/i, '').trim();
    const steps = fallbackSalaries[pos] || fallbackSalaries[cleanPos] || fallbackSalaries['TEACHER I'];
    const salary = steps[step - 1] || steps[0];
    return 0.000781 * 12 * salary;
  };

  const checkSubstituteConflict = (candidateTeacher, slotRow, targetStartDate, targetEndDate, currentSlotIdx, currentFormSlots, allSlots) => {
    if (!candidateTeacher || !slotRow || !slotRow.startTime || !slotRow.endTime) {
      return { hasConflict: false };
    }
    const slotStartMins = timeToMins(slotRow.startTime);
    const slotEndMins = timeToMins(slotRow.endTime);
    const slotDays = Array.isArray(slotRow.days) 
      ? slotRow.days 
      : String(slotRow.days || '').split(/[\s,]+/).filter(Boolean);

    // 1. Check candidate teacher's own regular class schedule
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
            conflictingSubject: subRow.subject || 'Regular Class',
            conflictingTime: `${subRow.startTime} - ${subRow.endTime}`
          };
        }
      }
    }

    // 2. Check candidate teacher's existing active workload transfers
    const sDate = targetStartDate || '';
    const eDate = targetEndDate || targetStartDate || '';

    if (Array.isArray(workloadTransfers)) {
      for (const t of workloadTransfers) {
        if (t.status === 'ended') continue;
        const subId = t.substituteTeacherId || t.substitute_personnel_id || t.substitute_teacher_id;
        if (String(subId) !== String(candidateTeacher.id)) continue;

        const tStart = t.startDate || t.start_date || '';
        const tEnd = t.endDate || t.end_date || tStart;

        // Check if date ranges overlap
        const dateOverlap = (!sDate || !tStart) || (sDate <= tEnd && eDate >= tStart);
        if (!dateOverlap) continue;

        for (const tRow of t.workloadRows || []) {
          if (!tRow.startTime && !tRow.start_time) continue;
          const tRowStart = tRow.startTime || tRow.start_time;
          const tRowEnd = tRow.endTime || tRow.end_time;
          const tRowDays = Array.isArray(tRow.days) 
            ? tRow.days 
            : String(tRow.days || '').split(/[\s,]+/).filter(Boolean);

          const hasCommonDay = slotDays.some(d => tRowDays.includes(d));
          if (hasCommonDay) {
            const tStartMins = timeToMins(tRowStart);
            const tEndMins = timeToMins(tRowEnd);
            if (tStartMins < slotEndMins && tEndMins > slotStartMins) {
              return {
                hasConflict: true,
                conflictingSubject: `Already Covering: ${tRow.subject || tRow.subject_name || 'Transferred Class'}`,
                conflictingTime: `${tRowStart} - ${tRowEnd} (${tStart} to ${tEnd})`
              };
            }
          }
        }
      }
    }

    // 3. Check current form assignments for simultaneous slots
    if (currentFormSlots && allSlots && currentSlotIdx !== undefined) {
      for (const [idxStr, assignedTeacherId] of Object.entries(currentFormSlots)) {
        const otherIdx = Number(idxStr);
        if (otherIdx === currentSlotIdx) continue;
        if (String(assignedTeacherId) !== String(candidateTeacher.id)) continue;

        const otherSlot = allSlots[otherIdx];
        if (!otherSlot || !otherSlot.startTime || !otherSlot.endTime) continue;

        const otherDays = Array.isArray(otherSlot.days) 
          ? otherSlot.days 
          : String(otherSlot.days || '').split(/[\s,]+/).filter(Boolean);
        const hasCommonDay = slotDays.some(d => otherDays.includes(d));

        if (hasCommonDay) {
          const otherStartMins = timeToMins(otherSlot.startTime);
          const otherEndMins = timeToMins(otherSlot.endTime);
          if (otherStartMins < slotEndMins && otherEndMins > slotStartMins) {
            return {
              hasConflict: true,
              conflictingSubject: `Assigned in this form: ${otherSlot.subject || 'Class'}`,
              conflictingTime: `${otherSlot.startTime} - ${otherSlot.endTime}`
            };
          }
        }
      }
    }

    return { hasConflict: false };
  };

  const [activeStep, setActiveStep] = useState(1); // 1: Tardiness Log, 2: Absences & Leave, 3: Workload Transfers, 4: Overload Computation
  
  // Step 6 / Roster Tab filters
  const [filterMode, setFilterMode] = useState('term'); // 'term' | 'fy'
  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [selectedFY, setSelectedFY] = useState('FY Q3');
  const [selectedMonth, setSelectedMonth] = useState('June');
  const [selectedQuarter, setSelectedQuarter] = useState('Term 1');
  const [teacherSearch, setTeacherSearch] = useState('');

  // Local Holidays & Suspensions form state (Step 1)
  const [step1Month, setStep1Month] = useState('June');
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayType, setHolidayType] = useState('Local Holiday');
  const [holidayDesc, setHolidayDesc] = useState('');

  const handleAddHoliday = () => {
    if (!holidayDate || !holidayDesc.trim()) {
      showAlert('Please fill in both Date and Description.');
      return;
    }
    const newHoliday = {
      id: `hol-${Date.now()}`,
      date: holidayDate,
      type: holidayType,
      description: holidayDesc.trim()
    };
    const existingIdx = (localNonWorkingDays || []).findIndex(h => h.date === holidayDate);
    let updated;
    if (existingIdx >= 0) {
      updated = [...(localNonWorkingDays || [])];
      updated[existingIdx] = newHoliday;
    } else {
      updated = [...(localNonWorkingDays || []), newHoliday];
    }
    setLocalNonWorkingDays(updated);
    try {
      localStorage.setItem('insighted_non_working_days', JSON.stringify(updated));
    } catch(e) {}
    setHolidayDate('');
    setHolidayDesc('');
    showConfirm('Holiday / Suspension Added!', 'The selected date has been marked as a non-working day and will be excluded from overload computations.');
  };

  const handleRemoveHoliday = (id) => {
    const updated = (localNonWorkingDays || []).filter(h => h.id !== id);
    setLocalNonWorkingDays(updated);
    try {
      localStorage.setItem('insighted_non_working_days', JSON.stringify(updated));
    } catch(e) {}
  };

  const handleResetDefaultHolidays = async () => {
    if (await showConfirm('Restore Standard PH Holidays?', 'This will reset and restore standard Philippine National Holidays to your calendar. Do you want to proceed?')) {
      setLocalNonWorkingDays(DEFAULT_PH_HOLIDAYS);
      try {
        localStorage.setItem('insighted_non_working_days', JSON.stringify(DEFAULT_PH_HOLIDAYS));
      } catch (e) {}
    }
  };

  // Tardiness & Late Log form state (Step 2)
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

  // Work Immersion form state (Step 5)
  const [workImmersionTeacherId, setWorkImmersionTeacherId] = useState('');
  const [workImmersionMonth, setWorkImmersionMonth] = useState('June');
  const [workImmersionData, setWorkImmersionData] = useState({}); // { [dateStr]: minutes }
  const [workImmersionTimes, setWorkImmersionTimes] = useState({}); // { [dateStr]: { startTime, endTime } }
  const [workImmersionLoading, setWorkImmersionLoading] = useState(false);
  const [batchImmersionStart, setBatchImmersionStart] = useState('08:00');
  const [batchImmersionEnd, setBatchImmersionEnd] = useState('12:00');
  const [immersionStatusMsg, setImmersionStatusMsg] = useState('');

  // Overload Reasons state (Step 6)
  const [overloadReasonsMap, setOverloadReasonsMap] = useState({});
  const [activeReasonModalTeacher, setActiveReasonModalTeacher] = useState(null);

  // Fetch Work Immersion data when Step 5 is active
  useEffect(() => {
    if (activeStep !== 5 || !workImmersionTeacherId) return;
    let isMounted = true;
    setWorkImmersionLoading(true);
    const sy = schoolInfo?.schoolYear || '2026-2027';

    api.getWorkImmersionSchedules(workImmersionTeacherId, sy)
      .then(res => {
        if (!isMounted) return;
        const rows = (res && res.data) ? res.data : (res && Array.isArray(res.rows) ? res.rows : (Array.isArray(res) ? res : []));
        const data = {};
        const times = {};

        rows.forEach(r => {
          const vDate = r.visitDate || r.visit_date || r.date;
          if (vDate) {
            const cleanDate = String(vDate).substring(0, 10);
            const sTime = r.startTime || r.start_time || '';
            const eTime = r.endTime || r.end_time || '';
            const dur = Number(r.durationMinutes || r.duration_minutes || r.minutes || 0);
            data[cleanDate] = dur;
            times[cleanDate] = { startTime: sTime, endTime: eTime };
          }
        });
        setWorkImmersionData(data);
        setWorkImmersionTimes(times);
      })
      .catch(err => {
        console.error('Failed to fetch work immersion data:', err);
      })
      .finally(() => {
        if (isMounted) setWorkImmersionLoading(false);
      });
    return () => { isMounted = false; };
  }, [activeStep, workImmersionTeacherId, schoolInfo?.schoolYear]);

  // Toggle a single day on the interactive calendar
  const handleToggleImmersionDay = async (dateStr) => {
    if (!workImmersionTeacherId) {
      await showAlert("Select Teacher", "Please select a teacher first before picking immersion days.");
      return;
    }

    const sy = schoolInfo?.schoolYear || '2026-2027';
    const isCurrentlySelected = Boolean(workImmersionTimes[dateStr]);

    if (isCurrentlySelected) {
      // Untoggle: remove from state & delete from DB
      const updatedTimes = { ...workImmersionTimes };
      delete updatedTimes[dateStr];
      const updatedData = { ...workImmersionData };
      delete updatedData[dateStr];

      setWorkImmersionTimes(updatedTimes);
      setWorkImmersionData(updatedData);

      try {
        await api.deleteWorkImmersionDate({
          personnelId: workImmersionTeacherId,
          schoolYear: sy,
          date: dateStr
        });
        setImmersionStatusMsg(`Removed immersion schedule for ${dateStr}`);
        setTimeout(() => setImmersionStatusMsg(''), 3000);
      } catch (err) {
        console.error('Failed to delete work immersion date:', err);
      }
    } else {
      // Toggle ON: default to batch times
      const sTime = batchImmersionStart || '08:00';
      const eTime = batchImmersionEnd || '12:00';
      let mins = 0;
      if (sTime && eTime) {
        const sm = timeToMins(sTime);
        const em = timeToMins(eTime);
        if (em > sm) mins = em - sm;
      }

      const updatedTimes = {
        ...workImmersionTimes,
        [dateStr]: { startTime: sTime, endTime: eTime }
      };
      const updatedData = {
        ...workImmersionData,
        [dateStr]: mins
      };

      setWorkImmersionTimes(updatedTimes);
      setWorkImmersionData(updatedData);

      try {
        await api.saveWorkImmersionBatch({
          personnelId: workImmersionTeacherId,
          schoolId: schoolInfo?.schoolId || '108348',
          schoolYear: sy,
          schedules: [{
            visitDate: dateStr,
            startTime: sTime,
            endTime: eTime
          }]
        });
        setImmersionStatusMsg(`Added immersion schedule for ${dateStr} (${mins} mins)`);
        setTimeout(() => setImmersionStatusMsg(''), 3000);
      } catch (err) {
        console.error('Failed to save work immersion date:', err);
      }
    }
  };

  // Update Start/End time for a specific day
  const handleUpdateImmersionDayTime = async (dateStr, startTime, endTime) => {
    if (!workImmersionTeacherId) return;
    const sy = schoolInfo?.schoolYear || '2026-2027';

    let minutes = 0;
    if (startTime && endTime) {
      const sm = timeToMins(startTime);
      const em = timeToMins(endTime);
      if (em > sm) minutes = em - sm;
    }

    setWorkImmersionTimes(prev => ({
      ...prev,
      [dateStr]: { startTime, endTime }
    }));
    setWorkImmersionData(prev => ({
      ...prev,
      [dateStr]: minutes
    }));

    try {
      await api.saveWorkImmersionBatch({
        personnelId: workImmersionTeacherId,
        schoolId: schoolInfo?.schoolId || '108348',
        schoolYear: sy,
        schedules: [{
          visitDate: dateStr,
          startTime,
          endTime
        }]
      });
      setImmersionStatusMsg(`Updated schedule for ${dateStr} (${minutes} mins)`);
      setTimeout(() => setImmersionStatusMsg(''), 3000);
    } catch (err) {
      console.error('Failed to update work immersion schedule:', err);
    }
  };

  // Remove single immersion day
  const handleRemoveImmersionDay = async (dateStr) => {
    await handleToggleImmersionDay(dateStr);
  };

  // Batch apply Start & End times to all selected days in the active month
  const handleBatchApplyTimesToMonth = async () => {
    if (!workImmersionTeacherId) {
      await showAlert("Select Teacher", "Please select a teacher first.");
      return;
    }
    const currentMonthDates = getWeekdaysInMonth(workImmersionMonth, schoolInfo?.schoolYear || 'SY 26-27')
      .map(d => getLocalDateString(d));
    const selectedInMonth = currentMonthDates.filter(dStr => Boolean(workImmersionTimes[dStr]));

    if (selectedInMonth.length === 0) {
      await showAlert("No Days Selected", `No immersion days are currently selected for ${workImmersionMonth}. Click days on the calendar first.`);
      return;
    }

    const sTime = batchImmersionStart || '08:00';
    const eTime = batchImmersionEnd || '12:00';
    const sm = timeToMins(sTime);
    const em = timeToMins(eTime);
    const mins = em > sm ? em - sm : 0;

    const updatedTimes = { ...workImmersionTimes };
    const updatedData = { ...workImmersionData };
    const batchList = [];

    selectedInMonth.forEach(dStr => {
      updatedTimes[dStr] = { startTime: sTime, endTime: eTime };
      updatedData[dStr] = mins;
      batchList.push({
        visitDate: dStr,
        startTime: sTime,
        endTime: eTime
      });
    });

    setWorkImmersionTimes(updatedTimes);
    setWorkImmersionData(updatedData);

    try {
      const sy = schoolInfo?.schoolYear || '2026-2027';
      await api.saveWorkImmersionBatch({
        personnelId: workImmersionTeacherId,
        schoolId: schoolInfo?.schoolId || '108348',
        schoolYear: sy,
        schedules: batchList
      });
      setImmersionStatusMsg(`Applied ${sTime} – ${eTime} to all ${selectedInMonth.length} selected days!`);
      setTimeout(() => setImmersionStatusMsg(''), 4000);
    } catch (err) {
      console.error('Failed to batch save work immersion schedules:', err);
    }
  };

  const activeTermKey = filterMode === 'term' ? selectedTerm : selectedFY;

  const OVERLOAD_REASON_OPTIONS = [
    'Teacher Shortage',
    'Class Advising Duty',
    'Relieving Duty',
    'Remediation or Enhancement Class',
    'ARAL Tutor'
  ];

  const normalizeReasonString = (r) => {
    if (r === 'Excess teaching load beyond 6 hours of actual classroom teaching') return 'Teacher Shortage';
    if (r === 'Advisory class assignment') return 'Class Advising Duty';
    return r;
  };

  const getAutoReasonsForTeacher = (teacher, overloadItem) => {
    const reasons = [];
    
    // 1. Teacher Shortage (Excess teaching load beyond 6 hours of actual classroom teaching)
    const weeklyHrs = Number(overloadItem?.weeklyOverload || 0);
    const netHrs = Number(overloadItem?.totalStats?.net || 0);
    if (weeklyHrs > 0 || netHrs > 0 || true) {
      reasons.push('Teacher Shortage');
    }

    // 2. Class Advising Duty (Advisory class assignment)
    const rows = teacher?.workloadRows || [];
    const hasAdvisory = rows.some(r => {
      const s = String(r.subject || '').toUpperCase().trim();
      return s === 'ADVISORY' || s.startsWith('ADVISORY') || s === 'HGP' || s.startsWith('HGP') || s.includes('HOMEROOM');
    }) || Boolean(teacher?.isAdviser || teacher?.advisoryClass || teacher?.advisorySection || teacher?.advisory_section);

    if (hasAdvisory) {
      reasons.push('Class Advising Duty');
    }

    // 3. Relieving Duty (Substitutions)
    const hasTransfers = (workloadTransfers || []).some(t => String(t.substituteTeacherId || t.substitute_id) === String(teacher?.id));
    if (hasTransfers) {
      reasons.push('Relieving Duty');
    }

    // 4. ARAL Tutor
    const hasAral = rows.some(r => {
      const s = String(r.subject || '').toUpperCase().trim();
      return s.includes('ARAL');
    });
    if (hasAral) {
      reasons.push('ARAL Tutor');
    }

    return reasons.length > 0 ? Array.from(new Set(reasons)) : ['Teacher Shortage'];
  };

  useEffect(() => {
    const fetchReasons = async () => {
      try {
        const sy = schoolInfo?.schoolYear || 'SY 26-27';
        const res = await api.getOverloadReasons(sy, activeTermKey);
        if (res && res.success && res.data) {
          const normalizedMap = {};
          Object.entries(res.data).forEach(([pId, rList]) => {
            if (Array.isArray(rList)) {
              normalizedMap[pId] = rList.map(normalizeReasonString);
            }
          });
          setOverloadReasonsMap(normalizedMap);
        }
      } catch (e) {
        console.error('Failed to load overload reasons:', e);
      }
    };
    fetchReasons();
  }, [schoolInfo?.schoolYear, activeTermKey]);

  const handleToggleReasonForTeacher = async (personnelId, reasonName, currentReasons = []) => {
    const current = currentReasons.length > 0 ? currentReasons : (overloadReasonsMap[personnelId] || ['Teacher Shortage']);
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
          term: activeTermKey,
          reasons: updated
        });
      } catch (e) {
        console.error('Failed to save overload reason:', e);
      }
    }
  };

  // === DIRECT API FETCH: get fresh personnel+workload from the server every time ===
  const [freshPersonnel, setFreshPersonnel] = useState([]);
  const [freshLoading, setFreshLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const fetchedRef = useRef(false);

  const refreshOverloadData = () => setRefreshTrigger(t => t + 1);

  useEffect(() => {
    let cancelled = false;
    const loadFreshPersonnel = async () => {
      setFreshLoading(true);
      try {
        const data = await api.getPersonnel();
        if (!cancelled && Array.isArray(data)) {
          // Merge any localStorage drafts on top of DB records
          const merged = data.map(p => {
            try {
              const draftStr = localStorage.getItem(`draft_workload_${p.id}`);
              if (draftStr) {
                const draft = JSON.parse(draftStr);
                if (draft && Array.isArray(draft.workloadRows) && draft.workloadRows.length > 0) {
                  return { ...p, workloadRows: draft.workloadRows };
                }
              }
              const draftPersonStr = localStorage.getItem(`draft_personnel_${p.id}`);
              if (draftPersonStr) {
                const draftP = JSON.parse(draftPersonStr);
                if (draftP && Array.isArray(draftP.workloadRows) && draftP.workloadRows.length > 0) {
                  return { ...p, ...draftP, workloadRows: draftP.workloadRows };
                }
              }
            } catch (e) {}
            return p;
          });
          // Also include local-draft personnel from AppContext that are not yet in the DB
          const localDraftPersonnel = personnel.filter(p =>
            String(p.id || '').startsWith('local-') || String(p.id || '').startsWith('draft-')
          );
          const localWithDrafts = localDraftPersonnel.map(p => {
            try {
              const draftStr = localStorage.getItem(`draft_workload_${p.id}`);
              if (draftStr) {
                const draft = JSON.parse(draftStr);
                if (draft && Array.isArray(draft.workloadRows)) return { ...p, workloadRows: draft.workloadRows };
              }
            } catch (e) {}
            return p;
          });
          const allIds = new Set(merged.map(p => String(p.id)));
          const onlyLocal = localWithDrafts.filter(p => !allIds.has(String(p.id)));
          setFreshPersonnel([...merged, ...onlyLocal]);
        }
      } catch (err) {
        // Fallback to AppContext personnel if API fails
        if (!cancelled) setFreshPersonnel(personnel);
      } finally {
        if (!cancelled) setFreshLoading(false);
      }
    };
    loadFreshPersonnel();
    return () => { cancelled = true; };
  }, [refreshTrigger]);

  // Re-merge drafts when AppContext personnel changes (handles new local-draft additions)
  useEffect(() => {
    if (freshLoading) return;
    setFreshPersonnel(prev => {
      const localDraftPersonnel = personnel.filter(p =>
        String(p.id || '').startsWith('local-') || String(p.id || '').startsWith('draft-')
      );
      const existingIds = new Set(prev.map(p => String(p.id)));
      const newLocals = localDraftPersonnel.filter(p => !existingIds.has(String(p.id))).map(p => {
        try {
          const draftStr = localStorage.getItem(`draft_workload_${p.id}`);
          if (draftStr) {
            const draft = JSON.parse(draftStr);
            if (draft && Array.isArray(draft.workloadRows)) return { ...p, workloadRows: draft.workloadRows };
          }
        } catch (e) {}
        return p;
      });
      return [...prev, ...newLocals];
    });
  }, [personnel]);

  // Helper to determine eligibility for Teaching Overload (Strictly Teaching Personnel Only)
  const isStrictTeachingPersonnel = (p) => {
    if (!p || p.isDraft) return false;
    if (p.is_school_head || p.isSchoolHead) return false;

    // DepEd Rule: Overload Pay is processed ONLY at the Mother School (Plantilla holder)
    // Shared / Clustered personnel received from another school (isShared === true)
    // are liquidated by their mother school and must NOT appear in this school's Overload Payroll.
    if (p.isShared) {
      return false;
    }

    // Check position-based auto-categorization
    const autoType = detectPersonnelTypeFromPosition(p.position || p.plantilla_position || p.position_title || '') || p.type || 'teaching';
    const t = String(autoType).toLowerCase().trim();
    if (t !== 'teaching') return false;

    // Explicitly exclude leadership & non-teaching positions
    const pos = String(p.position || '').toUpperCase().trim();
    if (pos.startsWith('PRINCIPAL') || pos.startsWith('HEAD TEACHER') || pos.includes('DIRECTOR') || pos.includes('SUPERVISOR') || pos.includes('GUIDANCE')) {
      return false;
    }
    if (pos.includes('ADMINISTRATIVE') || pos.includes('BOOKKEEPER') || pos.includes('CLERK') || pos.includes('NURSE') || pos.includes('DRIVER') || pos.includes('UTILITY') || pos.includes('GUARD')) {
      return false;
    }

    return true;
  };

  // Use AppContext personnel (current school roster) as single source of truth
  const effectivePersonnel = (Array.isArray(personnel) && personnel.length > 0) ? personnel : freshPersonnel;

  // Filter strictly to TEACHING PERSONNEL ONLY across all steps, dropdowns, and views
  const activePersonnel = effectivePersonnel.filter(isStrictTeachingPersonnel);

  // Senior High School (SHS) Offering Detection
  const hasSHS = React.useMemo(() => {
    const offerings = (schoolInfo?.curricularOffering || []).map(o => String(o).toUpperCase());
    const eduLevels = (schoolInfo?.educationalLevels || []).map(o => String(o).toUpperCase());
    if (offerings.length > 0) {
      return offerings.some(o => o.includes('SHS') || o.includes('SENIOR') || o.includes('HIGH'));
    }
    if (eduLevels.length > 0) {
      return eduLevels.some(o => o.includes('SHS') || o.includes('SENIOR') || o.includes('HIGH'));
    }
    return activePersonnel.some(p => 
      p.teachesSeniorHigh || 
      (p.workloadRows || []).some(r => String(r.gradeLevel || '').includes('11') || String(r.gradeLevel || '').includes('12'))
    );
  }, [schoolInfo, activePersonnel]);

  // If SHS is not offered and user somehow lands on step 5, redirect to step 6 (Teaching Overload)
  useEffect(() => {
    if (!hasSHS && activeStep === 5) {
      setActiveStep(6);
    }
  }, [hasSHS, activeStep]);

  // Overload eligible personnel is strictly teaching personnel
  const overloadEligiblePersonnel = activePersonnel;

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

  // Helper to get weekdays in a quarter or term
  const getWeekdaysInQuarter = (code, yearString = 'SY 26-27') => {
    const termObj = ACADEMIC_TERMS.find(t => t.id === code);
    const fyObj = FY_QUARTERS.find(q => q.id === code);
    const monthNames = termObj ? termObj.months : (fyObj ? fyObj.months : ['June', 'July', 'August']);
    let allDates = [];
    monthNames.forEach(mName => {
      allDates = [...allDates, ...getWeekdaysInMonth(mName, yearString)];
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

  const normalizeDay = (d) => {
    const upper = String(d || '').toUpperCase().trim();
    if (upper === 'M' || upper.startsWith('MON')) return 'M';
    if (upper === 'T' || upper.startsWith('TUE')) return 'T';
    if (upper === 'W' || upper.startsWith('WED')) return 'W';
    if (upper === 'TH' || upper.startsWith('THU')) return 'TH';
    if (upper === 'F' || upper.startsWith('FRI')) return 'F';
    return null;
  };

  // freshPersonnel already has localStorage drafts merged, so this is now a passthrough
  const getEffectiveTeacher = (t) => t;

  const parseDaysArray = (daysInput) => {
    if (!daysInput) return [];
    if (Array.isArray(daysInput)) return daysInput;
    if (typeof daysInput === 'string') {
      const trimmed = daysInput.trim();
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed;
        } catch (e) {}
      }
      return trimmed.replace(/[\[\]"']/g, '').split(/[\s,]+/).filter(Boolean);
    }
    return [];
  };

  const matchesDay = (days, targetDayShort) => {
    const daysArr = parseDaysArray(days);
    if (daysArr.length === 0) return true;
    return daysArr.some(d => normalizeDay(d) === targetDayShort);
  };

  // Main overload calculator logic
  const calculateOverloadForTeacher = (rawTeacher, dates) => {
    const teacher = getEffectiveTeacher(rawTeacher);
    let grossOverloadTotal = 0;
    let deductionTotal = 0;
    let leaveDeductionTotal = 0;
    let lateDeductionTotal = 0;
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

      // Check if date is a declared local holiday or suspension
      const isLocalHolidayOrSuspension = (localNonWorkingDays || []).some(d => d.date === dateStr);
      if (isLocalHolidayOrSuspension) {
        return; // No teaching load / overload pay on holidays or suspensions
      }
      
      // Helper: normalize teacher IDs for robust matching (id, prn, personnel_id, employee_no)
      const teacherIds = [
        String(teacher.id || '').trim(),
        String(teacher.prn || '').trim(),
        String(teacher.personnelId || '').trim(),
        String(teacher.personnel_id || '').trim(),
        String(teacher.employeeNo || '').trim(),
        String(teacher.employee_no || '').trim()
      ].filter(Boolean);

      // Check for full-day absence / leave on this date
      const isAbsent = absences.some(a => {
        const targetPId = String(a.personnelId || a.personnel_id || '').trim();
        if (!teacherIds.includes(targetPId)) return false;

        const lType = a.leaveType || a.leave_type || '';
        if (lType.includes('Late') || lType.includes('Tardiness')) return false;

        const sStr = a.startDate || a.start_date || a.absenceDate || a.absence_date || '';
        const eStr = a.endDate || a.end_date || sStr;
        const cleanStart = String(sStr).includes('T') ? String(sStr).split('T')[0] : String(sStr).trim();
        const cleanEnd = String(eStr).includes('T') ? String(eStr).split('T')[0] : (cleanStart || String(eStr).trim());

        return dateStr >= cleanStart && dateStr <= cleanEnd;
      });

      // Check for tardiness / late on this date (ineligible for overload pay on late days)
      const isLate = absences.some(a => {
        const targetPId = String(a.personnelId || a.personnel_id || '').trim();
        if (!teacherIds.includes(targetPId)) return false;

        const lType = a.leaveType || a.leave_type || '';
        if (!lType.includes('Late') && !lType.includes('Tardiness')) return false;

        const sStr = a.startDate || a.start_date || a.absenceDate || a.absence_date || '';
        const eStr = a.endDate || a.end_date || sStr;
        const cleanStart = String(sStr).includes('T') ? String(sStr).split('T')[0] : String(sStr).trim();
        const cleanEnd = String(eStr).includes('T') ? String(eStr).split('T')[0] : (cleanStart || String(eStr).trim());

        return dateStr >= cleanStart && dateStr <= cleanEnd;
      });

      // 1. Process base scheduled workload rows (regular timetable + clustered partner school workload)
      let baseScheduledMinutes = 0;
      const currentSy = schoolInfo?.schoolYear || 'SY 26-27';
      const isTeacherClustered = teacher.isClustered || teacher.deploymentStatus === 'CLUSTERED';
      const allRows = [
        ...(teacher.workloadRows || []),
        ...(isTeacherClustered && Array.isArray(teacher.sharedWorkloadRows) ? teacher.sharedWorkloadRows : [])
      ];
      const currentYearWorkloads = allRows.filter(row => {
        const rowSy = row.schoolYear || row.school_year;
        return !rowSy || rowSy === currentSy || (rowSy && currentSy && rowSy.replace(/\s+/g, '') === currentSy.replace(/\s+/g, ''));
      });

      currentYearWorkloads.forEach(row => {
        if (matchesDay(row.days, dayShort)) {
          const sTime = row.startTime || row.start_time;
          const eTime = row.endTime || row.end_time;
          const subName = String(row.subject || row.subject_name || row.task || '').toUpperCase().trim();

          if (subName === 'HGP') {
            // HGP is stored for tracking program duration only and does not add extra teaching load minutes
          } else if (subName === 'ADVISORY') {
            baseScheduledMinutes += 60;
          } else {
            baseScheduledMinutes += Math.max(0, timeToMins(eTime) - timeToMins(sTime));
          }
        }
      });

      // Base daily scheduled hours and daily overload
      const baseDailyHours = baseScheduledMinutes / 60;
      const baseDailyOverload = Math.max(0, baseDailyHours - 6.0);

      // 2. Extra minutes if this teacher served as a substitute for someone else on this date
      let substituteMinutes = 0;
      workloadTransfers.forEach(t => {
        const subId = String(t.substituteTeacherId || t.substitute_personnel_id || t.substitute_teacher_id || '').trim();
        const cleanStart = String(t.startDate || '').split('T')[0].trim();
        const cleanEnd = String(t.endDate || cleanStart).split('T')[0].trim();

        if (teacherIds.includes(subId) && t.status !== 'ended' && dateStr >= cleanStart && dateStr <= cleanEnd) {
          (t.workloadRows || []).forEach(row => {
            if (matchesDay(row.days, dayShort)) {
              const sTime = row.startTime || row.start_time;
              const eTime = row.endTime || row.end_time;
              const subName = String(row.subject || row.subject_name || row.task || '').toUpperCase().trim();

              if (subName === 'HGP') {
                // HGP does not add extra teaching load minutes
              } else if (subName === 'ADVISORY') {
                substituteMinutes += 60;
              } else {
                substituteMinutes += Math.max(0, timeToMins(eTime) - timeToMins(sTime));
              }
            }
          });
        }
      });

      // 3. Process Work Immersion for this teacher on this date if recorded
      const immersionMins = (workImmersionTeacherId && teacherIds.includes(String(workImmersionTeacherId)) && workImmersionData[dateStr])
        ? workImmersionData[dateStr]
        : 0;

      // If teacher is absent or late, their scheduled overload for this day is forfeited / deducted
      if (baseDailyOverload > 0) {
        grossOverloadTotal += baseDailyOverload;
        if (isAbsent || isLate) {
          deductionTotal += baseDailyOverload;
          if (isAbsent) leaveDeductionTotal += baseDailyOverload;
          if (isLate) lateDeductionTotal += baseDailyOverload;
        } else {
          netOverloadTotal += baseDailyOverload;
        }
      }

      // Add extra overload earned from substitute teaching or work immersion on this day (only if teacher wasn't absent)
      if (!isAbsent) {
        const extraHours = (substituteMinutes + immersionMins) / 60;
        if (extraHours > 0) {
          const effectiveExtraOverload = Math.max(0, ((baseScheduledMinutes + substituteMinutes + immersionMins) / 60) - 6.0) - baseDailyOverload;
          if (effectiveExtraOverload > 0) {
            grossOverloadTotal += effectiveExtraOverload;
            netOverloadTotal += effectiveExtraOverload;
          }
        }
      }
    });

    return {
      gross: Math.round(grossOverloadTotal * 100) / 100,
      deductions: Math.round(deductionTotal * 100) / 100,
      leaveDeductions: Math.round(leaveDeductionTotal * 100) / 100,
      lateDeductions: Math.round(lateDeductionTotal * 100) / 100,
      net: Math.round(netOverloadTotal * 100) / 100
    };
  };

  // Dynamic active months based on active filterMode
  const activeTermObj = ACADEMIC_TERMS.find(t => t.id === selectedTerm) || ACADEMIC_TERMS[0];
  const activeFYObj = FY_QUARTERS.find(q => q.id === selectedFY) || FY_QUARTERS[2];
  const activeMonths = filterMode === 'term' ? activeTermObj.months : activeFYObj.months;
  const activePeriodLabel = filterMode === 'term' ? activeTermObj.label : activeFYObj.label;

  // Compute stats for all active teachers
  const syYear = schoolInfo?.schoolYear || 'SY 26-27';
  const monthDates = getWeekdaysInMonth(selectedMonth, syYear);
  const quarterDates = getWeekdaysInQuarter(selectedQuarter, syYear);

  const overloadRoster = overloadEligiblePersonnel.map(rawTeacher => {
    const teacher = getEffectiveTeacher(rawTeacher);
    // Base weekly overload (no absences/transfers considered, pure schedule check)
    let weeklyOverload = 0;
    const dailyLoads = { M: 0, T: 0, W: 0, TH: 0, F: 0 };
    
    const currentYearWorkloads = (teacher.workloadRows || []).filter(row => {
      const rowSy = row.schoolYear || row.school_year;
      return !rowSy || rowSy === syYear || (rowSy && syYear && rowSy.replace(/\s+/g, '') === syYear.replace(/\s+/g, ''));
    });
    currentYearWorkloads.forEach(row => {
      if (row.days) {
        const daysArr = parseDaysArray(row.days);
        const sTime = row.startTime || row.start_time;
        const eTime = row.endTime || row.end_time;
        const subName = String(row.subject || row.subject_name || row.task || '').toUpperCase().trim();

        daysArr.forEach(day => {
          const key = normalizeDay(day);
          if (key && dailyLoads[key] !== undefined) {
            if (subName === 'HGP') {
              // HGP does not add extra teaching load minutes
            } else if (subName === 'ADVISORY') {
              dailyLoads[key] += 60;
            } else {
              dailyLoads[key] += Math.max(0, timeToMins(eTime) - timeToMins(sTime));
            }
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

    // Compute stats for each month in activeMonths
    const monthlyStatsMap = {};
    let totalGross = 0;
    let totalDeductions = 0;
    let totalLeaveDeductions = 0;
    let totalLateDeductions = 0;
    let totalNet = 0;

    activeMonths.forEach(mName => {
      const dates = getWeekdaysInMonth(mName, syYear);
      const stats = calculateOverloadForTeacher(teacher, dates);
      monthlyStatsMap[mName] = stats;
      totalGross += stats.gross;
      totalDeductions += stats.deductions;
      totalLeaveDeductions += stats.leaveDeductions;
      totalLateDeductions += stats.lateDeductions;
      totalNet += stats.net;
    });

    const totalStats = {
      gross: Math.round(totalGross * 100) / 100,
      deductions: Math.round(totalDeductions * 100) / 100,
      leaveDeductions: Math.round(totalLeaveDeductions * 100) / 100,
      lateDeductions: Math.round(totalLateDeductions * 100) / 100,
      net: Math.round(totalNet * 100) / 100
    };

    const phtr = calculatePHTR(teacher);
    const overloadPay = Math.round(totalStats.net * phtr * 100) / 100;
    const monthStats = monthlyStatsMap[selectedMonth] || calculateOverloadForTeacher(teacher, monthDates);
    const quarterStats = totalStats;

    return {
      teacher,
      dailyOverloads,
      weeklyOverload: Math.round(weeklyOverload * 100) / 100,
      monthlyStatsMap,
      totalStats,
      monthStats,
      quarterStats,
      phtr,
      overloadPay
    };
  });
  // Step 6: Filter to ONLY include teachers who have actual computed overload (> 0 hours)
  const filteredRoster = overloadRoster.filter(item => {
    const hasOverload = Number(item.totalStats?.net || 0) > 0 || Object.values(item.monthlyStatsMap).some(s => Number(s.net || 0) > 0) || Number(item.weeklyOverload || 0) > 0;
    if (!hasOverload) return false;

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

    const teacher = activePersonnel.find(p => p.id === tardinessTeacherId);
    const tardyTeacherIds = [
      String(tardinessTeacherId || '').trim(),
      String(teacher?.prn || '').trim(),
      String(teacher?.personnelId || '').trim(),
      String(teacher?.personnel_id || '').trim()
    ].filter(Boolean);
    const teacherAbsences = absences.filter(a => tardyTeacherIds.includes(String(a.personnelId || a.personnel_id || '').trim()));
    let hasConflict = false;
    let conflictDate = '';

    let cur = new Date(tardinessStartDate);
    const end = new Date(tardinessEndDate);
    while (cur <= end) {
      const dStr = getLocalDateString(cur);
      if (teacherAbsences.some(a => {
        const sStr = a.startDate || a.start_date || a.absenceDate || a.absence_date || '';
        const eStr = a.endDate || a.end_date || sStr;
        const cleanStart = String(sStr).includes('T') ? String(sStr).split('T')[0] : String(sStr).trim();
        const cleanEnd = String(eStr).includes('T') ? String(eStr).split('T')[0] : (cleanStart || String(eStr).trim());
        return dStr >= cleanStart && dStr <= cleanEnd;
      })) {
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
    const absTeacher = activePersonnel.find(p => p.id === absentTeacherId);
    const absTeacherIds = [
      String(absentTeacherId || '').trim(),
      String(absTeacher?.prn || '').trim(),
      String(absTeacher?.personnelId || '').trim(),
      String(absTeacher?.personnel_id || '').trim()
    ].filter(Boolean);
    const teacherAbsences = absences.filter(a => absTeacherIds.includes(String(a.personnelId || a.personnel_id || '').trim()));
    let hasConflict = false;
    let conflictDate = '';

    let cur = new Date(absenceStartDate);
    const end = new Date(absenceEndDate);
    while (cur <= end) {
      const dStr = getLocalDateString(cur);
      if (teacherAbsences.some(a => {
        const sStr = a.startDate || a.start_date || a.absenceDate || a.absence_date || '';
        const eStr = a.endDate || a.end_date || sStr;
        const cleanStart = String(sStr).includes('T') ? String(sStr).split('T')[0] : String(sStr).trim();
        const cleanEnd = String(eStr).includes('T') ? String(eStr).split('T')[0] : (cleanStart || String(eStr).trim());
        return dStr >= cleanStart && dStr <= cleanEnd;
      })) {
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
      const conflict = checkSubstituteConflict(subTeacher, slot, transferStartDate, transferEndDate);
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

    const monthNames = activeMonths;

    // Generate simple print page window
    const printWindow = window.open('', '_blank');
    
    const tableRows = filteredRoster.map((item, index) => {
      const teacher = item.teacher;
      const monthlyWeeklyMinutes = []; 
      let totalMinutes = 0;
      
      monthNames.forEach(mName => {
        const mDates = getWeekdaysInMonth(mName, syYear);
        let w1 = 0, w2 = 0, w3 = 0, w4 = 0;
        
        mDates.forEach(date => {
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

    const totalOverloadCols = monthNames.length * 4;
    const totalTableCols = 3 + totalOverloadCols + 4;

    const monthHeaders = monthNames.map(mName => 
      `<th colspan="4" style="border: 1px solid #475569; padding: 4px; text-align: center; font-weight: bold;">${mName}</th>`
    ).join('');

    const weekHeaders = monthNames.map(() => 
      `<th style="border: 1px solid #475569; padding: 3px; text-align: center;">W1</th>
       <th style="border: 1px solid #475569; padding: 3px; text-align: center;">W2</th>
       <th style="border: 1px solid #475569; padding: 3px; text-align: center;">W3</th>
       <th style="border: 1px solid #475569; padding: 3px; text-align: center;">W4</th>`
    ).join('');

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
            <div style="margin-top: 5px; font-weight: bold;">Period: ${activePeriodLabel} | Calendar Mode: ${filterMode === 'term' ? 'Academic Term' : 'Fiscal Year (FY) Quarter'}</div>
          </div>
          
          <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #475569; font-size: 11px; margin-top: 15px;">
            <thead>
              <tr style="background-color: #f1f5f9;">
                <th rowspan="3" style="border: 1px solid #475569; padding: 8px 4px; text-align: center;">No.</th>
                <th rowspan="3" style="border: 1px solid #475569; padding: 8px 4px; text-align: left; min-width: 140px;">Name of Teacher</th>
                <th rowspan="3" style="border: 1px solid #475569; padding: 8px 4px; text-align: left; min-width: 100px;">Position</th>
                <th colspan="${totalOverloadCols}" style="border: 1px solid #475569; padding: 6px; text-align: center; font-weight: bold;">Teaching Overload (in minutes)</th>
                <th rowspan="3" style="border: 1px solid #475569; padding: 6px; text-align: center; font-weight: bold;">Total<br>(in minutes)</th>
                <th rowspan="3" style="border: 1px solid #475569; padding: 6px; text-align: center; font-weight: bold;">Total<br>(in hours)</th>
                <th rowspan="3" style="border: 1px solid #475569; padding: 6px; text-align: center; font-weight: bold; min-width: 90px;">Estimated Overload Pay<br>(in ₱)</th>
                <th rowspan="3" style="border: 1px solid #475569; padding: 6px; text-align: center; font-weight: bold; min-width: 110px;">Reasons for Teaching Overload</th>
              </tr>
              <tr style="background-color: #f1f5f9;">
                ${monthHeaders}
              </tr>
              <tr style="background-color: #f8fafc; font-size: 9px;">
                ${weekHeaders}
              </tr>
            </thead>
            <tbody>
              ${tableRows.length > 0 ? tableRows : `<tr><td colspan="${totalTableCols}" style="text-align:center; padding:20px; border: 1px solid #475569; color: #64748b;">No eligible teachers found with teaching overload.</td></tr>`}
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
      <PortalHeader
        title="Teaching Overload Pay Calculator"
        description="Calculate teaching overload hours, non-working days, tardiness deductions, and overload pay."
        onBack={() => setActiveView('dashboard')}
      />


      {/* Dynamic Wizard Navigation Stepper */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${hasSHS ? 6 : 5}, 1fr)`, gap: '12px', marginBottom: '8px' }}>
        {[
          { id: 1, label: 'Calendar', icon: <FiCalendar size={14} /> },
          { id: 2, label: 'Absences', icon: <FiUserX size={14} /> },
          { id: 3, label: 'Tardiness Log', icon: <FiClock size={14} /> },
          { id: 4, label: 'Workload Transfers', icon: <FiRepeat size={14} /> },
          ...(hasSHS ? [{ id: 5, label: 'Work Immersion (SHS)', icon: <FiBriefcase size={14} /> }] : []),
          { id: 6, label: 'Teaching Overload', icon: <FiTrendingUp size={14} /> }
        ].map((step, idx) => {
          const isActive = activeStep === step.id;
          return (
            <button
              key={step.id}
              onClick={() => setActiveStep(step.id)}
              style={{
                padding: '14px 18px',
                borderRadius: '14px',
                border: '2px solid',
                borderColor: isActive ? 'var(--blue)' : 'var(--line)',
                background: isActive ? 'linear-gradient(180deg, var(--blue-50), #fff)' : 'white',
                color: isActive ? 'var(--navy)' : 'var(--muted)',
                fontWeight: 'bold',
                textAlign: 'left',
                cursor: 'pointer',
                boxShadow: isActive ? '0 4px 12px rgba(14, 116, 144, 0.12)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8 }}>
                Step {idx + 1}
              </div>
              <div style={{ fontSize: '14px', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {step.icon} {step.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* STEP 1: School Calendar & Suspensions */}
      {activeStep === 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: '440px 1fr', gap: '20px' }}>
          {/* Interactive Calendar Selector Card */}
          <article className="card" style={{ height: 'fit-content' }}>
            <div className="card-inner" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}><FiCalendar size={16} /> Interactive School Calendar Picker</h2>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0 }}>Select a month and click any weekday below to select dates for holidays or class suspensions.</p>

              {/* Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>SELECT MONTH</label>
                  <select 
                    value={step1Month}
                    onChange={(e) => setStep1Month(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid var(--line)', background: 'white', fontWeight: 'bold', fontSize: '13px' }}
                  >
                    {MONTHS_LIST.map(m => (
                      <option key={m.name} value={m.name}>{m.name} ({m.quarter})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '11px', background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#1e40af', fontWeight: 'bold' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#dbeafe', border: '1px solid #60a5fa' }}></span> Nat'l Holiday
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b45309', fontWeight: 'bold' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#fef08a', border: '1px solid #eab308' }}></span> Local Holiday
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b91c1c', fontWeight: 'bold' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#fee2e2', border: '1px solid #fca5a5' }}></span> Suspension
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#475569', fontWeight: 'bold' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#f1f5f9', border: '1px solid #cbd5e1' }}></span> Non-Instructional
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--muted)' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'white', border: '1px solid var(--line)' }}></span> Workday
                </span>
              </div>

              {/* Interactive Calendar Grid */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--navy)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{step1Month} 2026 Workdays Calendar</span>
                  <small style={{ color: 'var(--muted)', fontWeight: 'normal' }}>Click date to select</small>
                </div>

                {/* Calendar Grid (5 Weekdays) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
                    <div key={day} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', padding: '4px', background: '#e2e8f0', borderRadius: '4px' }}>
                      {day}
                    </div>
                  ))}
                  {(() => {
                    const monthDates = getWeekdaysInMonth(step1Month, 'SY 26-27');

                    return monthDates.map((dateObj, idx) => {
                      const dateStr = getLocalDateString(dateObj);
                      const dayNum = dateObj.getDate();
                      
                      const existingHoliday = (localNonWorkingDays || []).find(h => h.date === dateStr);
                      const nonInstructionalRange = NON_INSTRUCTIONAL_RANGES.find(r => dateStr >= r.start && dateStr <= r.end);
                      
                      const isSelected = holidayDate === dateStr;
                      const isNationalHoliday = existingHoliday && existingHoliday.type === 'National Holiday';
                      const isSuspension = existingHoliday && existingHoliday.type === 'Class Suspension';
                      const isLocalHoliday = existingHoliday && existingHoliday.type === 'Local Holiday';
                      const isNonInstructional = !existingHoliday && nonInstructionalRange;

                      let bg = 'white';
                      let border = '1.5px solid var(--line)';
                      let color = 'var(--navy)';
                      let badgeText = '';

                      if (isSelected) {
                        bg = '#eff6ff';
                        border = '2px solid var(--blue)';
                        color = 'var(--navy)';
                        badgeText = 'SELECTED';
                      } else if (isNationalHoliday) {
                        bg = '#dbeafe';
                        border = '1.5px solid #60a5fa';
                        color = '#1e40af';
                        badgeText = "🇵🇭 NAT'L HOLIDAY";
                      } else if (isSuspension) {
                        bg = '#fee2e2';
                        border = '1.5px solid #fca5a5';
                        color = '#991b1b';
                        badgeText = '⚠️ SUSPENSION';
                      } else if (isLocalHoliday) {
                        bg = '#fef08a';
                        border = '1.5px solid #eab308';
                        color = '#854d0e';
                        badgeText = '🌴 LOCAL HOLIDAY';
                      } else if (isNonInstructional) {
                        bg = '#f1f5f9';
                        border = '1.5px solid #cbd5e1';
                        color = '#475569';
                        badgeText = '🛑 NO OVERLOAD';
                      }

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setHolidayDate(dateStr);
                            if (existingHoliday) {
                              setHolidayType(existingHoliday.type || 'Local Holiday');
                              setHolidayDesc(existingHoliday.description || '');
                            } else {
                              setHolidayType('Local Holiday');
                              setHolidayDesc('');
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
                            boxShadow: isSelected ? '0 2px 8px rgba(14, 116, 144, 0.25)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span style={{ fontSize: '15px' }}>{dayNum}</span>
                          <span style={{ fontSize: '9px', textTransform: 'uppercase', marginTop: '2px', fontWeight: '800' }}>
                            {badgeText || 'Workday'}
                          </span>
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          </article>

          {/* Form & Holidays / Suspensions Table Card */}
          <article className="card">
            <div className="card-inner" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)', margin: 0 }}>📅 Add / Manage Holidays & Suspensions</h2>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    className="btn secondary"
                    onClick={handleResetDefaultHolidays}
                    style={{ fontSize: '11px', padding: '6px 12px', background: '#eff6ff', border: '1px solid #93c5fd', color: '#1e40af', fontWeight: 'bold' }}
                    title="Restore standard Philippine national holidays"
                  >
                    🇵🇭 Restore PH Holidays
                  </button>
                  <button 
                    className="btn" 
                    onClick={() => setActiveStep(2)}
                    style={{ background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white', fontSize: '12px', padding: '6px 14px' }}
                  >
                    Proceed to Step 2: Absences & Leave →
                  </button>
                </div>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0 }}>Define national or local holidays and class suspensions. Teachers do not earn overload pay on these dates.</p>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: '10px', alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>DATE</label>
                  <input type="date" value={holidayDate} onChange={e => setHolidayDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid var(--line)', background: 'white' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>TYPE</label>
                  <select value={holidayType} onChange={e => setHolidayType(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid var(--line)', background: 'white', fontWeight: 'bold', fontSize: '13px' }}>
                    <option value="National Holiday">National Holiday</option>
                    <option value="Local Holiday">Local Holiday</option>
                    <option value="Class Suspension">Class Suspension</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>DESCRIPTION</label>
                  <input type="text" placeholder="e.g. Independence Day, Typhoon Carina" value={holidayDesc} onChange={e => setHolidayDesc(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid var(--line)', background: 'white', fontSize: '13px' }} />
                </div>
                <button onClick={handleAddHoliday} className="btn primary" style={{ height: '40px', padding: '0 24px' }}>+ Save</button>
              </div>

              {localNonWorkingDays && localNonWorkingDays.length > 0 ? (
                <div style={{ marginTop: '10px', border: '1px solid var(--line)', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead style={{ background: '#F8FAFC' }}>
                      <tr>
                        <th style={{ padding: '10px', textAlign: 'left', color: 'var(--navy)' }}>Date</th>
                        <th style={{ padding: '10px', textAlign: 'left', color: 'var(--navy)' }}>Type</th>
                        <th style={{ padding: '10px', textAlign: 'left', color: 'var(--navy)' }}>Description</th>
                        <th style={{ padding: '10px', textAlign: 'right', color: 'var(--navy)' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {localNonWorkingDays.map(h => {
                        let tagBg = '#fef08a';
                        let tagColor = '#b45309';
                        if (h.type === 'National Holiday') {
                          tagBg = '#dbeafe';
                          tagColor = '#1e40af';
                        } else if (h.type === 'Class Suspension') {
                          tagBg = '#fee2e2';
                          tagColor = '#b91c1c';
                        }

                        return (
                          <tr key={h.id} style={{ borderTop: '1px solid var(--line)' }}>
                            <td style={{ padding: '10px', fontWeight: 'bold' }}>{h.date}</td>
                            <td style={{ padding: '10px' }}>
                              <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', background: tagBg, color: tagColor }}>
                                {h.type}
                              </span>
                            </td>
                            <td style={{ padding: '10px' }}>{h.description}</td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>
                              <button onClick={() => handleRemoveHoliday(h.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Remove</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 10px', background: '#F8FAFC', borderRadius: '12px', border: '1.5px dashed var(--line)', color: 'var(--muted)', fontSize: '13px' }}>
                  No holidays or suspensions logged yet. Select dates on the calendar to add entries.
                </div>
              )}
            </div>
          </article>
        </div>
      )}

      {/* STEP 3: Tardiness & Late Log */}
      {activeStep === 3 && (
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
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#fee2e2', border: '1px solid #fca5a5' }}></span> Tardy / Late
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b45309', fontWeight: 'bold' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#fef3c7', border: '1px solid #fde68a' }}></span> Leave
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--muted)' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'white', border: '1px solid var(--line)' }}></span> Regular
                </span>
              </div>

              {/* Interactive Calendar Grid */}
              {!tardinessTeacherId ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', background: '#F8FAFC', borderRadius: '12px', border: '1.5px dashed var(--line)', color: 'var(--muted)', fontSize: '13px' }}>
                  Please select a teacher above to enable the interactive calendar picker.
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
                      const teacher = activePersonnel.find(p => p.id === tardinessTeacherId);
                      const tardyTeacherIds = [
                        String(tardinessTeacherId || '').trim(),
                        String(teacher?.prn || '').trim(),
                        String(teacher?.personnelId || '').trim(),
                        String(teacher?.personnel_id || '').trim()
                      ].filter(Boolean);
                      const teacherAbsences = absences.filter(a => tardyTeacherIds.includes(String(a.personnelId || a.personnel_id || '').trim()));

                      return monthDates.map((dateObj, idx) => {
                        const dateStr = getLocalDateString(dateObj);
                        const dayNum = dateObj.getDate();
                        const existingLog = teacherAbsences.find(a => {
                          const sStr = a.startDate || a.start_date || a.absenceDate || a.absence_date || '';
                          const eStr = a.endDate || a.end_date || sStr;
                          const cleanStart = String(sStr).includes('T') ? String(sStr).split('T')[0] : String(sStr).trim();
                          const cleanEnd = String(eStr).includes('T') ? String(eStr).split('T')[0] : (cleanStart || String(eStr).trim());
                          return dateStr >= cleanStart && dateStr <= cleanEnd;
                        });
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
                          badgeText = 'LATE';
                        } else if (isLeave) {
                          bg = '#fee2e2';
                          border = '2px solid #ef4444';
                          color = '#991b1b';
                          badgeText = 'ABSENT';
                        }

                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={async () => {
                              if (isLeave) {
                                const leaveName = existingLog?.leaveType || existingLog?.leave_type || 'Leave';
                                await showAlert("Action Blocked", `This teacher is already logged as ABSENT (${leaveName}) on ${dateStr} in Step 1. Tardiness cannot be logged for absent days.`);
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
                              cursor: isLeave ? 'not-allowed' : 'pointer',
                              opacity: isLeave ? 0.75 : 1,
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
                  onClick={() => setActiveStep(4)}
                  style={{ background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white', fontSize: '12px', padding: '6px 14px' }}
                >
                  Proceed to Step 4: Workload Transfers →
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
                              style={{ padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <FiTrash2 size={12} /> Remove
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
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}><FiCalendar size={16} /> Interactive Leave Range Picker</h2>
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
                    <option value="Official Business (OB)">Official Business (OB) / Training</option>
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px', background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b45309', fontWeight: 'bold' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#fef08a', border: '1px solid #eab308' }}></span> Selected Range
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#1e40af', fontWeight: 'bold' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#dbeafe', border: '1px solid #60a5fa' }}></span> OB / Training
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b91c1c', fontWeight: 'bold' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#fee2e2', border: '1px solid #fca5a5' }}></span> Tardy
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--muted)' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'white', border: '1px solid var(--line)' }}></span> Available
                </span>
              </div>

              {/* Interactive Calendar Range Grid */}
              {!absentTeacherId ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', background: '#F8FAFC', borderRadius: '12px', border: '1.5px dashed var(--line)', color: 'var(--muted)', fontSize: '13px' }}>
                  Please select a teacher above to enable the interactive calendar range picker.
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
                      const teacher = activePersonnel.find(p => p.id === absentTeacherId);
                      const absTeacherIds = [
                        String(absentTeacherId || '').trim(),
                        String(teacher?.prn || '').trim(),
                        String(teacher?.personnelId || '').trim(),
                        String(teacher?.personnel_id || '').trim()
                      ].filter(Boolean);
                      const teacherAbsences = absences.filter(a => absTeacherIds.includes(String(a.personnelId || a.personnel_id || '').trim()));

                      return monthDates.map((dateObj, idx) => {
                        const dateStr = getLocalDateString(dateObj);
                        const dayNum = dateObj.getDate();
                        const existingLog = teacherAbsences.find(a => {
                          const sStr = a.startDate || a.start_date || a.absenceDate || a.absence_date || '';
                          const eStr = a.endDate || a.end_date || sStr;
                          const cleanStart = String(sStr).includes('T') ? String(sStr).split('T')[0] : String(sStr).trim();
                          const cleanEnd = String(eStr).includes('T') ? String(eStr).split('T')[0] : (cleanStart || String(eStr).trim());
                          return dateStr >= cleanStart && dateStr <= cleanEnd;
                        });
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
                          const isOB = lType.includes('Official Business') || lType.includes('OB') || lType.includes('Training');
                          if (isOB) {
                            bg = '#dbeafe';
                            border = '1.5px solid #60a5fa';
                            color = '#1e40af';
                            badgeText = 'OB / TRN';
                          } else {
                            bg = '#fef3c7';
                            border = '1.5px solid #fde68a';
                            color = '#92400e';
                            badgeText = (lType.split(' ')[0].toUpperCase());
                          }
                        } else if (isTardy) {
                          bg = '#fee2e2';
                          border = '1.5px solid #fca5a5';
                          color = '#991b1b';
                          badgeText = 'LATE';
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
                  Proceed to Step 3: Tardiness Log →
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--line)', background: '#F8FAFC' }}>
                      <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Teacher Name</th>
                      <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Date / Duration</th>
                      <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Total Days</th>
                      <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Leave Type</th>
                      <th style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 'bold', color: 'var(--navy)', width: '90px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const nonTardyAbsences = absences.filter(abs => {
                        const lType = abs.leaveType || abs.leave_type || '';
                        return !lType.includes('Late') && !lType.includes('Tardiness');
                      });

                      if (nonTardyAbsences.length === 0) {
                        return (
                          <tr>
                            <td colSpan="5" style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)' }}>
                              No absences logged yet.
                            </td>
                          </tr>
                        );
                      }

                      return nonTardyAbsences.map((abs, idx) => {
                        const pId = String(abs.personnelId || abs.personnel_id || '');
                        const teacher = activePersonnel.find(p => String(p.id) === pId);
                        const teacherName = teacher ? `${teacher.lastName}, ${teacher.firstName}` : 'Unknown Teacher';
                        const sDate = abs.startDate || abs.start_date || abs.absenceDate || abs.absence_date || '';
                        const eDate = abs.endDate || abs.end_date || sDate;
                        const lType = abs.leaveType || abs.leave_type || '';

                        const calcDays = () => {
                          if (!sDate) return 1;
                          if (!eDate || sDate === eDate) return 1;
                          const d1 = new Date(sDate);
                          const d2 = new Date(eDate);
                          let count = 0;
                          let cur = new Date(d1);
                          while (cur <= d2) {
                            count++;
                            cur.setDate(cur.getDate() + 1);
                          }
                          return count || 1;
                        };
                        const dayCount = calcDays();
                        const dateRangeStr = (!eDate || sDate === eDate) ? sDate : `${sDate} – ${eDate}`;

                        return (
                          <tr key={abs.id || idx} style={{ borderBottom: '1px solid var(--line)' }}>
                            <td style={{ padding: '12px 10px', fontWeight: 'bold', color: 'var(--navy)' }}>{teacherName}</td>
                            <td style={{ padding: '12px 10px', fontWeight: '600' }}>{dateRangeStr}</td>
                            <td style={{ padding: '12px 10px' }}>
                              <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                                {dayCount} {dayCount === 1 ? 'Day' : 'Days'}
                              </span>
                            </td>
                            <td style={{ padding: '12px 10px' }}>
                              {(() => {
                                const isOB = lType.includes('Official Business') || lType.includes('OB') || lType.includes('Training');
                                return (
                                  <span style={{ 
                                    background: isOB ? '#dbeafe' : '#fef3c7', 
                                    color: isOB ? '#1e40af' : '#b45309', 
                                    padding: '3px 8px', 
                                    borderRadius: '6px', 
                                    fontSize: '11px', 
                                    fontWeight: 'bold' 
                                  }}>
                                    {lType}
                                  </span>
                                );
                              })()}
                            </td>
                            <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                              <button
                                className="btn danger"
                                onClick={async () => {
                                  if (await showConfirm("Remove Leave Log?", `Remove this ${lType} log (${dateRangeStr}) for ${teacherName}?`)) {
                                    await removePersonnelAbsence(abs.id);
                                  }
                                }}
                                style={{ padding: '4px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                <FiTrash2 size={12} /> Remove
                              </button>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </article>
        </div>
      )}

      {/* STEP 4: Workload Transfers */}
      {activeStep === 4 && (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '20px' }}>
          {/* Create Transfer Form */}
          <article className="card" style={{ height: 'fit-content' }}>
            <div className="card-inner" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)', margin: 0 }}>Create Workload Transfer</h2>
              <form onSubmit={handleCreateTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>ABSENT TEACHER (WITH RECORDED ABSENCES)</label>
                  {personnelWithAbsences.length === 0 ? (
                    <div style={{ padding: '10px 12px', background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: '8px', color: '#B45309', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FiAlertCircle size={14} /> No teachers with recorded absences found. Please log an absence in Step 2 first.
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
                                  const conflictInfo = checkSubstituteConflict(p, row, transferStartDate, transferEndDate, idx, selectedTransferSlots, slots);
                                  return (
                                    <option 
                                      key={p.id} 
                                      value={p.id} 
                                      disabled={conflictInfo.hasConflict}
                                      style={{ color: conflictInfo.hasConflict ? '#b91c1c' : '#15803d' }}
                                    >
                                      {conflictInfo.hasConflict 
                                        ? `[CONFLICT] ${p.lastName}, ${p.firstName} (${p.position}) — ${conflictInfo.conflictingSubject} (${conflictInfo.conflictingTime})`
                                        : `[AVAILABLE] ${p.lastName}, ${p.firstName} (${p.position})`
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

                {/* Logged Absence Record Cards Selection for Transfer Dates (Option 1) */}
                <div style={{ marginTop: '4px', background: '#F8FAFC', padding: '14px', borderRadius: '12px', border: '1.5px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--navy)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FiCalendar size={13} />
                      <span>Select Logged Absence Period to Transfer</span>
                      <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    {transferAbsentTeacherId && (
                      <span style={{ fontSize: '10px', color: '#64748B', fontWeight: '700' }}>
                        Step 2 Synced Leave Records
                      </span>
                    )}
                  </div>

                  {!transferAbsentTeacherId ? (
                    <div style={{ padding: '16px', background: '#FFFFFF', borderRadius: '10px', border: '1.5px dashed #CBD5E1', textAlign: 'center', fontSize: '12px', color: '#64748B' }}>
                      Please select an absent teacher above to view their recorded absence periods.
                    </div>
                  ) : (() => {
                    const teacherAbsenceRecords = absences.filter(a => String(a.personnelId || a.personnel_id) === String(transferAbsentTeacherId));

                    if (teacherAbsenceRecords.length === 0) {
                      return (
                        <div style={{ padding: '14px', background: '#FEF2F2', borderRadius: '10px', border: '1.5px solid #FCA5A5', color: '#991B1B', fontSize: '12px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <FiAlertCircle size={14} /> No recorded absences found for this teacher. Please log their leave or absence dates in <strong>Step 2: Absences & Leave</strong> first before delegating workloads.
                        </div>
                      );
                    }

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {teacherAbsenceRecords.map((a, aIdx) => {
                          const sStr = a.startDate || a.start_date || a.absenceDate || a.absence_date || '';
                          const eStr = a.endDate || a.end_date || sStr;
                          const lType = a.leaveType || a.leave_type || a.type || 'ABSENCE / LEAVE';
                          const isSelected = transferStartDate === sStr && transferEndDate === eStr;

                          // Compute total calendar days in range
                          let dayCount = 1;
                          if (sStr && eStr && sStr !== eStr) {
                            const d1 = new Date(sStr);
                            const d2 = new Date(eStr);
                            if (!isNaN(d1) && !isNaN(d2)) {
                              dayCount = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
                            }
                          }

                          return (
                            <div
                              key={a.id || aIdx}
                              onClick={() => {
                                setTransferStartDate(sStr);
                                setTransferEndDate(eStr);
                                setTransferRangeStart(sStr);
                                setTransferRangeEnd(eStr);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px 14px',
                                borderRadius: '10px',
                                background: isSelected ? '#EFF6FF' : '#FFFFFF',
                                border: isSelected ? '2px solid #0284C7' : '1.5px solid var(--line)',
                                boxShadow: isSelected ? '0 2px 8px rgba(2, 132, 199, 0.15)' : 'none',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                  width: '18px',
                                  height: '18px',
                                  borderRadius: '50%',
                                  border: isSelected ? '5px solid #0284C7' : '2px solid #94A3B8',
                                  background: 'white',
                                  flexShrink: 0
                                }} />
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: '900', color: isSelected ? '#0369A1' : 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                      {lType}
                                    </span>
                                    <span style={{ fontSize: '10px', fontWeight: '800', background: isSelected ? '#DBEAFE' : '#F1F5F9', color: isSelected ? '#1E40AF' : '#475569', padding: '1px 6px', borderRadius: '4px' }}>
                                      {dayCount} {dayCount === 1 ? 'Day' : 'Days'}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '12px', fontWeight: '700', color: isSelected ? '#0284C7' : '#334155', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <FiCalendar size={12} /> {sStr} {eStr && eStr !== sStr ? `➔ ${eStr}` : ''}
                                  </div>
                                </div>
                              </div>

                              {isSelected && (
                                <span style={{ fontSize: '11px', fontWeight: '800', color: '#0284C7', background: '#DBEAFE', padding: '3px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  <FiCheck size={11} /> Selected
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Range Status Confirmation Preview */}
                  {transferStartDate && (
                    <div style={{ fontSize: '11px', fontWeight: '800', color: '#0369A1', background: '#EFF6FF', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #BAE6FD', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FiCheckCircle size={13} /> Active Coverage Delegation: <strong>{transferStartDate}</strong> {transferEndDate && transferEndDate !== transferStartDate ? `to ${transferEndDate}` : ''}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setTransferRangeStart(null);
                          setTransferRangeEnd(null);
                          setTransferStartDate('');
                          setTransferEndDate('');
                        }}
                        style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontWeight: '800', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                      >
                        <FiX size={11} /> Clear
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
                  onClick={() => setActiveStep(hasSHS ? 5 : 6)}
                  style={{ background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white', fontSize: '12px', padding: '6px 14px' }}
                >
                  {hasSHS ? 'Proceed to Step 5: Work Immersion →' : 'Proceed to Step 5: Teaching Overload →'}
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

      {/* STEP 5: Work Immersion (Option 1: Interactive Calendar + Selected Days Table) */}
      {activeStep === 5 && (
        <div style={{ display: 'grid', gridTemplateColumns: '440px 1fr', gap: '20px' }}>
          {/* Left: Teacher / Month Selector + Interactive Calendar */}
          <article className="card" style={{ height: 'fit-content' }}>
            <div className="card-inner" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FiBriefcase size={18} color="var(--blue)" /> Work Immersion Logger
                </h2>
                <span style={{ fontSize: '10px', background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '12px', fontWeight: '800' }}>
                  SHS Only
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)', lineHeight: 1.4 }}>
                Select a Senior High School teacher and month. Click any weekday on the calendar to toggle immersion duty dates.
              </p>

              {/* Teacher Selector */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>
                  1. SELECT SHS TEACHER
                </label>
                <SearchableDropdown
                  options={activePersonnel.map(p => {
                    const isShs = p.teachesSeniorHigh || (p.workloadRows || []).some(r => String(r.gradeLevel || '').includes('11') || String(r.gradeLevel || '').includes('12'));
                    return `${p.firstName} ${p.lastName} · ${p.position || 'Teacher'}${isShs ? ' (SHS)' : ''}`;
                  })}
                  value={activePersonnel.find(p => p.id === workImmersionTeacherId) ? (() => {
                    const p = activePersonnel.find(p => p.id === workImmersionTeacherId);
                    const isShs = p.teachesSeniorHigh || (p.workloadRows || []).some(r => String(r.gradeLevel || '').includes('11') || String(r.gradeLevel || '').includes('12'));
                    return `${p.firstName} ${p.lastName} · ${p.position || 'Teacher'}${isShs ? ' (SHS)' : ''}`;
                  })() : ''}
                  onChange={(val) => {
                    const p = activePersonnel.find(p => {
                      const isShs = p.teachesSeniorHigh || (p.workloadRows || []).some(r => String(r.gradeLevel || '').includes('11') || String(r.gradeLevel || '').includes('12'));
                      return `${p.firstName} ${p.lastName} · ${p.position || 'Teacher'}${isShs ? ' (SHS)' : ''}` === val;
                    });
                    setWorkImmersionTeacherId(p ? p.id : '');
                  }}
                  placeholder="Select teacher to log immersion..."
                />
              </div>

              {/* Month Selector */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', display: 'block', marginBottom: '4px' }}>
                  2. SELECT MONTH
                </label>
                <select
                  value={workImmersionMonth}
                  onChange={(e) => setWorkImmersionMonth(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid var(--line)', background: 'white', fontWeight: 'bold', fontSize: '13px' }}
                >
                  {MONTHS_LIST.map(m => (
                    <option key={m.name} value={m.name}>{m.name} ({m.quarter})</option>
                  ))}
                </select>
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: '12px', fontSize: '11px', background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#1d4ed8', fontWeight: 'bold' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#eff6ff', border: '1.5px solid #3b82f6' }}></span> Immersion
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--muted)' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'white', border: '1px solid var(--line)' }}></span> Regular Day
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#b45309' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#fef08a', border: '1px solid #eab308' }}></span> Holiday
                </span>
              </div>

              {/* Interactive Calendar Picker */}
              {!workImmersionTeacherId ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', background: '#F8FAFC', borderRadius: '12px', border: '1.5px dashed var(--line)', color: 'var(--muted)', fontSize: '13px' }}>
                  Please select a teacher above to enable the interactive immersion calendar.
                </div>
              ) : workImmersionLoading ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)', fontSize: '13px' }}>
                  <FiRefreshCw size={18} style={{ animation: 'spin 1s linear infinite', marginBottom: '6px' }} />
                  <div>Loading immersion records...</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--navy)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{workImmersionMonth} 2026 Workdays Calendar</span>
                    <small style={{ color: 'var(--muted)', fontWeight: 'normal' }}>Click date to toggle</small>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
                      <div key={day} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: 'var(--navy)', padding: '4px', background: '#e2e8f0', borderRadius: '4px' }}>
                        {day}
                      </div>
                    ))}
                    {(() => {
                      const monthDates = getWeekdaysInMonth(workImmersionMonth, schoolInfo?.schoolYear || 'SY 26-27');

                      return monthDates.map((dateObj, idx) => {
                        const dateStr = getLocalDateString(dateObj);
                        const dayNum = dateObj.getDate();
                        const isSelected = Boolean(workImmersionTimes[dateStr]);
                        const mins = workImmersionData[dateStr] || 0;
                        const existingHoliday = (localNonWorkingDays || []).find(h => h.date === dateStr);

                        let bg = 'white';
                        let border = '1.5px solid var(--line)';
                        let color = 'var(--navy)';
                        let badgeText = '';

                        if (isSelected) {
                          bg = '#eff6ff';
                          border = '2px solid #3b82f6';
                          color = '#1e40af';
                          badgeText = mins > 0 ? `${(mins / 60).toFixed(1)}h` : 'ACTIVE';
                        } else if (existingHoliday) {
                          bg = '#fef9c3';
                          border = '1px solid #fde047';
                          color = '#854d0e';
                          badgeText = 'HOLIDAY';
                        }

                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleToggleImmersionDay(dateStr)}
                            style={{
                              padding: '8px 4px',
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
                              boxShadow: isSelected ? '0 2px 8px rgba(59, 130, 246, 0.25)' : 'none',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span style={{ fontSize: '14px' }}>{dayNum}</span>
                            <span style={{ fontSize: '9px', textTransform: 'uppercase', marginTop: '2px', fontWeight: '800' }}>
                              {badgeText || 'Workday'}
                            </span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {immersionStatusMsg && (
                <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FiCheckCircle size={14} /> {immersionStatusMsg}
                </div>
              )}
            </div>
          </article>

          {/* Right: Selected Immersion Days & Schedule Table */}
          <article className="card">
            <div className="card-inner" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(() => {
                const currentMonthDates = getWeekdaysInMonth(workImmersionMonth, schoolInfo?.schoolYear || 'SY 26-27')
                  .map(d => getLocalDateString(d));
                const selectedDates = currentMonthDates.filter(dStr => Boolean(workImmersionTimes[dStr]));
                const totalMins = selectedDates.reduce((acc, dStr) => acc + (workImmersionData[dStr] || 0), 0);
                const totalHrs = totalMins / 60;

                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--navy)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FiClock size={16} /> Selected Immersion Dates ({selectedDates.length})
                        </h2>
                        <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                          Only dates selected on the calendar require start and end times.
                        </p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#1d4ed8', background: '#eff6ff', padding: '6px 12px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                          Total: {totalHrs.toFixed(1)} hrs ({totalMins}m)
                        </span>
                        <button
                          className="btn"
                          onClick={() => setActiveStep(6)}
                          style={{ background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white', fontSize: '12px', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          Proceed to Step 6: Overload →
                        </button>
                      </div>
                    </div>

                    {/* Quick-Fill Batch Bar */}
                    {selectedDates.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px', padding: '12px 16px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid var(--line)' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--navy)' }}>
                          Batch Quick-Fill:
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <label style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>Start</label>
                          <input
                            type="time"
                            value={batchImmersionStart}
                            onChange={(e) => setBatchImmersionStart(e.target.value)}
                            style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '12px' }}
                          />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <label style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold' }}>End</label>
                          <input
                            type="time"
                            value={batchImmersionEnd}
                            onChange={(e) => setBatchImmersionEnd(e.target.value)}
                            style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '12px' }}
                          />
                        </div>
                        <button
                          className="btn secondary"
                          onClick={handleBatchApplyTimesToMonth}
                          style={{ fontSize: '12px', padding: '6px 14px', background: '#eff6ff', border: '1px solid #93c5fd', color: '#1e40af', fontWeight: 'bold' }}
                        >
                          Apply to All {selectedDates.length} Days
                        </button>
                      </div>
                    )}

                    {/* Table or Empty State */}
                    {!workImmersionTeacherId ? (
                      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)', fontSize: '13px', background: '#F8FAFC', borderRadius: '12px', border: '1.5px dashed var(--line)' }}>
                        <FiBriefcase size={36} color="var(--muted)" style={{ marginBottom: '10px', opacity: 0.6 }} />
                        <div>Select a teacher on the left to view or configure their work immersion schedule.</div>
                      </div>
                    ) : selectedDates.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)', fontSize: '13px', background: '#F8FAFC', borderRadius: '12px', border: '1.5px dashed var(--line)' }}>
                        <FiCalendar size={36} color="var(--muted)" style={{ marginBottom: '10px', opacity: 0.6 }} />
                        <div style={{ fontWeight: 'bold', color: 'var(--navy)', marginBottom: '4px' }}>No immersion dates selected for {workImmersionMonth}</div>
                        <div>Click any date on the calendar to the left to mark it as an immersion day.</div>
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid var(--line)', background: '#F8FAFC' }}>
                              <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Date & Day</th>
                              <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)', width: '160px' }}>Start Time</th>
                              <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)', width: '160px' }}>End Time</th>
                              <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)', width: '140px' }}>Duration</th>
                              <th style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 'bold', color: 'var(--navy)', width: '80px' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedDates.map((dateStr) => {
                              const timeObj = workImmersionTimes[dateStr] || {};
                              const mins = workImmersionData[dateStr] || 0;
                              const dateObj = new Date(dateStr);
                              const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                              const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                              const formattedDate = !isNaN(dateObj.getTime())
                                ? `${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}, ${dateObj.getFullYear()} (${dayNames[dateObj.getDay()]})`
                                : dateStr;

                              return (
                                <tr key={dateStr} style={{ borderBottom: '1px solid var(--line)' }}>
                                  <td style={{ padding: '12px 10px', fontWeight: 'bold', color: 'var(--navy)' }}>
                                    {formattedDate}
                                  </td>
                                  <td style={{ padding: '12px 10px' }}>
                                    <input
                                      type="time"
                                      value={timeObj.startTime || ''}
                                      onChange={(e) => handleUpdateImmersionDayTime(dateStr, e.target.value, timeObj.endTime || '')}
                                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid var(--line)', fontSize: '13px' }}
                                    />
                                  </td>
                                  <td style={{ padding: '12px 10px' }}>
                                    <input
                                      type="time"
                                      value={timeObj.endTime || ''}
                                      onChange={(e) => handleUpdateImmersionDayTime(dateStr, timeObj.startTime || '', e.target.value)}
                                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid var(--line)', fontSize: '13px' }}
                                    />
                                  </td>
                                  <td style={{ padding: '12px 10px' }}>
                                    <span style={{ fontWeight: 'bold', color: mins > 0 ? '#1d4ed8' : '#94a3b8' }}>
                                      {mins > 0 ? `${mins}m (${(mins / 60).toFixed(1)}h)` : '0m'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                    <button
                                      className="btn danger"
                                      onClick={() => handleRemoveImmersionDay(dateStr)}
                                      style={{ padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                      title="Remove this immersion date"
                                    >
                                      <FiTrash2 size={12} /> Remove
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </article>
        </div>
      )}

      {/* STEP 6: Computation of Teaching Overload */}
      {activeStep === 6 && (
        <article className="card">
          <div className="card-inner" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header & Controls Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', background: '#F8FAFC', padding: '14px 18px', borderRadius: '12px', border: '1px solid var(--line)' }}>
              
              {/* Left: Mode Toggle & Period Selector */}
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--navy)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    1. Report Calendar Mode
                  </label>
                  <div style={{ display: 'inline-flex', background: '#e2e8f0', padding: '3px', borderRadius: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setFilterMode('term')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: 0,
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        background: filterMode === 'term' ? 'white' : 'transparent',
                        color: filterMode === 'term' ? 'var(--navy)' : '#64748b',
                        boxShadow: filterMode === 'term' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      📅 3-Term Calendar
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMode('fy')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: 0,
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        background: filterMode === 'fy' ? 'white' : 'transparent',
                        color: filterMode === 'fy' ? 'var(--navy)' : '#64748b',
                        boxShadow: filterMode === 'fy' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      📊 Fiscal Year (FY)
                    </button>
                  </div>
                </div>

                {/* Period Dropdown */}
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--navy)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {filterMode === 'term' ? '2. Select Academic Term' : '2. Select FY Quarter'}
                  </label>
                  {filterMode === 'term' ? (
                    <select
                      value={selectedTerm}
                      onChange={(e) => setSelectedTerm(e.target.value)}
                      style={{ padding: '8px 12px', borderRadius: '8px', border: '1.5px solid var(--line)', background: 'white', fontWeight: 'bold', fontSize: '13px', color: 'var(--navy)' }}
                    >
                      {ACADEMIC_TERMS.map(t => (
                        <option key={t.id} value={t.id}>{t.label} ({t.months.join(' – ')})</option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={selectedFY}
                      onChange={(e) => setSelectedFY(e.target.value)}
                      style={{ padding: '8px 12px', borderRadius: '8px', border: '1.5px solid var(--line)', background: 'white', fontWeight: 'bold', fontSize: '13px', color: 'var(--navy)' }}
                    >
                      {FY_QUARTERS.map(q => (
                        <option key={q.id} value={q.id}>{q.label} ({q.months.join(' – ')})</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Right: Search, Refresh, Generate PDF */}
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <input 
                  type="text" 
                  placeholder="Search teacher..." 
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1.5px solid var(--line)', width: '200px', fontSize: '13px' }}
                />
                <button
                  className="btn"
                  onClick={refreshOverloadData}
                  disabled={freshLoading}
                  title="Re-fetch workload data from database"
                  style={{ padding: '8px 12px', background: freshLoading ? '#e2e8f0' : '#f0fdf4', color: freshLoading ? '#94a3b8' : '#15803d', border: '1.5px solid #86efac', borderRadius: '8px', fontWeight: 'bold', cursor: freshLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}
                >
                  <FiRefreshCw size={13} style={{ display: 'inline', marginRight: '4px' }} /> Refresh
                </button>
                <button 
                  className="btn" 
                  onClick={handleGeneratePDF} 
                  style={{ padding: '8px 16px', background: 'linear-gradient(180deg, var(--blue), var(--navy))', color: 'white', border: 0, borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', boxShadow: '0 2px 6px rgba(30, 58, 138, 0.25)' }}
                >
                  <FiPrinter size={14} /> Generate Report (PDF)
                </button>
              </div>
            </div>

            {/* Active Period Overview Banner */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 16px' }}>
              <div style={{ fontSize: '13px', color: '#1e40af', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📅 Reporting Period: <strong>{activePeriodLabel}</strong> ({activeMonths.join(' · ')})</span>
                <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '12px' }}>
                  {filteredRoster.length} Eligible Teachers
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                End-of-term exam weeks and holidays are strictly excluded from overload calculations.
              </div>
            </div>

            {freshLoading && (
              <LoadingScreen inline size="small" message="Loading teacher workload data from database..." />
            )}
            
            {!freshLoading && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)', background: '#F8FAFC' }}>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Teacher Name</th>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)' }}>Position</th>
                    
                    {/* Dynamic Monthly Columns */}
                    {activeMonths.map(mName => (
                      <th key={mName} style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 'bold', color: 'var(--navy)' }}>
                        Net {mName}
                      </th>
                    ))}

                    <th style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 'bold', color: 'var(--navy)', background: '#f1f5f9' }}>
                      Period Net Total
                    </th>
                    <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', color: 'var(--navy)' }}>
                      PHTR (₱/hr)
                    </th>
                    <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', color: '#15803d', background: '#f0fdf4' }}>
                      Estimated Overload Pay (₱)
                    </th>
                    <th style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', color: 'var(--navy)', minWidth: '220px' }}>
                      Reason for Overload
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoster.map((item, idx) => {
                    const phtr = item.phtr;
                    const formattedPhtr = phtr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    const formattedPay = item.overloadPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    const rawTeacherReasons = overloadReasonsMap[item.teacher.id];
                    const teacherReasons = (Array.isArray(rawTeacherReasons) && rawTeacherReasons.length > 0)
                      ? rawTeacherReasons.map(normalizeReasonString)
                      : getAutoReasonsForTeacher(item.teacher, item);
                    const isInvalid = !Array.isArray(teacherReasons) || teacherReasons.length < 1;

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '12px 10px', fontWeight: 'bold', color: 'var(--navy)' }}>
                          {item.teacher.lastName}, {item.teacher.firstName}
                        </td>
                        <td style={{ padding: '12px 10px', color: 'var(--muted)' }}>
                          {item.teacher.position}
                        </td>

                        {/* Monthly stats */}
                        {activeMonths.map(mName => {
                          const mStat = item.monthlyStatsMap[mName] || { gross: 0, deductions: 0, net: 0, lateDeductions: 0, leaveDeductions: 0 };
                          return (
                            <td key={mName} style={{ padding: '12px 10px', textAlign: 'center' }}>
                              <span style={{ fontWeight: 'bold', color: mStat.net > 0 ? '#15803d' : 'var(--navy)' }}>
                                {mStat.net}h
                              </span>
                              {mStat.deductions > 0 && (
                                <div style={{ fontSize: '10px', color: '#b91c1c' }}>
                                  (-{mStat.deductions}h {mStat.lateDeductions > 0 && mStat.leaveDeductions > 0 ? 'late/leave' : (mStat.lateDeductions > 0 ? 'late' : 'leave')})
                                </div>
                              )}
                            </td>
                          );
                        })}

                        {/* Total Net Hours */}
                        <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 'bold', background: '#f8fafc', color: item.totalStats.net > 0 ? '#15803d' : 'var(--navy)' }}>
                          {item.totalStats.net} hrs
                          {item.totalStats.deductions > 0 && (
                            <div style={{ fontSize: '10px', color: '#b91c1c' }}>
                              (-{item.totalStats.deductions}h ded.)
                            </div>
                          )}
                        </td>

                        {/* PHTR */}
                        <td style={{ padding: '12px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--navy)', fontWeight: '600' }}>
                          ₱{formattedPhtr}
                        </td>

                        {/* Overload Pay */}
                        <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace', color: '#15803d', background: '#f0fdf4' }}>
                          ₱{formattedPay}
                        </td>

                        {/* Overload Reasons */}
                        <td style={{ padding: '8px 10px', minWidth: '240px' }}>
                          {(() => {
                            const remainingOptions = OVERLOAD_REASON_OPTIONS.filter(opt => !teacherReasons.includes(opt));

                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '240px' }}>
                                {/* Active Reason Badges / Pills */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {teacherReasons.map((reason, rIdx) => (
                                    <div
                                      key={rIdx}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '8px',
                                        background: '#eff6ff',
                                        border: '1px solid #bfdbfe',
                                        borderRadius: '6px',
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        color: '#1e40af',
                                        lineHeight: 1.3
                                      }}
                                    >
                                      <span style={{ wordBreak: 'break-word' }}>{reason}</span>
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
                                              term: activeTermKey,
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
                                          padding: 0,
                                          display: 'flex',
                                          alignItems: 'center',
                                          flexShrink: 0
                                        }}
                                        title="Remove Reason"
                                      >
                                        <FiX size={12} />
                                      </button>
                                    </div>
                                  ))}

                                  {isInvalid && (
                                    <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <FiAlertCircle size={12} /> At least 1 reason required
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
                                      handleToggleReasonForTeacher(item.teacher.id, selectedVal, teacherReasons);
                                    }}
                                    style={{
                                      fontSize: '11px',
                                      padding: '5px 8px',
                                      borderRadius: '6px',
                                      border: '1.5px dashed #cbd5e1',
                                      background: '#ffffff',
                                      color: '#475569',
                                      cursor: 'pointer',
                                      width: '100%',
                                      fontWeight: '600'
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
                      <td colSpan={5 + activeMonths.length} style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <FiClipboard size={24} color="#64748B" />
                          <span style={{ fontWeight: '600', color: 'var(--navy)' }}>No overload-eligible teachers found for {activePeriodLabel}.</span>
                          <span style={{ fontSize: '12px' }}>Make sure teachers have their workload saved in the Workload section, then click <strong>Refresh</strong> above.</span>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Total personnel loaded: {effectivePersonnel.length} | Eligible: {overloadEligiblePersonnel.length}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            )}
          </div>
        </article>
      )}
    </main>
  );
}

