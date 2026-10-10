import { configureDraftSaver } from "./draftSaver";
import {
  configureHealth,
  waitUntilHealthy,
  recordServerFailure,
  recordServerSuccess,
  isServerFailureStatus,
} from "./serverHealth";
import { reportUnauthorized, resolveSchoolId } from "./session";
import { noteApiError, noteApiSuccess, summarizePayload } from "./errorAlert";

export const getApiBase = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== "undefined" && window.location) {
    const pathname = window.location.pathname || "";
    if (pathname.includes("/insighted-esf7-prod")) {
      return "/insighted-esf7-prod/api";
    }
    if (pathname.includes("/insighted-esf7-staging")) {
      return "/insighted-esf7-staging/api";
    }
    if (pathname.includes("/insighted/Insighted-esf7")) {
      return "/insighted/Insighted-esf7/api";
    }
    if (pathname.includes("/insighted-esf7")) {
      return "/insighted-esf7/api";
    }
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    ) {
      return "/api";
    }
    if (window.location.hostname.includes("stride.deped.gov.ph")) {
      return "/insighted-esf7-prod/api";
    }
  }
  return "/api";
};

export const API_BASE = getApiBase();
// The server-health lock polls ONLY the readiness check (app + PostgreSQL). /health and /health/deep also require Redis
// and are for monitoring; using them here would lock users out during a Redis outage.
configureHealth({ url: `${API_BASE}/health/readiness` });

const REQUEST_TIMEOUT_MS = 60000;

export const fetchWithAuth = async (url, options = {}) => {
  // While the server-health lock is on, new calls wait instead of firing and failing.
  await waitUntilHealthy();
  const token = localStorage.getItem("token");
  const activeSchoolId = resolveSchoolId(null);

  const headers = {
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(activeSchoolId ? { "x-school-id": activeSchoolId } : {}),
  };

  // What was requested (method + payload field names + ids; never the token) - attached to any failure for the error report.
  const reqMethod = String(options.method || "GET").toUpperCase();
  const reqSummary = summarizePayload(
    typeof options.body === "string" ? options.body : null,
  );
  const describeFailure = (e) => {
    e.method = e.method || reqMethod;
    e.url = e.url || url;
    e.payloadKeys = e.payloadKeys || reqSummary.payloadKeys;
    e.requestIds = e.requestIds || reqSummary.ids;
    // Background GET failures are covered by the load notices / server-health lock; writes always get reported.
    if (reqMethod !== "GET" && !String(url).includes("/health"))
      noteApiError(e);
    return e;
  };
  // Own controller so we can tell a timeout apart from a caller-initiated abort.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const callerSignal = options.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else
      callerSignal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    try {
      Object.defineProperty(res, "__req", {
        value: { method: reqMethod, ...reqSummary },
      });
    } catch (e) {
      /* not extensible */
    }
    if (res.ok) noteApiSuccess(reqMethod, url);
    // 401 on an authenticated call = the session is no longer valid (expired token, rotated secret). Not a server failure.
    if (res.status === 401 && token && !String(url).includes("/auth/"))
      reportUnauthorized({ url: String(url) });
    if (isServerFailureStatus(res.status)) {
      recordServerFailure({
        name: "ApiError",
        message: `Server responded with HTTP ${res.status}`,
        url,
        status: res.status,
      });
    } else {
      recordServerSuccess(); // 2xx/3xx and 4xx (validation/auth) are not server failures
    }
    return res;
  } catch (err) {
    if (timedOut) {
      const e = new ApiError("The request timed out.", { url });
      e.name = "TimeoutError";
      recordServerFailure(e);
      throw describeFailure(e);
    }
    if (err.name === "AbortError") throw err; // caller aborted (e.g. superseded draft save)
    if (err instanceof TypeError) {
      const netErr = /** @type {TypeError & { url?: string }} */ (err);
      netErr.url = netErr.url || url;
      recordServerFailure(netErr); // network failure
      throw describeFailure(netErr);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ url?: string, status?: number, cause?: unknown }} [details]
   */
  constructor(message, { url, status, cause } = {}) {
    super(message);
    this.name = "ApiError";
    this.url = url;
    this.status = status;
    /** @type {any} parsed JSON body of a non-OK reply, when the server sent one */
    this.body = null;
    /** @type {string} */ this.method = "";
    /** @type {string} */ this.statusText = "";
    /** @type {string[]} */ this.payloadKeys = [];
    /** @type {Record<string,string>} */ this.requestIds = {};
    if (cause) this.cause = cause;
  }
}

const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Single shared response handler: checks res.ok and content-type before parsing, so an HTML gateway page never
// reaches res.json(). On a non-OK JSON reply the server's own message (error/message) and body are kept on the ApiError.
// Adds method, status text and what was sent to an error, and queues it for the shared error alert (unless a catch
// block handles it first - see errorAlert.noteApiError). `note: false` is used between automatic retries.
const decorate = (err, res, note = true) => {
  const req = res && res.__req;
  err.statusText = (res && res.statusText) || "";
  if (req) {
    err.method = req.method;
    err.payloadKeys = req.payloadKeys || [];
    err.requestIds = req.ids || {};
  }
  if (
    note &&
    (!req ||
      req.method !== "GET" ||
      (res && res.status >= 400 && res.status < 500 && res.status !== 404))
  )
    noteApiError(err);
  return err;
};

