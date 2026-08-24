const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const fetchWithAuth = async (url, options = {}) => {
  const token = localStorage.getItem('token');
  let activeSchoolId = localStorage.getItem('activeSchoolId') || localStorage.getItem('school_id') || localStorage.getItem('schoolId');
  if (!activeSchoolId && token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      activeSchoolId = payload.school_id || payload.schoolId;
    } catch (e) {}
  }

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
  getSchool: async () => {
    const res = await fetchWithAuth(`${API_BASE}/school`);
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

  // Class Sections
  getSections: async () => {
    const res = await fetchWithAuth(`${API_BASE}/sections`);
    return res.json();
  },
  addSection: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  updateSectionAdviser: async (id, advisorId, advisory_minutes = 300, hgp_minutes = 60, numberOfLearners = null) => {
    const res = await fetchWithAuth(`${API_BASE}/sections/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        advisorId,
        advisory_minutes,
        hgp_minutes,
        number_of_learners: numberOfLearners !== null && numberOfLearners !== undefined && numberOfLearners !== '' ? Number(numberOfLearners) : null
      })
    });
    return res.json();
  },
  deleteSection: async (id) => {
    const res = await fetchWithAuth(`${API_BASE}/sections/${id}`, {
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

  // Absences management
  getAbsences: async () => {
    const res = await fetchWithAuth(`${API_BASE}/absences`);
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

  // Overload Reasons management
  getOverloadReasons: async (schoolYear = 'SY 26-27', term = 'Term 1') => {
    const res = await fetchWithAuth(`${API_BASE}/overload-reasons?schoolYear=${encodeURIComponent(schoolYear)}&term=${encodeURIComponent(term)}`);
    return res.json();
  },
  saveOverloadReasons: async ({ personnelId, schoolYear = 'SY 26-27', term = 'Term 1', reasons }) => {
    const res = await fetchWithAuth(`${API_BASE}/overload-reasons/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personnelId, schoolYear, term, reasons })
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

  sharePersonnelToClusteredSchools: async (prn, target_school_ids, first_name, last_name) => {
    const res = await fetchWithAuth(`${API_BASE}/personnel/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prn, target_school_ids, first_name, last_name })
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
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
  getSchoolDraft: async (schoolYear) => {
    const res = await fetchWithAuth(`${API_BASE}/school/draft?schoolYear=${encodeURIComponent(schoolYear)}`);
    return res.json();
  },
  saveSchoolDraft: async (schoolYear, payload) => {
    const res = await fetchWithAuth(`${API_BASE}/school/draft`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolYear, payload })
    });
    return res.json();
  },
  deleteSchoolDraft: async (schoolYear) => {
    const res = await fetchWithAuth(`${API_BASE}/school/draft?schoolYear=${encodeURIComponent(schoolYear)}`, {
      method: 'DELETE'
    });
    return res.json();
  },
  getIncomingRequests: async () => {
    const res = await fetchWithAuth(`${API_BASE}/requests/incoming`);
    return res.json();
  },
  getOutgoingRequests: async () => {
    const res = await fetchWithAuth(`${API_BASE}/requests/outgoing`);
    return res.json();
  },
  getRequestHistory: async () => {
    const res = await fetchWithAuth(`${API_BASE}/requests/history`);
    return res.json();
  },
  getDistrictSchools: async () => {
    const res = await fetchWithAuth(`${API_BASE}/requests/district-schools`);
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
    const res = await fetchWithAuth(`${API_BASE}/shs-workloads/${personnelId}`);
    return res.json();
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
  }
};
