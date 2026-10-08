export const getApiBase = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined' && window.location) {
    const pathname = window.location.pathname || '';
    if (pathname.includes('/insighted-esf7-prod')) {
      return '/insighted-esf7-prod/api';
    }
    if (pathname.includes('/insighted-esf7-staging')) {
      return '/insighted-esf7-staging/api';
    }
    if (pathname.includes('/insighted/Insighted-esf7')) {
      return '/insighted/Insighted-esf7/api';
    }
    if (pathname.includes('/insighted-esf7')) {
      return '/insighted-esf7/api';
    }
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return '/api';
    }
    if (window.location.hostname.includes('stride.deped.gov.ph')) {
      return '/insighted-esf7-prod/api';
    }
  }
  return '/api';
};

export const API_BASE = getApiBase();

export const fetchWithAuth = async (url, options = {}) => {
  const token = localStorage.getItem('token');
  let tokenSchoolId = null;
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      tokenSchoolId = payload.school_id || payload.schoolId;
    } catch (e) {}
  }
  const rawSchoolId = tokenSchoolId || localStorage.getItem('activeSchoolId') || localStorage.getItem('school_id') || localStorage.getItem('schoolId');
  const activeSchoolId = rawSchoolId ? String(rawSchoolId).replace(/^SCH-/i, '').trim() : '';

  const headers = {
    ...options.headers,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(activeSchoolId ? { 'x-school-id': activeSchoolId } : {})
  };
  return fetch(url, { ...options, headers });
};