const parseJsonOrThrow = async (res, url = res.url, { note = true } = {}) => {
  const type = res.headers.get("content-type") || "";
  const isJson = type.includes("application/json");
  if (!res.ok) {
    let body = null;
    if (isJson) {
      try {
        body = await res.json();
      } catch (e) {
        body = null;
      }
    }
    const serverMessage = body && (body.error || body.message);
    const err = new ApiError(
      RETRYABLE_STATUSES.has(res.status)
        ? `The server is busy or timed out (HTTP ${res.status}). Please try again shortly.`
        : (typeof serverMessage === "string" && serverMessage) ||
            `Request failed (HTTP ${res.status}).`,
      { url, status: res.status },
    );
    err.body = body;
    throw decorate(err, res, note);
  }
  if (!isJson) {
    throw decorate(
      new ApiError("The server returned an unexpected (non-JSON) response.", {
        url,
        status: res.status,
      }),
      res,
      note,
    );
  }
  try {
    return await res.json();
  } catch (e) {
    throw decorate(
      new ApiError("The server returned invalid JSON.", {
        url,
        status: res.status,
        cause: e,
      }),
      res,
      note,
    );
  }
};

// Retries 502/503/504 and network failures with exponential backoff (0.5s, 1s, 2s).
const fetchJsonWithRetry = async (url, options = {}, retries = 3) => {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithAuth(url, options);
      return await parseJsonOrThrow(res, url, { note: attempt === retries });
    } catch (err) {
      if (err.name === "AbortError") throw err;
      lastErr = err;
      const retryable =
        err instanceof ApiError
          ? RETRYABLE_STATUSES.has(err.status ?? 0)
          : err instanceof TypeError;
      if (!retryable || attempt === retries) break;
      await sleep(500 * 2 ** attempt);
    }
  }
  if (lastErr && !lastErr.url) lastErr.url = url;
  if (lastErr && lastErr.status !== undefined && lastErr.method !== "GET")
    noteApiError(lastErr);
  throw lastErr;
};

// Single routing rule for sections (used for save and for deciding what goes in the regular-section transaction).
function sectionKindOf(data) {
  const sectionType = String(
    data.sectionType || data.section_type || "MONO GRADE",
  ).toUpperCase();
  const gradeLevel = String(
    data.gradeLevel || data.grade_level || "",
  ).toUpperCase();
  if (
    sectionType.includes("ARAL") ||
    gradeLevel.includes("ARAL") ||
    data.aralBasis ||
    data.aralToolKey ||
    data.aralTool
  )
    return "aral";
  if (
    sectionType.includes("SNED") ||
    sectionType.includes("NON-GRADED") ||
    gradeLevel.includes("SNED") ||
    gradeLevel.includes("NON-GRADED") ||
    gradeLevel.includes("SPED")
  )
    return "sned";
  if (sectionType.includes("ALS") || gradeLevel.includes("ALS")) return "als";
  if (
    sectionType === "REMEDIAL" ||
    sectionType === "ENRICHMENT" ||
    data.interventionType ||
    data.intervention_type
  )
    return "remedial-enrichment";
  return "regular";
}