export const api = {
  // Dashboard stats
  getDashboardStats: async (simulatedDate = null) => {
    const query = simulatedDate ? `?simulated_date=${encodeURIComponent(simulatedDate)}` : '';
    const res = await fetchWithAuth(`${API_BASE}/dashboard/stats${query}`);
    return res.json();
  },

  // School Profile
  getSchool: async (targetSchoolId = null) => {
    const activeId = targetSchoolId || localStorage.getItem('activeSchoolId') || localStorage.getItem('school_id') || localStorage.getItem('schoolId');
    const customHeaders = activeId ? { 'x-school-id': String(activeId) } : {};
    const query = activeId ? `?school_id=${encodeURIComponent(activeId)}` : '';
    const res = await fetchWithAuth(`${API_BASE}/school${query}`, { headers: customHeaders });
    return res.json();
  },
  updateSchool: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/school`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  updateSchoolSubjects: async (subjectsConfig) => {
    const res = await fetchWithAuth(`${API_BASE}/school-info/subjects`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjectsConfig })
    });
    return res.json();
  },
  updateCurricularConfig: async (configData) => {
    const res = await fetchWithAuth(`${API_BASE}/schools/curricular-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configData)
    });
    return res.json();
  },

  // Personnel Roster
  getPersonnel: async (targetSchoolId = null) => {
    const customHeaders = targetSchoolId ? { 'x-school-id': targetSchoolId } : {};
    const query = targetSchoolId ? `?school_id=${encodeURIComponent(targetSchoolId)}` : '';
    const res = await fetchWithAuth(`${API_BASE}/personnel${query}`, { headers: customHeaders });
    return res.json();
  },
  getAutofillTemplate: async (targetSchoolId = null) => {
    const customHeaders = targetSchoolId ? { 'x-school-id': targetSchoolId } : {};
    const query = targetSchoolId ? `?school_id=${encodeURIComponent(targetSchoolId)}` : '';
    const res = await fetchWithAuth(`${API_BASE}/personnel/autofill-template${query}`, { headers: customHeaders });
    return res.json();
  },
  saveBulkPersonnel: async (personnelList) => {
    const res = await fetchWithAuth(`${API_BASE}/personnel/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personnelList })
    });
    return res.json();
  },
  importBulkHarvester: async (schoolId, personnelList) => {
    const res = await fetchWithAuth(`${API_BASE}/personnel/bulk-harvester-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolId, personnelList })
    });
    return res.json();
  },
  addPersonnel: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/personnel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  deletePersonnel: async (id) => {
    const res = await fetchWithAuth(`${API_BASE}/personnel/${id}`, {
      method: 'DELETE'
    });
    return res.json();
  },
  updatePersonnel: async (id, data) => {
    const res = await fetchWithAuth(`${API_BASE}/personnel/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  verifyPersonnel: async (id, field, value) => {
    const res = await fetchWithAuth(`${API_BASE}/personnel/${id}/verify`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value })
    });
    return res.json();
  },
  toggleSchoolHead: async (id, isSchoolHead) => {
    const res = await fetchWithAuth(`${API_BASE}/personnel/${id}/school-head`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isSchoolHead })
    });
    return res.json();
  },

  // Workload Schedules (esf7_workload_rows)
  saveWorkloadBatch: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/workloads/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  getWorkloadsByPersonnel: async (personnelId) => {
    const res = await fetchWithAuth(`${API_BASE}/workloads/personnel/${personnelId}`);
    return res.json();
  },

  // Employment Tab Details
  updateEmployment: async (personnelId, data) => {
    const res = await fetchWithAuth(`${API_BASE}/employment/${personnelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  // Qualifications Tab Details
  updateQualifications: async (personnelId, data) => {
    const res = await fetchWithAuth(`${API_BASE}/qualifications/${personnelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  // Trainings (NEAP, Certifications, Other)
  addTraining: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/trainings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  updatePersonnelTrainings: async (personnelId, data) => {
    const res = await fetchWithAuth(`${API_BASE}/trainings/personnel/${personnelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  deleteTraining: async (id) => {
    const res = await fetchWithAuth(`${API_BASE}/trainings/${id}`, {
      method: 'DELETE'
    });
    return res.json();
  },

  // Class Sections (3 Tailored Tables)
  getSections: async () => {
    const res = await fetchWithAuth(`${API_BASE}/sections`);
    return res.json();
  },
  addSection: async (data) => {
    const sectionType = String(data.sectionType || data.section_type || 'MONO GRADE').toUpperCase();
    const gradeLevel = String(data.gradeLevel || data.grade_level || '').toUpperCase();
    let endpoint = `${API_BASE}/sections/regular`;
    if (sectionType.includes('ARAL') || gradeLevel.includes('ARAL') || data.aralBasis || data.aralToolKey || data.aralTool) {
      endpoint = `${API_BASE}/sections/aral`;
    } else if (sectionType.includes('SNED') || sectionType.includes('NON-GRADED') || gradeLevel.includes('SNED') || gradeLevel.includes('NON-GRADED') || gradeLevel.includes('SPED')) {
      endpoint = `${API_BASE}/sections/sned`;
    } else if (sectionType.includes('ALS') || gradeLevel.includes('ALS')) {
      endpoint = `${API_BASE}/sections/als`;
    } else if (sectionType === 'REMEDIAL' || sectionType === 'ENRICHMENT' || data.interventionType || data.intervention_type) {
      endpoint = `${API_BASE}/sections/remedial-enrichment`;
    }
    const res = await fetchWithAuth(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  createSection: async function(data) {
    return this.addSection(data);
  },
  addRegularSection: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/sections/regular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  addAralSection: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/sections/aral`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  addRemedialEnrichmentSection: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/sections/remedial-enrichment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  updateSectionAdviser: async (id, advisorId, advisory_minutes = 300, hgp_minutes = 60, numberOfLearners = null) => {
    const res = await fetchWithAuth(`${API_BASE}/sections/regular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        adviser_id: advisorId,
        adviserId: advisorId,
        advisory_minutes,
        hgp_minutes,
        number_of_learners: numberOfLearners !== null && numberOfLearners !== undefined && numberOfLearners !== '' ? Number(numberOfLearners) : null
      })
    });
    return res.json();
  },
  deleteSection: async (id) => {
    const res = await fetchWithAuth(`${API_BASE}/sections/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    return res.json();
  },
  clearAllSections: async (schoolId) => {
    const res = await fetchWithAuth(`${API_BASE}/sections/clear-all?schoolId=${encodeURIComponent(schoolId || '')}`, {
      method: 'DELETE'
    });
    return res.json();
  },

  // Workload Schedules
  addWorkloadRow: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/workloads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  updatePersonnelWorkloadRows: async (personnelId, workloadRows, teachingRelatedRows, administrativeRows) => {
    const res = await fetchWithAuth(`${API_BASE}/workloads/personnel/${personnelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workloadRows, teachingRelatedRows, administrativeRows })
    });
    return res.json();
  },
  deleteWorkloadRow: async (id) => {
    const res = await fetchWithAuth(`${API_BASE}/workloads/${id}`, {
      method: 'DELETE'
    });
    return res.json();
  },

  // Workload Coverage / Substitution transfers
  getTransfers: async () => {
    const res = await fetchWithAuth(`${API_BASE}/transfers`);
    return res.json();
  },
  createBatchTransfers: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/transfers/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  updateTransferStatus: async (id, status) => {
    const res = await fetchWithAuth(`${API_BASE}/transfers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    return res.json();
  },

  // Absences & Tardiness / Undertime management
  getAbsences: async () => {
    const res = await fetchWithAuth(`${API_BASE}/absences`);
    return res.json();
  },
  getOverloadLateUndertime: async (schoolYear = '2026-2027', personnelId = null, term = null, month = null) => {
    let url = `${API_BASE}/overload-late-undertime?schoolYear=${encodeURIComponent(schoolYear)}`;
    if (personnelId) url += `&personnelId=${encodeURIComponent(personnelId)}`;
    if (term) url += `&term=${encodeURIComponent(term)}`;
    if (month) url += `&month=${encodeURIComponent(month)}`;
    const res = await fetchWithAuth(url);
    return res.json();
  },
  saveOverloadLateUndertime: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/overload-late-undertime`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  deleteOverloadLateUndertime: async (id) => {
    const res = await fetchWithAuth(`${API_BASE}/overload-late-undertime/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    return res.json();
  },

  // Allowances & Incentives management
  getPersonnelAllowances: async (schoolYear = 'SY 26-27') => {
    const res = await fetchWithAuth(`${API_BASE}/allowances?schoolYear=${encodeURIComponent(schoolYear)}`);
    return res.json();
  },
  togglePersonnelAllowance: async (personnelId, allowanceKey, isGranted, schoolYear = 'SY 26-27') => {
    const res = await fetchWithAuth(`${API_BASE}/allowances/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personnelId, allowanceKey, isGranted, schoolYear })
    });
    return res.json();
  },
  bulkUpdatePersonnelAllowances: async (personnelId, allowances, schoolYear = 'SY 26-27') => {
    const res = await fetchWithAuth(`${API_BASE}/allowances/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personnelId, allowances, schoolYear })
    });
    return res.json();
  },

  // Overload Reasons & Pay management
  getOverloadReasons: async (schoolYear = 'SY 26-27', term = 'Term 1') => {
    const res = await fetchWithAuth(`${API_BASE}/overload-reasons?schoolYear=${encodeURIComponent(schoolYear)}&term=${encodeURIComponent(term)}`);
    return res.json();
  },
  saveOverloadReasons: async ({ personnelId, schoolYear = 'SY 26-27', term = 'Term 1', month = 'All', reasons, overloadHours = 0, overloadPay = 0, netTermPay = 0, rawPayload }) => {
    const res = await fetchWithAuth(`${API_BASE}/overload-reasons/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personnelId, schoolYear, term, month, reasons, overloadHours, overloadPay, netTermPay, rawPayload })
    });
    return res.json();
  },
  saveOverloadReasonsBatch: async ({ items = [], schoolYear = 'SY 26-27', term = 'Term 1' }) => {
    const res = await fetchWithAuth(`${API_BASE}/overload-reasons/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, schoolYear, term })
    });
    return res.json();
  },


  // Work Immersion management
  getWorkImmersionSchedules: async (personnelId, schoolYear = '2026-2027') => {
    const res = await fetchWithAuth(`${API_BASE}/work-immersion/${personnelId}?schoolYear=${encodeURIComponent(schoolYear)}`);
    return res.json();
  },
  saveWorkImmersionBatch: async ({ personnelId, schoolId = '123456', schoolYear = '2026-2027', schedules }) => {
    const res = await fetchWithAuth(`${API_BASE}/work-immersion/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personnelId, schoolId, schoolYear, schedules })
    });
    return res.json();
  },
  deleteWorkImmersionDate: async ({ personnelId, schoolYear = '2026-2027', date }) => {
    const res = await fetchWithAuth(`${API_BASE}/work-immersion/date`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personnelId, schoolYear, date })
    });
    return res.json();
  },

  // Feature A — Learning Area Matrix management
  getLearningAreas: async (personnelId) => {
    const res = await fetchWithAuth(`${API_BASE}/learning-areas?personnelId=${encodeURIComponent(personnelId)}`);
    if (!res.ok) throw new Error('Failed to fetch learning areas');
    return res.json();
  },
  saveLearningArea: async ({ personnelId, schoolYear, learningArea, checked, yearsTaught }) => {
    const res = await fetchWithAuth(`${API_BASE}/learning-areas/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personnelId, schoolYear, learningArea, checked, yearsTaught })
    });
    if (!res.ok) throw new Error('Failed to save learning area');
    return res.json();
  },

  // Feature B — Work Immersion management
  getWorkImmersion: async ({ personnelId, schoolYear, month }) => {
    const params = new URLSearchParams({ personnelId, schoolYear, month });
    const res = await fetchWithAuth(`${API_BASE}/work-immersion?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch work immersion data');
    return res.json();
  },
  saveWorkImmersion: async ({ personnelId, schoolYear, month, day, minutes }) => {
    const res = await fetchWithAuth(`${API_BASE}/work-immersion/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personnelId, schoolYear, month, day, minutes })
    });
    if (!res.ok) throw new Error('Failed to save work immersion data');
    return res.json();
  },

  getExtraTasks: async (personnelId = null) => {
    const query = personnelId ? `?personnelId=${encodeURIComponent(personnelId)}` : '';
    const res = await fetchWithAuth(`${API_BASE}/extra-tasks${query}`);
    if (!res.ok) throw new Error('Failed to fetch extra tasks');
    return res.json();
  },

  saveExtraTasks: async (personnelId, tasks = []) => {
    const res = await fetchWithAuth(`${API_BASE}/extra-tasks/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personnelId, tasks })
    });
    if (!res.ok) throw new Error('Failed to save extra tasks');
    return res.json();
  },

  sharePersonnelToClusteredSchools: async (prn, target_school_ids, first_name, last_name) => {

    const res = await fetchWithAuth(`${API_BASE}/personnel/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prn, target_school_ids, first_name, last_name })
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  submitRoomProfiling: async (data) => {
    const res = await fetch(`${API_BASE}/room-profiling/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      let errMsg = 'Failed to submit room profile';
      try {
        const errJson = await res.json();
        if (errJson && errJson.error) errMsg = errJson.error;
      } catch (_) {
        try {
          const errText = await res.text();
          if (errText) errMsg = errText;
        } catch (__) {}
      }
      throw new Error(errMsg);
    }
    return res.json();
  },
  syncRoomRoster: async (schoolId, roster = []) => {
    try {
      const res = await fetch(`${API_BASE}/room-profiling/sync-roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId, roster })
      });
      return res.ok ? await res.json() : { success: false };
    } catch (e) {
      return { success: false };
    }
  },
  getRoomRoster: async (schoolId = '502624') => {
    try {
      const res = await fetch(`${API_BASE}/room-profiling/roster?schoolId=${encodeURIComponent(schoolId)}`);
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      return [];
    }
  },
  verifyRoomPasscode: async ({ schoolId, passcode }) => {
    try {
      const res = await fetch(`${API_BASE}/room-profiling/verify-passcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId, passcode })
      });
      if (!res.ok) return { success: false, message: 'Server verification failed' };
      return await res.json();
    } catch (e) {
      return { success: false, message: e.message };
    }
  },
  getPendingRoomSubmissions: async (schoolId = '199998') => {
    const res = await fetch(`${API_BASE}/room-profiling/pending?schoolId=${encodeURIComponent(schoolId)}`);
    if (!res.ok) throw new Error('Failed to fetch pending room submissions');
    return res.json();
  },
  getApprovedRoomSubmissions: async (schoolId = '199998') => {
    const res = await fetch(`${API_BASE}/room-profiling/approved?schoolId=${encodeURIComponent(schoolId)}`);
    if (!res.ok) throw new Error('Failed to fetch approved room submissions');
    return res.json();
  },
  ackRoomSubmissions: async ({ schoolId, submissionIds = [], personnelIds = [] }) => {
    const res = await fetch(`${API_BASE}/room-profiling/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolId, submissionIds, personnelIds })
    });
    if (!res.ok) throw new Error('Failed to acknowledge room submissions');
    return res.json();
  },
  getProfilingSnapshots: async (schoolId = '199998') => {
    const res = await fetch(`${API_BASE}/room-profiling/snapshots?schoolId=${encodeURIComponent(schoolId)}`);
    if (!res.ok) throw new Error('Failed to fetch snapshots');
    return res.json();
  },
  saveProfilingSnapshot: async ({ schoolId, snapshotName, personnel }) => {
    const res = await fetch(`${API_BASE}/room-profiling/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolId, snapshotName, personnel })
    });
    if (!res.ok) throw new Error('Failed to save snapshot');
    return res.json();
  },
  getProfilingSnapshotById: async (id) => {
    const res = await fetch(`${API_BASE}/room-profiling/snapshots/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('Failed to fetch snapshot by ID');
    return res.json();
  },
  checkPasscodeLockout: async ({ schoolId, passcode, personnelId }) => {
    try {
      const params = new URLSearchParams();
      if (schoolId) params.append('schoolId', schoolId);
      if (passcode) params.append('passcode', passcode);
      if (personnelId) params.append('personnelId', personnelId);
      const res = await fetch(`${API_BASE}/room-profiling/check-lockout?${params.toString()}`);
      if (!res.ok) return { isLockedOut: false, lockoutRemainingSecs: 0 };
      return res.json();
    } catch (e) {
      return { isLockedOut: false, lockoutRemainingSecs: 0 };
    }
  },
  recordPasscodeAttempt: async ({ schoolId, passcode, personnelId, isSuccess }) => {
    try {
      const res = await fetch(`${API_BASE}/room-profiling/record-attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId, passcode, personnelId, isSuccess })
      });
      if (!res.ok) return { isLockedOut: false };
      return res.json();
    } catch (e) {
      return { isLockedOut: false };
    }
  },

  addAbsence: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/absences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  deleteAbsence: async (id) => {
    const res = await fetchWithAuth(`${API_BASE}/absences/${id}`, {
      method: 'DELETE'
    });
    return res.json();
  },
  getSalaryMatrix: async () => {
    const res = await fetchWithAuth(`${API_BASE}/salary-matrix`);
    return res.json();
  },
  submitSchoolWorkload: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  getSubmissionStatus: async (jobId) => {
    const res = await fetchWithAuth(`${API_BASE}/submissions/status/${jobId}`);
    return res.json();
  },
  getSchoolDraft: async (schoolYear = 'SY 26-27', targetSchoolId = null) => {
    const rawId = targetSchoolId || localStorage.getItem('activeSchoolId') || localStorage.getItem('school_id') || localStorage.getItem('schoolId');
    const cleanId = rawId ? String(rawId).replace(/^SCH-/i, '').trim() : '';
    const query = cleanId ? `&schoolId=${encodeURIComponent(cleanId)}` : '';
    const customHeaders = cleanId ? { 'x-school-id': cleanId } : {};
    const res = await fetchWithAuth(`${API_BASE}/school/draft?schoolYear=${encodeURIComponent(schoolYear)}${query}`, { headers: customHeaders });
    return res.json();
  },
  saveSchoolDraft: async (schoolYear, payload) => {
    if (activeDraftAbortController) {
      try { activeDraftAbortController.abort(); } catch (e) {}
    }
    activeDraftAbortController = new AbortController();

    const explicitId = payload?.schoolInfo && (payload.schoolInfo.schoolId || payload.schoolInfo.school_id);
    const rawId = explicitId || localStorage.getItem('activeSchoolId') || localStorage.getItem('school_id') || localStorage.getItem('schoolId');
    const cleanId = rawId ? String(rawId).replace(/^SCH-/i, '').trim() : '';
    const customHeaders = cleanId ? { 'x-school-id': cleanId } : {};

    try {
      const res = await fetchWithAuth(`${API_BASE}/school/draft`, {
        method: 'PUT',
        signal: activeDraftAbortController.signal,
        headers: { 'Content-Type': 'application/json', ...customHeaders },
        body: JSON.stringify({ schoolYear, payload })
      });
      return res.json();
    } catch (err) {
      if (err.name === 'AbortError') {
        return { success: true, aborted: true };
      }
      throw err;
    }
  },
  deleteSchoolDraft: async (schoolYear) => {
    const res = await fetchWithAuth(`${API_BASE}/school/draft?schoolYear=${encodeURIComponent(schoolYear)}`, {
      method: 'DELETE'
    });
    return res.json();
  },

  // Node Status & Boolean Progress Tracking
  getNodeStatus: async (schoolYear = 'SY 26-27', targetSchoolId = null) => {
    const rawId = targetSchoolId || localStorage.getItem('activeSchoolId') || localStorage.getItem('school_id') || localStorage.getItem('schoolId');
    const cleanId = rawId ? String(rawId).replace(/^SCH-/i, '').trim() : '';
    const query = cleanId ? `&school_id=${encodeURIComponent(cleanId)}` : '';
    const customHeaders = cleanId ? { 'x-school-id': cleanId } : {};
    const res = await fetchWithAuth(`${API_BASE}/node-status/school?schoolYear=${encodeURIComponent(schoolYear)}${query}`, { headers: customHeaders });
    return res.json();
  },
  saveSchoolNode: async (nodeId, payload = {}, schoolYear = 'SY 26-27', overallStatus = 'IN_PROGRESS', overallPercentage = 0) => {
    const res = await fetchWithAuth(`${API_BASE}/node-status/school/${encodeURIComponent(nodeId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolYear, payload, overallStatus, overallPercentage })
    });
    return res.json();
  },
  getPersonnelNodeStatus: async (schoolYear = 'SY 26-27') => {
    const res = await fetchWithAuth(`${API_BASE}/node-status/personnel?schoolYear=${encodeURIComponent(schoolYear)}`);
    return res.json();
  },
  savePersonnelNode: async (personnelId, nodeId, data = {}) => {
    const { payload = {}, schoolYear = 'SY 26-27', personnelName, positionTitle, category, isSchoolHead, isComplete } = data;
    const res = await fetchWithAuth(`${API_BASE}/node-status/personnel/${encodeURIComponent(personnelId)}/${encodeURIComponent(nodeId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolYear, personnelName, positionTitle, category, isSchoolHead, isComplete, payload })
    });
    return res.json();
  },
  getIncomingRequests: async (schoolId) => {
    const rawId = schoolId || localStorage.getItem('activeSchoolId') || localStorage.getItem('school_id') || localStorage.getItem('schoolId');
    const cleanId = rawId ? String(rawId).replace(/^SCH-/i, '').trim() : '';
    const query = cleanId ? `?schoolId=${encodeURIComponent(cleanId)}` : '';
    const res = await fetchWithAuth(`${API_BASE}/requests/incoming${query}`);
    return res.json();
  },
  getOutgoingRequests: async (schoolId) => {
    const rawId = schoolId || localStorage.getItem('activeSchoolId') || localStorage.getItem('school_id') || localStorage.getItem('schoolId');
    const cleanId = rawId ? String(rawId).replace(/^SCH-/i, '').trim() : '';
    const query = cleanId ? `?schoolId=${encodeURIComponent(cleanId)}` : '';
    const res = await fetchWithAuth(`${API_BASE}/requests/outgoing${query}`);
    return res.json();
  },
  getRequestHistory: async (schoolId) => {
    const rawId = schoolId || localStorage.getItem('activeSchoolId') || localStorage.getItem('school_id') || localStorage.getItem('schoolId');
    const cleanId = rawId ? String(rawId).replace(/^SCH-/i, '').trim() : '';
    const query = cleanId ? `?schoolId=${encodeURIComponent(cleanId)}` : '';
    const res = await fetchWithAuth(`${API_BASE}/requests/history${query}`);
    return res.json();
  },
  getDistrictSchools: async (schoolId, division) => {
    const rawId = schoolId || localStorage.getItem('activeSchoolId') || localStorage.getItem('school_id') || localStorage.getItem('schoolId');
    const cleanId = rawId ? String(rawId).replace(/^SCH-/i, '').trim() : '';
    const params = new URLSearchParams();
    if (cleanId) params.append('schoolId', cleanId);
    if (division) params.append('division', division);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithAuth(`${API_BASE}/requests/district-schools${query}`);
    return res.json();
  },
  createRequest: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/requests/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to create request');
    }
    return json;
  },
  respondToRequest: async (id, action) => {
    const res = await fetchWithAuth(`${API_BASE}/requests/${id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    return res.json();
  },
  getSubmissionHistory: async () => {
    const res = await fetchWithAuth(`${API_BASE}/submissions/history`);
    return res.json();
  },
  downloadESF7XLSB: async () => {
    const res = await fetchWithAuth(`${API_BASE}/reports/esf7-xlsb`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to download XLSB report');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eSF7_Report.xlsb`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
  downloadESF7PDF: async (schoolId) => {
    const sId = schoolId || '108348';
    const res = await fetchWithAuth(`${API_BASE}/reports/esf7/${sId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to download PDF report');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eSF7_${sId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
  getCalendarTerms: async (schoolId, schoolYear) => {
    const res = await fetchWithAuth(`${API_BASE}/reports/calendar-terms/${schoolId || '123456'}?school_year=${encodeURIComponent(schoolYear || 'SY 2026-2027')}`);
    return res.json();
  },
  saveCalendarTerms: async (schoolId, schoolYear, terms) => {
    const res = await fetchWithAuth(`${API_BASE}/reports/calendar-terms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, school_year: schoolYear, terms })
    });
    return res.json();
  },
  generateOverloadPayReport: async (payload) => {
    const res = await fetchWithAuth(`${API_BASE}/reports/generate-overload-pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  // SHS Workloads
  getShsWorkloads: async (personnelId) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/shs-workloads/${personnelId}`);
      if (!res.ok) {
        return { success: false, data: [] };
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        return { success: true, data };
      }
      return data;
    } catch (err) {
      console.warn('Notice: Could not fetch SHS workloads:', err);
      return { success: false, data: [] };
    }
  },
  saveShsWorkloads: async (personnelId, shsWorkloadRows) => {
    const res = await fetchWithAuth(`${API_BASE}/shs-workloads/personnel/${personnelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shsWorkloadRows })
    });
    return res.json();
  },
  getShsTransfers: async (personnelId, term) => {
    const res = await fetchWithAuth(`${API_BASE}/shs-transfers?personnelId=${personnelId || ''}&term=${term || ''}`);
    return res.json();
  },
  saveShsTransfer: async (transferData) => {
    const res = await fetchWithAuth(`${API_BASE}/shs-transfers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transferData)
    });
    return res.json();
  },

  // Clustered Personnel Real-Time Ghost Timetable Sync
  getClusteredGhostSlots: async (prn, schoolId) => {
    const query = schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : '';
    const res = await fetchWithAuth(`${API_BASE}/requests/clustered/${encodeURIComponent(prn)}/sync${query}`);
    return res.json();
  },
  broadcastClusteredGhostSlots: async (prn, data) => {
    const res = await fetchWithAuth(`${API_BASE}/requests/clustered/${encodeURIComponent(prn)}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  // Harvester Upload & Status Endpoints
  getHarvestStatus: async (schoolId) => {
    const res = await fetchWithAuth(`${API_BASE}/esf7-upload/status/${encodeURIComponent(schoolId)}`);
    return res.json();
  },
  checkHarvestStatus: async (schoolId) => {
    const res = await fetchWithAuth(`${API_BASE}/esf7-upload/check/${encodeURIComponent(schoolId)}`);
    return res.json();
  },
  uploadHarvestFile: async (formData) => {
    const res = await fetchWithAuth(`${API_BASE}/esf7-upload`, {
      method: 'POST',
      body: formData
    });
    return res.json();
  },
  importConvertedHarvest: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/esf7-upload/import-converted`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  // SDO Validation & Review Status
  getSchoolValidation: async (schoolId) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/validation/status/${encodeURIComponent(schoolId)}`);
      return await res.json();
    } catch (err) {
      console.warn('Failed to fetch school validation status:', err);
      return { exists: false, error: err.message };
    }
  },
  resubmitSchoolValidation: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/validation/resubmit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  // Auth passcode login
  passcodeLogin: async (data) => {
    const res = await fetch(`${API_BASE}/auth/passcode-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    let result = {};
    try {
      result = await res.json();
    } catch (err) {
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status} (${res.statusText || 'Bad Gateway'})`);
      }
    }
    return { ok: res.ok, status: res.status, ...result };
  },

  // Auth password/migrate login
  migrateLogin: async (data) => {
    const res = await fetch(`${API_BASE}/auth/migrate-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    let result = {};
    try {
      result = await res.json();
    } catch (err) {
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status} (${res.statusText || 'Bad Gateway'})`);
      }
    }
    return { ok: res.ok, status: res.status, ...result };
  },

  // Auth pin login
  pinLogin: async (data) => {
    const res = await fetch(`${API_BASE}/auth/pin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    let result = {};
    try {
      result = await res.json();
    } catch (err) {
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status} (${res.statusText || 'Bad Gateway'})`);
      }
    }
    return { ok: res.ok, status: res.status, ...result };
  }
};