export const api = {
  // Dashboard stats
  getDashboardStats: async (simulatedDate = null) => {
    const query = simulatedDate
      ? `?simulated_date=${encodeURIComponent(simulatedDate)}`
      : "";
    const res = await fetchWithAuth(`${API_BASE}/dashboard/stats${query}`);
    return parseJsonOrThrow(res);
  },

  // School Profile
  getSchool: async (targetSchoolId = null) => {
    const activeId = resolveSchoolId(targetSchoolId);
    const customHeaders = activeId ? { "x-school-id": String(activeId) } : {};
    const query = activeId ? `?school_id=${encodeURIComponent(activeId)}` : "";
    const res = await fetchWithAuth(`${API_BASE}/school${query}`, {
      headers: customHeaders,
    });
    return parseJsonOrThrow(res);
  },
  updateSchool: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/school`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return parseJsonOrThrow(res);
  },
  updateSchoolSubjects: async (subjectsConfig) => {
    const res = await fetchWithAuth(`${API_BASE}/school-info/subjects`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectsConfig }),
    });
    return parseJsonOrThrow(res);
  },
  updateCurricularConfig: async (configData) => {
    const res = await fetchWithAuth(`${API_BASE}/schools/curricular-config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(configData),
    });
    return parseJsonOrThrow(res);
  },

  // Personnel Roster
  /**
   * @param {string | null} [targetSchoolId]
   * @param {{ page?: number, limit?: number }} [params]
   */
  getPersonnel: async (targetSchoolId = null, params = {}) => {
    targetSchoolId = resolveSchoolId(targetSchoolId) || null;
    const customHeaders = targetSchoolId
      ? { "x-school-id": targetSchoolId }
      : {};
    const queryParams = new URLSearchParams();
    if (targetSchoolId) queryParams.set("school_id", targetSchoolId);
    if (params && params.page) queryParams.set("page", String(params.page));
    if (params && params.limit) queryParams.set("limit", String(params.limit));
    const qs = queryParams.toString() ? `?${queryParams.toString()}` : "";
    return await fetchJsonWithRetry(`${API_BASE}/personnel${qs}`, {
      headers: customHeaders,
    });
  },
  /** @param {string | null} [targetSchoolId] */
  getAutofillTemplate: async (targetSchoolId = null) => {
    targetSchoolId = resolveSchoolId(targetSchoolId) || null;
    const customHeaders = targetSchoolId
      ? { "x-school-id": targetSchoolId }
      : {};
    const query = targetSchoolId
      ? `?school_id=${encodeURIComponent(targetSchoolId)}`
      : "";
    const res = await fetchWithAuth(
      `${API_BASE}/personnel/autofill-template${query}`,
      { headers: customHeaders },
    );
    return parseJsonOrThrow(res);
  },
  saveBulkPersonnel: async (personnelList) => {
    const res = await fetchWithAuth(`${API_BASE}/personnel/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personnelList }),
    });
    return parseJsonOrThrow(res);
  },
  importBulkHarvester: async (schoolId, personnelList) => {
    const res = await fetchWithAuth(
      `${API_BASE}/personnel/bulk-harvester-import`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId, personnelList }),
      },
    );
    return parseJsonOrThrow(res);
  },
  addPersonnel: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/personnel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return parseJsonOrThrow(res);
  },
  deletePersonnel: async (id, meta = {}) => {
    const res = await fetchWithAuth(`${API_BASE}/personnel/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    });
    return parseJsonOrThrow(res);
  },
  updatePersonnel: async (id, data) => {
    const res = await fetchWithAuth(`${API_BASE}/personnel/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return parseJsonOrThrow(res);
  },
  verifyPersonnel: async (id, field, value) => {
    const res = await fetchWithAuth(`${API_BASE}/personnel/${id}/verify`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, value }),
    });
    return parseJsonOrThrow(res);
  },
  getSdoSchoolHead: async () => {
    const res = await fetchWithAuth(`${API_BASE}/school-head-sdo`);
    return parseJsonOrThrow(res);
  },
  saveSdoSchoolHead: async (record) => {
    const res = await fetchWithAuth(`${API_BASE}/school-head-sdo`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    return parseJsonOrThrow(res);
  },
  toggleSchoolHead: async (id, isSchoolHead) => {
    const res = await fetchWithAuth(`${API_BASE}/personnel/${id}/school-head`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSchoolHead }),
    });
    return parseJsonOrThrow(res);
  },

  // Workload Schedules (esf7_workload_rows)
  saveWorkloadBatch: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/workloads/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return parseJsonOrThrow(res);
  },
  getWorkloadsByPersonnel: async (personnelId) => {
    const res = await fetchWithAuth(
      `${API_BASE}/workloads/personnel/${personnelId}`,
    );
    return parseJsonOrThrow(res);
  },
  // Saved rows for one teacher + term from esf7_workload_rows, plus the version marker: { rows, version }.
  getWorkloadState: async (personnelId, term, schoolId) => {
    const cleanId = String(resolveSchoolId(schoolId) || "")
      .replace(/^SCH-/i, "")
      .trim();
    const query = `?schoolId=${encodeURIComponent(cleanId)}&term=${encodeURIComponent(term)}`;
    const res = await fetchWithAuth(
      `${API_BASE}/workloads/personnel/${encodeURIComponent(personnelId)}/state${query}`,
    );
    return parseJsonOrThrow(res);
  },
  // Deletes one teacher's rows for one term from the database: { deleted, workloadSavedAt }.
  clearTeacherTermWorkload: async (personnelId, term, schoolId) => {
    const cleanId = String(resolveSchoolId(schoolId) || "")
      .replace(/^SCH-/i, "")
      .trim();
    const res = await fetchWithAuth(
      `${API_BASE}/workloads/personnel/${encodeURIComponent(personnelId)}/term/${encodeURIComponent(term)}?schoolId=${encodeURIComponent(cleanId)}`,
      { method: "DELETE" },
    );
    return parseJsonOrThrow(res);
  },
  // Deletes every teacher's rows for one term in the school from the database: { deleted, workloadSavedAt }.
  clearSchoolTermWorkload: async (schoolId, term) => {
    const cleanId = String(resolveSchoolId(schoolId) || "")
      .replace(/^SCH-/i, "")
      .trim();
    const res = await fetchWithAuth(
      `${API_BASE}/workloads/term-clear/school?schoolId=${encodeURIComponent(cleanId)}&term=${encodeURIComponent(term)}`,
      { method: "DELETE" },
    );
    return parseJsonOrThrow(res);
  },

  // Employment Tab Details
  updateEmployment: async (personnelId, data) => {
    const res = await fetchWithAuth(`${API_BASE}/employment/${personnelId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return parseJsonOrThrow(res);
  },

  // Qualifications Tab Details
  updateQualifications: async (personnelId, data) => {
    const res = await fetchWithAuth(
      `${API_BASE}/qualifications/${personnelId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
    return parseJsonOrThrow(res);
  },

  // Trainings (NEAP, Certifications, Other)
  addTraining: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/trainings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return parseJsonOrThrow(res);
  },
  updatePersonnelTrainings: async (personnelId, data) => {
    const res = await fetchWithAuth(
      `${API_BASE}/trainings/personnel/${personnelId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
    return parseJsonOrThrow(res);
  },
  deleteTraining: async (id) => {
    const res = await fetchWithAuth(`${API_BASE}/trainings/${id}`, {
      method: "DELETE",
    });
    return parseJsonOrThrow(res);
  },

  // Class Sections (3 Tailored Tables)
  getSections: async () => {
    const res = await fetchWithAuth(`${API_BASE}/sections`);
    return parseJsonOrThrow(res);
  },
  // Which of the section tables a section belongs to: 'regular' | 'aral' | 'sned' | 'als' | 'remedial-enrichment'.
  sectionKind: (data) => sectionKindOf(data),
  // Whole regular-section save in ONE database transaction (upserts + explicit deletes).
  syncRegularSections: async ({
    schoolId,
    schoolYear,
    sections,
    deletedIds,
  }) => {
    const res = await fetchWithAuth(`${API_BASE}/sections/regular/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schoolId, schoolYear, sections, deletedIds }),
    });
    return parseJsonOrThrow(res);
  },
  addSection: async (data) => {
    const endpoint = `${API_BASE}/sections/${sectionKindOf(data)}`;
    const res = await fetchWithAuth(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return parseJsonOrThrow(res);
  },
  createSection: async function (data) {
    return await this.addSection(data);
  },
  addRegularSection: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/sections/regular`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return parseJsonOrThrow(res);
  },
  addAralSection: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/sections/aral`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return parseJsonOrThrow(res);
  },
  addRemedialEnrichmentSection: async (data) => {
    const res = await fetchWithAuth(
      `${API_BASE}/sections/remedial-enrichment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
    return parseJsonOrThrow(res);
  },
  updateSectionAdviser: async (
    id,
    advisorId,
    advisory_minutes = 300,
    hgp_minutes = 60,
    numberOfLearners = null,
  ) => {
    const res = await fetchWithAuth(`${API_BASE}/sections/regular`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        adviser_id: advisorId,
        adviserId: advisorId,
        advisory_minutes,
        hgp_minutes,
        number_of_learners:
          numberOfLearners !== null &&
          numberOfLearners !== undefined &&
          numberOfLearners !== ""
            ? Number(numberOfLearners)
            : null,
      }),
    });
    return parseJsonOrThrow(res);
  },
  deleteSection: async (id) => {
    const res = await fetchWithAuth(
      `${API_BASE}/sections/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );
    return parseJsonOrThrow(res);
  },
  clearAllSections: async (schoolId) => {
    const res = await fetchWithAuth(
      `${API_BASE}/sections/clear-all?schoolId=${encodeURIComponent(schoolId || "")}`,
      {
        method: "DELETE",
      },
    );
    return parseJsonOrThrow(res);
  },

  // Workload Schedules
  addWorkloadRow: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/workloads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return parseJsonOrThrow(res);
  },
  updatePersonnelWorkloadRows: async (
    personnelId,
    workloadRows,
    teachingRelatedRows,
    administrativeRows,
  ) => {
    const res = await fetchWithAuth(
      `${API_BASE}/workloads/personnel/${personnelId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workloadRows,
          teachingRelatedRows,
          administrativeRows,
        }),
      },
    );
    return parseJsonOrThrow(res);
  },
  deleteWorkloadRow: async (id) => {
    const res = await fetchWithAuth(`${API_BASE}/workloads/${id}`, {
      method: "DELETE",
    });
    return parseJsonOrThrow(res);
  },

  // Workload Coverage / Substitution transfers
  getTransfers: async () => {
    const res = await fetchWithAuth(`${API_BASE}/transfers`);
    return parseJsonOrThrow(res);
  },
  createBatchTransfers: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/transfers/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return parseJsonOrThrow(res);
  },
  updateTransferStatus: async (id, status) => {
    const res = await fetchWithAuth(`${API_BASE}/transfers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    return parseJsonOrThrow(res);
  },

  // Absences & Tardiness / Undertime management
  getAbsences: async () => {
    const res = await fetchWithAuth(`${API_BASE}/absences`);
    return parseJsonOrThrow(res);
  },
  getOverloadLateUndertime: async (
    schoolYear = "2026-2027",
    personnelId = null,
    term = null,
    month = null,
  ) => {
    let url = `${API_BASE}/overload-late-undertime?schoolYear=${encodeURIComponent(schoolYear)}`;
    if (personnelId) url += `&personnelId=${encodeURIComponent(personnelId)}`;
    if (term) url += `&term=${encodeURIComponent(term)}`;
    if (month) url += `&month=${encodeURIComponent(month)}`;
    const res = await fetchWithAuth(url);
    return parseJsonOrThrow(res);
  },
  saveOverloadLateUndertime: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/overload-late-undertime`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return parseJsonOrThrow(res);
  },
  deleteOverloadLateUndertime: async (id) => {
    const res = await fetchWithAuth(
      `${API_BASE}/overload-late-undertime/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );
    return parseJsonOrThrow(res);
  },

  // Allowances & Incentives management
  getPersonnelAllowances: async (schoolYear = "SY 26-27") => {
    const res = await fetchWithAuth(
      `${API_BASE}/allowances?schoolYear=${encodeURIComponent(schoolYear)}`,
    );
    return parseJsonOrThrow(res);
  },
  togglePersonnelAllowance: async (
    personnelId,
    allowanceKey,
    isGranted,
    schoolYear = "SY 26-27",
  ) => {
    const res = await fetchWithAuth(`${API_BASE}/allowances/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personnelId,
        allowanceKey,
        isGranted,
        schoolYear,
      }),
    });
    return parseJsonOrThrow(res);
  },
  setPersonnelAllowanceDisabled: async (
    personnelId,
    allowanceKey,
    isDisabled,
    schoolYear = "SY 26-27",
  ) => {
    const res = await fetchWithAuth(`${API_BASE}/allowances/disable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personnelId,
        allowanceKey,
        isDisabled,
        schoolYear,
      }),
    });
    return parseJsonOrThrow(res);
  },
  bulkUpdatePersonnelAllowances: async (
    personnelId,
    allowances,
    schoolYear = "SY 26-27",
  ) => {
    const res = await fetchWithAuth(`${API_BASE}/allowances/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personnelId, allowances, schoolYear }),
    });
    return parseJsonOrThrow(res);
  },

  // Overload Reasons & Pay management
  getOverloadReasons: async (schoolYear = "SY 26-27", term = "Term 1") => {
    const res = await fetchWithAuth(
      `${API_BASE}/overload-reasons?schoolYear=${encodeURIComponent(schoolYear)}&term=${encodeURIComponent(term)}`,
    );
    return parseJsonOrThrow(res);
  },
  saveOverloadReasons: async ({
    personnelId,
    schoolYear = "SY 26-27",
    term = "Term 1",
    month = "All",
    reasons,
    overloadHours = 0,
    overloadPay = 0,
    netTermPay = 0,
    rawPayload,
  }) => {
    const res = await fetchWithAuth(`${API_BASE}/overload-reasons/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personnelId,
        schoolYear,
        term,
        month,
        reasons,
        overloadHours,
        overloadPay,
        netTermPay,
        rawPayload,
      }),
    });
    return parseJsonOrThrow(res);
  },
  saveOverloadReasonsBatch: async ({
    items = [],
    schoolYear = "SY 26-27",
    term = "Term 1",
  }) => {
    const res = await fetchWithAuth(`${API_BASE}/overload-reasons/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, schoolYear, term }),
    });
    return parseJsonOrThrow(res);
  },

  // Work Immersion management
  getWorkImmersionSchedules: async (personnelId, schoolYear = "2026-2027") => {
    const res = await fetchWithAuth(
      `${API_BASE}/work-immersion/${personnelId}?schoolYear=${encodeURIComponent(schoolYear)}`,
    );
    return parseJsonOrThrow(res);
  },
  saveWorkImmersionBatch: async ({
    personnelId,
    schoolId = "123456",
    schoolYear = "2026-2027",
    schedules,
  }) => {
    const res = await fetchWithAuth(`${API_BASE}/work-immersion/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personnelId, schoolId, schoolYear, schedules }),
    });
    return parseJsonOrThrow(res);
  },
  deleteWorkImmersionDate: async ({
    personnelId,
    schoolYear = "2026-2027",
    date,
  }) => {
    const res = await fetchWithAuth(`${API_BASE}/work-immersion/date`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personnelId, schoolYear, date }),
    });
    return parseJsonOrThrow(res);
  },

  // Feature A — Learning Area Matrix management
  getLearningAreas: async (personnelId) => {
    const res = await fetchWithAuth(
      `${API_BASE}/learning-areas?personnelId=${encodeURIComponent(personnelId)}`,
    );
    if (!res.ok) throw new Error("Failed to fetch learning areas");
    return parseJsonOrThrow(res);
  },
  saveLearningArea: async ({
    personnelId,
    schoolYear,
    learningArea,
    checked,
    yearsTaught,
  }) => {
    const res = await fetchWithAuth(`${API_BASE}/learning-areas/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personnelId,
        schoolYear,
        learningArea,
        checked,
        yearsTaught,
      }),
    });
    if (!res.ok) throw new Error("Failed to save learning area");
    return parseJsonOrThrow(res);
  },

  getExtraTasks: async (personnelId = null) => {
    const query = personnelId
      ? `?personnelId=${encodeURIComponent(personnelId)}`
      : "";
    const res = await fetchWithAuth(`${API_BASE}/extra-tasks${query}`);
    if (!res.ok) throw new Error("Failed to fetch extra tasks");
    return parseJsonOrThrow(res);
  },

  saveExtraTasks: async (personnelId, tasks = []) => {
    const res = await fetchWithAuth(`${API_BASE}/extra-tasks/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personnelId, tasks }),
    });
    if (!res.ok) throw new Error("Failed to save extra tasks");
    return parseJsonOrThrow(res);
  },

  sharePersonnelToClusteredSchools: async (
    prn,
    target_school_ids,
    first_name,
    last_name,
  ) => {
    const res = await fetchWithAuth(`${API_BASE}/personnel/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prn, target_school_ids, first_name, last_name }),
    });
    if (!res.ok) throw new Error(await res.text());
    return parseJsonOrThrow(res);
  },

  submitRoomProfiling: async (data) => {
    const res = await fetch(`${API_BASE}/room-profiling/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      let errMsg = "Failed to submit room profile";
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
    return parseJsonOrThrow(res);
  },
  syncRoomRoster: async (schoolId, roster = []) => {
    const res = await fetch(`${API_BASE}/room-profiling/sync-roster`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schoolId, roster }),
    });
    if (!res.ok) {
      let errMsg = "Failed to sync roster to database";
      try {
        const errJson = await res.json();
        if (errJson && errJson.error) errMsg = errJson.error;
        else if (errJson && errJson.message) errMsg = errJson.message;
      } catch (_) {
        try {
          const errText = await res.text();
          if (errText) errMsg = errText;
        } catch (__) {}
      }
      throw new Error(errMsg);
    }
    return parseJsonOrThrow(res);
  },
  getRoomRoster: async (schoolId = "502624") => {
    try {
      const res = await fetch(
        `${API_BASE}/room-profiling/roster?schoolId=${encodeURIComponent(schoolId)}`,
      );
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      return [];
    }
  },
  verifyRoomPasscode: async ({ schoolId, passcode }) => {
    try {
      const res = await fetch(`${API_BASE}/room-profiling/verify-passcode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId, passcode }),
      });
      if (!res.ok)
        return { success: false, message: "Server verification failed" };
      return await res.json();
    } catch (e) {
      return { success: false, message: e.message };
    }
  },
  getPendingRoomSubmissions: async (schoolId = "199998") => {
    const res = await fetch(
      `${API_BASE}/room-profiling/pending?schoolId=${encodeURIComponent(schoolId)}`,
    );
    if (!res.ok) throw new Error("Failed to fetch pending room submissions");
    return parseJsonOrThrow(res);
  },
  getApprovedRoomSubmissions: async (schoolId = "199998") => {
    const res = await fetch(
      `${API_BASE}/room-profiling/approved?schoolId=${encodeURIComponent(schoolId)}`,
    );
    if (!res.ok) throw new Error("Failed to fetch approved room submissions");
    return parseJsonOrThrow(res);
  },
  ackRoomSubmissions: async ({
    schoolId,
    submissionIds = [],
    personnelIds = [],
  }) => {
    const res = await fetch(`${API_BASE}/room-profiling/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schoolId, submissionIds, personnelIds }),
    });
    if (!res.ok) throw new Error("Failed to acknowledge room submissions");
    return parseJsonOrThrow(res);
  },
  acceptRoomSubmissions: async ({
    schoolId,
    submissions = [],
    submission,
    selectedFields,
  }) => {
    const res = await fetch(`${API_BASE}/room-profiling/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schoolId,
        submissions,
        submission,
        selectedFields,
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(
        errBody.error ||
          `Failed to accept room submissions (HTTP ${res.status})`,
      );
    }
    return parseJsonOrThrow(res);
  },
  getProfilingSnapshots: async (schoolId = "199998") => {
    const res = await fetch(
      `${API_BASE}/room-profiling/snapshots?schoolId=${encodeURIComponent(schoolId)}`,
    );
    if (!res.ok) throw new Error("Failed to fetch snapshots");
    return parseJsonOrThrow(res);
  },
  saveProfilingSnapshot: async ({ schoolId, snapshotName, personnel }) => {
    const res = await fetch(`${API_BASE}/room-profiling/snapshots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schoolId, snapshotName, personnel }),
    });
    if (!res.ok) throw new Error("Failed to save snapshot");
    return parseJsonOrThrow(res);
  },
  getProfilingSnapshotById: async (id) => {
    const res = await fetch(
      `${API_BASE}/room-profiling/snapshots/${encodeURIComponent(id)}`,
    );
    if (!res.ok) throw new Error("Failed to fetch snapshot by ID");
    return parseJsonOrThrow(res);
  },
  checkPasscodeLockout: async ({ schoolId, passcode, personnelId }) => {
    try {
      const params = new URLSearchParams();
      if (schoolId) params.append("schoolId", schoolId);
      if (passcode) params.append("passcode", passcode);
      if (personnelId) params.append("personnelId", personnelId);
      const res = await fetch(
        `${API_BASE}/room-profiling/check-lockout?${params.toString()}`,
      );
      if (!res.ok) return { isLockedOut: false, lockoutRemainingSecs: 0 };
      return parseJsonOrThrow(res);
    } catch (e) {
      return { isLockedOut: false, lockoutRemainingSecs: 0 };
    }
  },
  recordPasscodeAttempt: async ({
    schoolId,
    passcode,
    personnelId,
    isSuccess,
  }) => {
    try {
      const res = await fetch(`${API_BASE}/room-profiling/record-attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId, passcode, personnelId, isSuccess }),
      });
      if (!res.ok) return { isLockedOut: false };
      return parseJsonOrThrow(res);
    } catch (e) {
      return { isLockedOut: false };
    }
  },

  addAbsence: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/absences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return parseJsonOrThrow(res);
  },
  deleteAbsence: async (id) => {
    const res = await fetchWithAuth(`${API_BASE}/absences/${id}`, {
      method: "DELETE",
    });
    return parseJsonOrThrow(res);
  },
  getSalaryMatrix: async () => {
    const res = await fetchWithAuth(`${API_BASE}/salary-matrix`);
    return parseJsonOrThrow(res);
  },
  submitSchoolWorkload: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return parseJsonOrThrow(res);
  },
  getSubmissionStatus: async (jobId) => {
    const res = await fetchWithAuth(`${API_BASE}/submissions/status/${jobId}`);
    return parseJsonOrThrow(res);
  },
  getSchoolDraft: async (schoolYear = "SY 26-27", targetSchoolId = null) => {
    const rawId = resolveSchoolId(targetSchoolId);
    const cleanId = rawId ? String(rawId).replace(/^SCH-/i, "").trim() : "";
    const query = cleanId ? `&schoolId=${encodeURIComponent(cleanId)}` : "";
    const customHeaders = cleanId ? { "x-school-id": cleanId } : {};
    const res = await fetchWithAuth(
      `${API_BASE}/school/draft?schoolYear=${encodeURIComponent(schoolYear)}${query}`,
      { headers: customHeaders },
    );
    return parseJsonOrThrow(res);
  },
  // Never aborted: a save may already be committing on the server. Ordering/supersession is handled by draftSaver.
  // Resolves { success, version, updatedAt }, or { conflict: true, currentVersion } on HTTP 409.
  saveSchoolDraft: async (schoolYear, payload, baseVersion = null) => {
    const explicitId =
      payload?.schoolInfo &&
      (payload.schoolInfo.schoolId || payload.schoolInfo.school_id);
    const rawId = resolveSchoolId(explicitId);
    const cleanId = rawId ? String(rawId).replace(/^SCH-/i, "").trim() : "";
    const customHeaders = cleanId ? { "x-school-id": cleanId } : {};
    const url = `${API_BASE}/school/draft`;

    try {
      const res = await fetchWithAuth(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...customHeaders },
        body: JSON.stringify({ schoolYear, payload, baseVersion }),
      });
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        return { conflict: true, currentVersion: body.currentVersion };
      }
      return await parseJsonOrThrow(res, url);
    } catch (err) {
      if (err instanceof TypeError && !(/** @type {any} */ (err).url))
        /** @type {any} */ (err).url = url;
      throw err;
    }
  },
  deleteSchoolDraft: async (schoolYear) => {
    const res = await fetchWithAuth(
      `${API_BASE}/school/draft?schoolYear=${encodeURIComponent(schoolYear)}`,
      {
        method: "DELETE",
      },
    );
    return parseJsonOrThrow(res);
  },

  // Node Status & Boolean Progress Tracking
  getNodeStatus: async (schoolYear = "SY 26-27", targetSchoolId = null) => {
    const rawId = resolveSchoolId(targetSchoolId);
    const cleanId = rawId ? String(rawId).replace(/^SCH-/i, "").trim() : "";
    const query = cleanId ? `&school_id=${encodeURIComponent(cleanId)}` : "";
    const customHeaders = cleanId ? { "x-school-id": cleanId } : {};
    const res = await fetchWithAuth(
      `${API_BASE}/node-status/school?schoolYear=${encodeURIComponent(schoolYear)}${query}`,
      { headers: customHeaders },
    );
    return parseJsonOrThrow(res);
  },
  saveSchoolNode: async (
    nodeId,
    payload = {},
    schoolYear = "SY 26-27",
    overallStatus = "IN_PROGRESS",
    overallPercentage = 0,
  ) => {
    const res = await fetchWithAuth(
      `${API_BASE}/node-status/school/${encodeURIComponent(nodeId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolYear,
          payload,
          overallStatus,
          overallPercentage,
        }),
      },
    );
    return parseJsonOrThrow(res);
  },
  getPersonnelNodeStatus: async (schoolYear = "SY 26-27") => {
    const res = await fetchWithAuth(
      `${API_BASE}/node-status/personnel?schoolYear=${encodeURIComponent(schoolYear)}`,
    );
    return parseJsonOrThrow(res);
  },
  savePersonnelNode: async (personnelId, nodeId, data = {}) => {
    const {
      payload = {},
      schoolYear = "SY 26-27",
      personnelName,
      positionTitle,
      category,
      isSchoolHead,
      isComplete,
    } = data;
    const res = await fetchWithAuth(
      `${API_BASE}/node-status/personnel/${encodeURIComponent(personnelId)}/${encodeURIComponent(nodeId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolYear,
          personnelName,
          positionTitle,
          category,
          isSchoolHead,
          isComplete,
          payload,
        }),
      },
    );
    return parseJsonOrThrow(res);
  },
  getIncomingRequests: async (schoolId) => {
    const rawId = resolveSchoolId(schoolId);
    const cleanId = rawId ? String(rawId).replace(/^SCH-/i, "").trim() : "";
    const query = cleanId ? `?schoolId=${encodeURIComponent(cleanId)}` : "";
    const res = await fetchWithAuth(`${API_BASE}/requests/incoming${query}`);
    return parseJsonOrThrow(res);
  },
  getOutgoingRequests: async (schoolId) => {
    const rawId = resolveSchoolId(schoolId);
    const cleanId = rawId ? String(rawId).replace(/^SCH-/i, "").trim() : "";
    const query = cleanId ? `?schoolId=${encodeURIComponent(cleanId)}` : "";
    const res = await fetchWithAuth(`${API_BASE}/requests/outgoing${query}`);
    return parseJsonOrThrow(res);
  },
  getRequestHistory: async (schoolId) => {
    const rawId = resolveSchoolId(schoolId);
    const cleanId = rawId ? String(rawId).replace(/^SCH-/i, "").trim() : "";
    const query = cleanId ? `?schoolId=${encodeURIComponent(cleanId)}` : "";
    const res = await fetchWithAuth(`${API_BASE}/requests/history${query}`);
    return parseJsonOrThrow(res);
  },
  getDistrictSchools: async (schoolId, division) => {
    const rawId = resolveSchoolId(schoolId);
    const cleanId = rawId ? String(rawId).replace(/^SCH-/i, "").trim() : "";
    const params = new URLSearchParams();
    if (cleanId) params.append("schoolId", cleanId);
    if (division) params.append("division", division);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetchWithAuth(
      `${API_BASE}/requests/district-schools${query}`,
    );
    return parseJsonOrThrow(res);
  },
  createRequest: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/requests/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || "Failed to create request");
    }
    return json;
  },
  respondToRequest: async (id, action) => {
    const res = await fetchWithAuth(`${API_BASE}/requests/${id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    return parseJsonOrThrow(res);
  },
  getSubmissionHistory: async () => {
    const res = await fetchWithAuth(`${API_BASE}/submissions/history`);
    return parseJsonOrThrow(res);
  },
  downloadESF7XLSB: async () => {
    const res = await fetchWithAuth(`${API_BASE}/reports/esf7-xlsb`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Failed to download XLSB report");
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eSF7_Report.xlsb`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
  downloadESF7PDF: async (schoolId) => {
    const sId = schoolId || "108348";
    const res = await fetchWithAuth(`${API_BASE}/reports/esf7/${sId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Failed to download PDF report");
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eSF7_${sId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
  getCalendarTerms: async (schoolId, schoolYear) => {
    const res = await fetchWithAuth(
      `${API_BASE}/reports/calendar-terms/${schoolId || "123456"}?school_year=${encodeURIComponent(schoolYear || "SY 2026-2027")}`,
    );
    return parseJsonOrThrow(res);
  },
  saveCalendarTerms: async (schoolId, schoolYear, terms) => {
    const res = await fetchWithAuth(`${API_BASE}/reports/calendar-terms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        school_id: schoolId,
        school_year: schoolYear,
        terms,
      }),
    });
    return parseJsonOrThrow(res);
  },
  generateOverloadPayReport: async (payload) => {
    const res = await fetchWithAuth(
      `${API_BASE}/reports/generate-overload-pay`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    return parseJsonOrThrow(res);
  },

  // SHS Workloads
  getShsWorkloads: async (personnelId) => {
    try {
      const res = await fetchWithAuth(
        `${API_BASE}/shs-workloads/${personnelId}`,
      );
      if (!res.ok) {
        return { success: false, data: [] };
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        return { success: true, data };
      }
      return data;
    } catch (err) {
      console.warn("Notice: Could not fetch SHS workloads:", err);
      return { success: false, data: [] };
    }
  },
  saveShsWorkloads: async (personnelId, shsWorkloadRows) => {
    const res = await fetchWithAuth(
      `${API_BASE}/shs-workloads/personnel/${personnelId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shsWorkloadRows }),
      },
    );
    return parseJsonOrThrow(res);
  },
  getShsTransfers: async (personnelId, term) => {
    const res = await fetchWithAuth(
      `${API_BASE}/shs-transfers?personnelId=${personnelId || ""}&term=${term || ""}`,
    );
    return parseJsonOrThrow(res);
  },
  saveShsTransfer: async (transferData) => {
    const res = await fetchWithAuth(`${API_BASE}/shs-transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transferData),
    });
    return parseJsonOrThrow(res);
  },

  // Clustered Personnel Real-Time Ghost Timetable Sync
  getClusteredGhostSlots: async (prn, schoolId) => {
    const query = schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : "";
    const res = await fetchWithAuth(
      `${API_BASE}/requests/clustered/${encodeURIComponent(prn)}/sync${query}`,
    );
    return parseJsonOrThrow(res);
  },
  broadcastClusteredGhostSlots: async (prn, data) => {
    const res = await fetchWithAuth(
      `${API_BASE}/requests/clustered/${encodeURIComponent(prn)}/sync`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
    return parseJsonOrThrow(res);
  },

  // Harvester Upload & Status Endpoints
  getHarvestStatus: async (schoolId) => {
    const res = await fetchWithAuth(
      `${API_BASE}/esf7-upload/status/${encodeURIComponent(schoolId)}`,
    );
    return parseJsonOrThrow(res);
  },
  checkHarvestStatus: async (schoolId) => {
    const res = await fetchWithAuth(
      `${API_BASE}/esf7-upload/check/${encodeURIComponent(schoolId)}`,
    );
    return parseJsonOrThrow(res);
  },
  uploadHarvestFile: async (formData) => {
    const res = await fetchWithAuth(`${API_BASE}/esf7-upload`, {
      method: "POST",
      body: formData,
    });
    return parseJsonOrThrow(res);
  },
  importConvertedHarvest: async (data) => {
    const res = await fetchWithAuth(
      `${API_BASE}/esf7-upload/import-converted`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
    return parseJsonOrThrow(res);
  },

  // SDO Validation & Review Status
  getSchoolValidation: async (schoolId) => {
    try {
      const res = await fetchWithAuth(
        `${API_BASE}/validation/status/${encodeURIComponent(schoolId)}`,
      );
      return await res.json();
    } catch (err) {
      console.warn("Failed to fetch school validation status:", err);
      return { exists: false, error: err.message };
    }
  },
  resubmitSchoolValidation: async (data) => {
    const res = await fetchWithAuth(`${API_BASE}/validation/resubmit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return parseJsonOrThrow(res);
  },

  // Auth passcode login
  passcodeLogin: async (data) => {
    const res = await fetch(`${API_BASE}/auth/passcode-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    let result = {};
    try {
      result = await res.json();
    } catch (err) {
      if (!res.ok) {
        throw new Error(
          `Server returned status ${res.status} (${res.statusText || "Bad Gateway"})`,
        );
      }
    }
    return { ok: res.ok, status: res.status, ...result };
  },

  // Auth password/migrate login
  migrateLogin: async (data) => {
    const res = await fetch(`${API_BASE}/auth/migrate-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    let result = {};
    try {
      result = await res.json();
    } catch (err) {
      if (!res.ok) {
        throw new Error(
          `Server returned status ${res.status} (${res.statusText || "Bad Gateway"})`,
        );
      }
    }
    return { ok: res.ok, status: res.status, ...result };
  },

  // Auth pin login
  pinLogin: async (data) => {
    const res = await fetch(`${API_BASE}/auth/pin-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    let result = {};
    try {
      result = await res.json();
    } catch (err) {
      if (!res.ok) {
        throw new Error(
          `Server returned status ${res.status} (${res.statusText || "Bad Gateway"})`,
        );
      }
    }
    return { ok: res.ok, status: res.status, ...result };
  },
};

configureDraftSaver({
  send: (year, payload, baseVersion) =>
    api.saveSchoolDraft(year, payload, baseVersion),
});
