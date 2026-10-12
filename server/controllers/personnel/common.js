const db = require("../../db");
const { insightEdPool } = require("../../db");
const { reconstructPayload } = require("../../utils/workloadPayload");
const { codec } = require("../../utils/payloadExtras");

const adminTaskPayload = codec("esf7_admin_task");

async function resolvePersonnelId(dbClient, rawId) {
  if (!rawId || typeof rawId !== "string") return rawId;
  const trimmed = rawId.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed;
  }
  const poolOrClient = dbClient || db;
  try {
    const res = await poolOrClient.query(
      "SELECT id FROM esf7_personnel_profile WHERE legacy_id = $1 OR id = $1 LIMIT 1",
      [trimmed],
    );
    if (res.rows.length > 0) return res.rows[0].id;
    const mapRes = await poolOrClient.query(
      "SELECT new_id FROM esf7_personnel_id_mapping WHERE legacy_id = $1 LIMIT 1",
      [trimmed],
    );
    if (mapRes.rows.length > 0) return mapRes.rows[0].new_id;
  } catch (e) {}
  return trimmed;
}

function formatCanonicalPrn(rawPrn, seq) {
  if (rawPrn !== undefined && rawPrn !== null && String(rawPrn).trim()) {
    const s = String(rawPrn).trim().toUpperCase();

    // Pattern 1: PRN-<school_id>-<seq> (e.g. PRN-342285-145) -> extract seq (145)
    const matchSchoolSeq = s.match(/^PRN-\d+-(\d+)$/);
    if (matchSchoolSeq) {
      return `PRN-${parseInt(matchSchoolSeq[1], 10)}`;
    }

    // Pattern 2: PRN-<number> where number is a regular roster index (< 900000, e.g. PRN-1, PRN-145)
    const matchSimple = s.match(/^PRN-(\d+)$/);
    if (matchSimple && Number(matchSimple[1]) < 900000) {
      return `PRN-${parseInt(matchSimple[1], 10)}`;
    }

    // Pattern 3: Plain small number string (e.g. "1", "145")
    const matchDigits = s.match(/^(\d+)$/);
    if (matchDigits && Number(matchDigits[1]) < 900000) {
      return `PRN-${parseInt(matchDigits[1], 10)}`;
    }
  }

  // Fallback: If seq is provided, format as PRN-${seq}
  if (seq !== undefined && seq !== null) {
    return `PRN-${seq}`;
  }

  return "PRN-1";
}

function convertExcelTimeToHHMM(val) {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMinutes = Math.round(num * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const hh = String(hours).padStart(2, "0");
    const mm = String(mins).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  const str = String(val).trim();
  if (str.match(/^\d{1,2}:\d{2}/)) return str.substring(0, 5);
  return str;
}

function parseDays(r, sfx) {
  const d1 = r[`d1_1${sfx}`];
  const d2 = r[`d2_1${sfx}`];
  const d3 = r[`d3_1${sfx}`];
  const d4 = r[`d4_1${sfx}`];
  const d5 = r[`d5_1${sfx}`];
  const d6 = r[`d6_1${sfx}`];
  const d7 = r[`d7_1${sfx}`];

  const days = [];
  if (d1 === true || d1 === "true" || d1 === 1 || d1 === "1") days.push("M");
  if (d2 === true || d2 === "true" || d2 === 1 || d2 === "1") days.push("T");
  if (d3 === true || d3 === "true" || d3 === 1 || d3 === "1") days.push("W");
  if (d4 === true || d4 === "true" || d4 === 1 || d4 === "1") days.push("TH");
  if (d5 === true || d5 === "true" || d5 === 1 || d5 === "1") days.push("F");
  if (d6 === true || d6 === "true" || d6 === 1 || d6 === "1") days.push("S");
  if (d7 === true || d7 === "true" || d7 === 1 || d7 === "1") days.push("SU");

  return days.length > 0 ? days : ["M", "T", "W", "TH", "F"];
}

function sanitizeGrade(rawLvl) {
  if (!rawLvl) return "Grade 7";
  const str = String(rawLvl).trim().toUpperCase();
  if (str.includes("KINDER")) return "Kinder";
  if (
    str.includes("SNED") ||
    str.includes("NON-GRADED") ||
    str.includes("MULTI-GRADE")
  )
    return "SNED (NON-GRADED)";
  const m = str.match(/^(?:GRADE\s*|G\s*)?(\d{1,2})$/i);
  if (m) {
    const num = parseInt(m[1], 10);
    if (num >= 1 && num <= 12) return `Grade ${num}`;
  }
  return str.startsWith("GRADE") ? str : `Grade ${str}`;
}

const MONTH_NAME_MAP = {
  JANUARY: "01",
  FEBRUARY: "02",
  MARCH: "03",
  APRIL: "04",
  MAY: "05",
  JUNE: "06",
  JULY: "07",
  AUGUST: "08",
  SEPTEMBER: "09",
  OCTOBER: "10",
  NOVEMBER: "11",
  DECEMBER: "12",
};

const parseDateFromParts = (yyyy, mmName, dd) => {
  if (!yyyy || !mmName || !dd) return null;
  const monthNum = MONTH_NAME_MAP[String(mmName).trim().toUpperCase()];
  if (!monthNum) return null;
  const dayPadded = String(dd).padStart(2, "0");
  return `${yyyy}-${monthNum}-${dayPadded}`;
};

const parsePostGraduateDiscipline = (
  rawDiscipline,
  rawEduc = {},
  rawProfile = {},
  highestAttainment = "",
) => {
  let mastersWithUnits = [];
  let mastersGraduated = [];
  let doctorateWithUnits = [];
  let doctorateGraduated = [];
  let masters = [];
  let doctorate = [];

  const extractList = (val) => {
    if (!val) return [];
    if (Array.isArray(val))
      return val.map((s) => String(s).trim()).filter(Boolean);
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed))
            return parsed.map((s) => String(s).trim()).filter(Boolean);
        } catch (e) {}
      }
      return trimmed
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  };

  const attainmentStr = String(highestAttainment || "").toUpperCase();
  const isDoc = attainmentStr.includes("DOCTOR");
  const isWithUnits = attainmentStr.includes("WITH UNITS");

  if (
    rawDiscipline &&
    typeof rawDiscipline === "object" &&
    !Array.isArray(rawDiscipline)
  ) {
    if (Array.isArray(rawDiscipline.mastersWithUnits))
      mastersWithUnits = rawDiscipline.mastersWithUnits;
    if (Array.isArray(rawDiscipline.mastersGraduated))
      mastersGraduated = rawDiscipline.mastersGraduated;
    if (Array.isArray(rawDiscipline.doctorateWithUnits))
      doctorateWithUnits = rawDiscipline.doctorateWithUnits;
    if (Array.isArray(rawDiscipline.doctorateGraduated))
      doctorateGraduated = rawDiscipline.doctorateGraduated;
    if (Array.isArray(rawDiscipline.masters)) masters = rawDiscipline.masters;
    if (Array.isArray(rawDiscipline.doctorate))
      doctorate = rawDiscipline.doctorate;
  } else if (
    typeof rawDiscipline === "string" &&
    rawDiscipline.trim().startsWith("{")
  ) {
    try {
      const parsed = JSON.parse(rawDiscipline);
      if (Array.isArray(parsed.mastersWithUnits))
        mastersWithUnits = parsed.mastersWithUnits;
      if (Array.isArray(parsed.mastersGraduated))
        mastersGraduated = parsed.mastersGraduated;
      if (Array.isArray(parsed.doctorateWithUnits))
        doctorateWithUnits = parsed.doctorateWithUnits;
      if (Array.isArray(parsed.doctorateGraduated))
        doctorateGraduated = parsed.doctorateGraduated;
      if (Array.isArray(parsed.masters)) masters = parsed.masters;
      if (Array.isArray(parsed.doctorate)) doctorate = parsed.doctorate;
    } catch (e) {}
  } else if (rawDiscipline) {
    const list = extractList(rawDiscipline);
    if (isDoc) {
      if (isWithUnits) doctorateWithUnits = list;
      else doctorateGraduated = list;
      doctorate = list;
    } else {
      if (isWithUnits) mastersWithUnits = list;
      else mastersGraduated = list;
      masters = list;
    }
  }

  const combinedSource = { ...rawProfile, ...rawEduc };
  if (
    mastersWithUnits.length === 0 &&
    combinedSource.mastersWithUnitsDisciplines
  ) {
    mastersWithUnits = extractList(combinedSource.mastersWithUnitsDisciplines);
  }
  if (
    mastersGraduated.length === 0 &&
    combinedSource.mastersGraduatedDisciplines
  ) {
    mastersGraduated = extractList(combinedSource.mastersGraduatedDisciplines);
  }
  if (
    doctorateWithUnits.length === 0 &&
    combinedSource.doctorateWithUnitsDisciplines
  ) {
    doctorateWithUnits = extractList(
      combinedSource.doctorateWithUnitsDisciplines,
    );
  }
  if (
    doctorateGraduated.length === 0 &&
    combinedSource.doctorateGraduatedDisciplines
  ) {
    doctorateGraduated = extractList(
      combinedSource.doctorateGraduatedDisciplines,
    );
  }

  // Fallback from legacy masters / doctorate
  if (masters.length === 0) {
    if (combinedSource.mastersDisciplines) {
      masters = extractList(combinedSource.mastersDisciplines);
    } else if (combinedSource.mastersDiscipline) {
      masters = extractList(combinedSource.mastersDiscipline);
    }
  }
  if (doctorate.length === 0) {
    if (combinedSource.doctorateDisciplines) {
      doctorate = extractList(combinedSource.doctorateDisciplines);
    } else if (combinedSource.doctorateDiscipline) {
      doctorate = extractList(combinedSource.doctorateDiscipline);
    }
  }

  if (
    mastersWithUnits.length === 0 &&
    mastersGraduated.length === 0 &&
    masters.length > 0
  ) {
    if (isWithUnits && !isDoc) mastersWithUnits = [...masters];
    else mastersGraduated = [...masters];
  }
  if (
    doctorateWithUnits.length === 0 &&
    doctorateGraduated.length === 0 &&
    doctorate.length > 0
  ) {
    if (isWithUnits && isDoc) doctorateWithUnits = [...doctorate];
    else doctorateGraduated = [...doctorate];
  }

  const allMasters = [
    ...new Set(
      [...mastersWithUnits, ...mastersGraduated, ...masters]
        .map((s) => String(s).trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  const allDoctorate = [
    ...new Set(
      [...doctorateWithUnits, ...doctorateGraduated, ...doctorate]
        .map((s) => String(s).trim().toUpperCase())
        .filter(Boolean),
    ),
  ];

  mastersWithUnits = [
    ...new Set(
      mastersWithUnits
        .map((s) => String(s).trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  mastersGraduated = [
    ...new Set(
      mastersGraduated
        .map((s) => String(s).trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  doctorateWithUnits = [
    ...new Set(
      doctorateWithUnits
        .map((s) => String(s).trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  doctorateGraduated = [
    ...new Set(
      doctorateGraduated
        .map((s) => String(s).trim().toUpperCase())
        .filter(Boolean),
    ),
  ];

  return {
    mastersWithUnits,
    mastersGraduated,
    doctorateWithUnits,
    doctorateGraduated,
    masters: allMasters,
    doctorate: allDoctorate,
    mastersDiscipline: allMasters.join(", "),
    doctorateDiscipline: allDoctorate.join(", "),
    jsonString: JSON.stringify({
      mastersWithUnits,
      mastersGraduated,
      doctorateWithUnits,
      doctorateGraduated,
      masters: allMasters,
      doctorate: allDoctorate,
    }),
    rawObject: {
      mastersWithUnits,
      mastersGraduated,
      doctorateWithUnits,
      doctorateGraduated,
      masters: allMasters,
      doctorate: allDoctorate,
    },
  };
};

const sanitizeGradeLevel = (rawLvl, secName = "") => {
  if (!rawLvl && !secName) return null;
  const str = String(rawLvl || "").trim();
  const upper = str.toUpperCase();

  // 1. Filter out delivery modes / section types that are NOT grade levels
  if (
    upper.includes("MULTI-GRADE") ||
    upper.includes("MULTIGRADE") ||
    upper.includes("MULTI GRADE") ||
    upper.includes("MONO-GRADE") ||
    upper.includes("MONOGRADE") ||
    upper.includes("MONO GRADE") ||
    upper.includes("PHIL-IRI") ||
    upper.includes("PHIL IRI") ||
    upper.includes("CRLA") ||
    upper.includes("RMA") ||
    upper === "ARAL" ||
    upper.startsWith("ARAL ") ||
    upper.includes("INDEPENDENT") ||
    upper.includes("INSTRUCTIONAL") ||
    upper.includes("FRUSTRATION")
  ) {
    if (secName) {
      const secMatch = String(secName).match(/(?:Grade\s*|G)(\d{1,2})/i);
      if (secMatch) return `Grade ${secMatch[1]}`;
      if (String(secName).toUpperCase().includes("KINDER")) return "Kinder";
      if (
        String(secName).toUpperCase().includes("SNED") ||
        String(secName).toUpperCase().includes("NON-GRADED") ||
        String(secName).toUpperCase().includes("SPED")
      )
        return "SNED (NON-GRADED)";
      if (String(secName).toUpperCase().includes("ALS")) return "ALS";
    }
    return null;
  }

  // 2. Handle Kinder / Kindergarten / Grade KINDER
  if (upper.includes("KINDER") || upper === "K") {
    return "Kinder";
  }

  // 3. Handle Special Programs (SNED & NON-GRADED unified)
  if (
    upper === "SNED" ||
    upper === "SPED" ||
    upper === "NON-GRADED" ||
    upper === "NON GRADED" ||
    upper.includes("SNED") ||
    upper.includes("NON-GRADED") ||
    upper.includes("NON GRADED")
  ) {
    return "SNED (NON-GRADED)";
  }
  if (upper === "ALS" || upper.startsWith("ALS-") || upper.startsWith("ALS "))
    return "ALS";

  // 4. Handle Numeric e.g. "7", "G7", "Grade 7"
  const numMatch = str.match(/^(?:Grade\s*|G\s*)?(\d{1,2})$/i);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    if (num >= 1 && num <= 12) {
      return `Grade ${num}`;
    }
  }

  if (upper.startsWith("GRADE ")) {
    const rest = str.substring(6).trim();
    if (rest.toUpperCase().includes("KINDER")) return "Kinder";
    if (
      rest.toUpperCase().includes("MULTI") ||
      rest.toUpperCase().includes("MONO")
    )
      return null;
    if (
      rest.toUpperCase().includes("SNED") ||
      rest.toUpperCase().includes("NON-GRADED") ||
      rest.toUpperCase().includes("SPED")
    )
      return "SNED (NON-GRADED)";
    const subMatch = rest.match(/^(\d{1,2})$/);
    if (subMatch) {
      const num = parseInt(subMatch[1], 10);
      if (num >= 1 && num <= 12) return `Grade ${num}`;
    }
    return null;
  }

  return null;
};

const sanitizeGradeArray = (arr) => {
  if (!Array.isArray(arr)) return [];
  const res = [];
  for (const item of arr) {
    const sanitized = sanitizeGradeLevel(item);
    if (sanitized && !res.includes(sanitized)) {
      res.push(sanitized);
    }
  }
  return res;
};

const checkIsSchoolHead = (p) => {
  if (
    p.isSchoolHead === true ||
    p.is_school_head === true ||
    String(p.isSchoolHead).toLowerCase() === "true" ||
    String(p.is_school_head).toLowerCase() === "true"
  ) {
    return true;
  }
  const pos = String(p.position || "").toUpperCase();
  const des = String(p.designation || "").toUpperCase();
  return (
    pos.includes("PRINCIPAL") ||
    pos.includes("TEACHER-IN-CHARGE") ||
    pos.includes("TIC") ||
    pos.includes("OFFICER-IN-CHARGE") ||
    pos.includes("OIC") ||
    des.includes("SCHOOL HEAD")
  );
};

const sanitizeStepIncrement = (rawVal) => {
  if (!rawVal) return 1;
  const num = Math.round(Number(rawVal));
  if (isNaN(num) || num < 1 || num > 8) {
    return 1;
  }
  return num;
};

const sanitizeAge = (rawVal, bDate) => {
  if (rawVal) {
    const num = Math.round(Number(rawVal));
    if (!isNaN(num) && num > 18 && num < 100) return num;
  }
  if (!bDate) return null;
  const birth = new Date(bDate);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age > 0 ? age : null;
};

const CANONICAL_POSITIONS_BY_CATEGORY = {
  teaching: [
    "TEACHER I",
    "TEACHER II",
    "TEACHER III",
    "TEACHER IV",
    "TEACHER IV - SNED",
    "TEACHER V",
    "TEACHER V - SNED",
    "TEACHER VI",
    "TEACHER VI - SNED",
    "TEACHER VII",
    "TEACHER VII - SNED",
    "EXTERNAL TUTOR",
    "SPECIAL SCIENCE TEACHER I",
    "SPECIAL SCIENCE TEACHER II",
    "SPECIAL SCIENCE TEACHER III",
    "SPECIAL SCIENCE TEACHER IV",
    "SPECIAL SCIENCE TEACHER V",
    "MASTER TEACHER I",
    "MASTER TEACHER II",
    "MASTER TEACHER III",
    "MASTER TEACHER IV",
    "MASTER TEACHER V",
    "LEARNER SUPPORT AIDE",
    "ALIVE TEACHER",
  ],
  "teaching-related": [
    "TIC - HEAD TEACHER I",
    "TIC - HEAD TEACHER II",
    "TIC - HEAD TEACHER III",
    "TIC - HEAD TEACHER IV",
    "TIC - HEAD TEACHER V",
    "TIC - HEAD TEACHER VI",
    "GUIDANCE DESIGNATE - HEAD TEACHER I",
    "GUIDANCE DESIGNATE - HEAD TEACHER II",
    "GUIDANCE DESIGNATE - HEAD TEACHER III",
    "GUIDANCE DESIGNATE - HEAD TEACHER IV",
    "GUIDANCE DESIGNATE - HEAD TEACHER V",
    "GUIDANCE DESIGNATE - HEAD TEACHER VI",
    "CLINIC - HEAD TEACHER I",
    "CLINIC - HEAD TEACHER II",
    "CLINIC - HEAD TEACHER III",
    "CLINIC - HEAD TEACHER IV",
    "CLINIC - HEAD TEACHER V",
    "CLINIC - HEAD TEACHER VI",
    "ASSISTANT SCHOOL PRINCIPAL I",
    "ASSISTANT SCHOOL PRINCIPAL II",
    "ASSISTANT SCHOOL PRINCIPAL III",
    "ASSISTANT SPECIAL SCHOOL PRINCIPAL",
    "GUIDANCE COORDINATOR I",
    "GUIDANCE COORDINATOR II",
    "GUIDANCE COORDINATOR III",
    "GUIDANCE COUNSELOR I",
    "GUIDANCE COUNSELOR II",
    "GUIDANCE COUNSELOR III",
    "HEAD TEACHER I",
    "HEAD TEACHER II",
    "HEAD TEACHER III",
    "HEAD TEACHER IV",
    "HEAD TEACHER V",
    "HEAD TEACHER VI",
    "SCHOOL PRINCIPAL I",
    "SCHOOL PRINCIPAL II",
    "SCHOOL PRINCIPAL III",
    "SCHOOL PRINCIPAL IV",
    "SPECIAL SCHOOL PRINCIPAL I",
    "SPECIAL SCHOOL PRINCIPAL II",
    "GUIDANCE SERVICES SPECIALIST",
    "LIBRARIAN",
    "SCHOOL LIBRARIAN",
    "COLLEGE LIBRARIAN",
    "VOCATIONAL SCHOOL ADMINISTRATOR",
    "VOCATIONAL SCHOOL SUPERINTENDENT",
  ],
  "non-teaching": [
    "ACCOUNTANT",
    "ACCOUNTING CLERK",
    "ADMINISTRATIVE AIDE",
    "ADMINISTRATIVE AIDE I (ADA I)",
    "ADMINISTRATIVE AIDE II (ADA II)",
    "ADMINISTRATIVE AIDE III (ADA III)",
    "ADMINISTRATIVE AIDE IV (ADA IV)",
    "ADMINISTRATIVE AIDE V (ADA V)",
    "ADMINISTRATIVE AIDE VI (ADA VI)",
    "ADMINISTRATIVE ASSISTANT",
    "ADMINISTRATIVE ASSISTANT I (ADAS I)",
    "ADMINISTRATIVE ASSISTANT II (ADAS II)",
    "ADMINISTRATIVE ASSISTANT III (ADAS III)",
    "ADMINISTRATIVE ASSISTANT IV (ADAS IV)",
    "ADMINISTRATIVE ASSISTANT V (ADAS V)",
    "ADMINISTRATIVE ASSISTANT VI (ADAS VI)",
    "ADMINISTRATIVE OFFICER",
    "ADMINISTRATIVE OFFICER I (AO I)",
    "ADMINISTRATIVE OFFICER II (AO II)",
    "ADMINISTRATIVE OFFICER III (AO III)",
    "ADMINISTRATIVE OFFICER IV (AO IV)",
    "ADMINISTRATIVE OFFICER V (AO V)",
    "AGRICULTURIST",
    "AQUACULTURAL TECHNICIAN",
    "AQUACULTURIST",
    "BOOKKEEPER",
    "CASHIER",
    "CHIEF ADMINISTRATIVE OFFICER",
    "CLERK",
    "COMMUNICATIONS EQUIPMENT OPERATOR",
    "COMPUTER MAINTENANCE TECHNOLOGIST",
    "CONSTRUCTION AND MAINTENANCE MAN",
    "COOK",
    "COXSWAIN",
    "DENTAL AIDE",
    "DENTIST",
    "DISBURSING OFFICER",
    "DRIVER",
    "ENGINEER",
    "FARM WORKER",
    "FISCAL CLERK",
    "FISHERMAN",
    "HANDICRAFT WORKER",
    "HEAVY EQUIPMENT OPERATOR",
    "HOUSEPARENT",
    "INFORMATION SYSTEMS ANALYST",
    "INFORMATION TECHNOLOGY OFFICER",
    "LABORATORY TECHNICIAN",
    "LIGHT EQUIPMENT OPERATOR",
    "LINEMAN",
    "MARINE ENGINEMAN",
    "MASTER FISHERMAN",
    "MECHANIC",
    "MECHANICAL PLANT OPERATOR",
    "MEDICAL OFFICER",
    "NURSE",
    "NURSE MAID",
    "NURSING ATTENDANT",
    "NUTRITIONIST-DIETITIAN",
    "PLANNING OFFICER",
    "PROJECT DEVELOPMENT OFFICER",
    "PSYCHOLOGIST",
    "REGISTRAR",
    "REPRODUCTION MACHINE OPERATOR",
    "SCHOOLS DIVISION SUPERINTENDENT",
    "SECURITY GUARD",
    "SECURITY OFFICER",
    "SENIOR BOOKKEEPER",
    "SOCIAL WELFARE OFFICER",
    "STATISTICIAN AIDE",
    "SUPPLY OFFICER",
    "TECHNICAL EDUCATION AND SKILLS DEVELOPMENT SPECIALIST",
    "TELEGRAM CARRIER",
    "UTILITY FOREMAN",
    "UTILITY WORKER",
    "VOCATIONAL PLACEMENT COORDINATOR",
    "WATCHMAN",
    "INTERN",
    "OTHERS",
  ],
};

function isCanonicalPosition(positionStr) {
  if (!positionStr || typeof positionStr !== "string") return false;
  const pos = positionStr.trim();
  if (pos.startsWith("OTHERS")) return true;
  return (
    CANONICAL_POSITIONS_BY_CATEGORY.teaching.includes(pos) ||
    CANONICAL_POSITIONS_BY_CATEGORY["teaching-related"].includes(pos) ||
    CANONICAL_POSITIONS_BY_CATEGORY["non-teaching"].includes(pos)
  );
}

function determinePositionCategory(positionStr) {
  if (!positionStr || typeof positionStr !== "string")
    return { type: "", category: "" };
  const pos = positionStr.trim();
  if (!isCanonicalPosition(pos)) return { type: "", category: "" };
  if (pos.startsWith("OTHERS"))
    return { type: "non-teaching", category: "NON-TEACHING" };
  if (CANONICAL_POSITIONS_BY_CATEGORY.teaching.includes(pos))
    return { type: "teaching", category: "TEACHING" };
  if (CANONICAL_POSITIONS_BY_CATEGORY["teaching-related"].includes(pos))
    return { type: "teaching-related", category: "RELATED TEACHING" };
  if (CANONICAL_POSITIONS_BY_CATEGORY["non-teaching"].includes(pos))
    return { type: "non-teaching", category: "NON-TEACHING" };
  return { type: "", category: "" };
}

async function fetchMasterPersonnelFromInsightEd(schoolId) {
  const cleanSchoolId = String(schoolId).replace("SCH-", "");
  console.log(
    `[LocalDraft] Reading master personnel records for School ID ${cleanSchoolId}...`,
  );

  const isTest =
    db.isDivisionOrTestAccount && db.isDivisionOrTestAccount(cleanSchoolId);
  let sourceTable = isTest ? "esf7_database_dummy" : "esf7_database";
  let masterRes = { rows: [] };
  // A failure to reach the master database is an ERROR, not "no data": it is logged with the exact message and travels
  // with every record (masterSourceError) so the client can report it instead of silently trusting the fallback.
  let masterError = null;
  const noteMasterFailure = (label) => (err) => {
    masterError = masterError || {
      query: label,
      message: err.message,
      code: err.code || null,
    };
    console.error(
      `[LocalDraft][ERROR] ${label} failed for ${cleanSchoolId}: ${err.message}${err.code ? ` (code ${err.code})` : ""}. Master database is unreachable - the roster will NOT come from esf7_database.`,
    );
    return { rows: [] };
  };

  if (isTest) {
    masterRes = await insightEdPool
      .query(
        `SELECT * FROM esf7_database_dummy WHERE (school_id = $1 OR schoool_id = $1) AND (deleted IS NOT TRUE)`,
        [cleanSchoolId],
      )
      .catch(noteMasterFailure("esf7_database_dummy query"));
  } else {
    // 1. Primary: Fast indexed lookup on school_id in production esf7_database (< 1s)
    masterRes = await insightEdPool
      .query(`SELECT * FROM esf7_database WHERE school_id = $1 AND (deleted IS NOT TRUE)`, [
        cleanSchoolId,
      ])
      .catch(noteMasterFailure("esf7_database primary indexed query"));

    // Fallback: If 0 rows found with school_id, check schoool_id
    if (masterRes.rows.length === 0) {
      masterRes = await insightEdPool
        .query(`SELECT * FROM esf7_database WHERE schoool_id = $1 AND (deleted IS NOT TRUE)`, [
          cleanSchoolId,
        ])
        .catch(noteMasterFailure("esf7_database schoool_id query"));
    }

    // 2. Secondary: If not found in production esf7_database, check test dummy table
    if (masterRes.rows.length === 0) {
      console.log(
        `[LocalDraft] No master records in esf7_database for School ID ${cleanSchoolId}, checking esf7_database_dummy...`,
      );
      masterRes = await insightEdPool
        .query(
          `SELECT * FROM esf7_database_dummy WHERE (school_id = $1 OR schoool_id = $1)`,
          [cleanSchoolId],
        )
        .catch(noteMasterFailure("esf7_database_dummy fallback query"));
      if (masterRes.rows.length > 0) {
        sourceTable = "esf7_database_dummy";
      }
    }
  }

  if (masterRes.rows.length === 0) {
    console.log(
      `[LocalDraft] No master records found in esf7_database or esf7_database_dummy for School ID ${cleanSchoolId}.`,
    );
    return [];
  }

  // One person = one row: the same person listed twice (same PRN / employee no., else same name) is kept once, first copy wins.
  {
    const seenKeys = new Set();
    const before = masterRes.rows.length;
    masterRes = {
      rows: masterRes.rows.filter((r) => {
        const prnKey = String(r.prn || r.employee_no || r.employeeNo || "")
          .trim()
          .toUpperCase();
        const nameKey =
          `${r.firstName || r.first_name || r.first || ""} ${r.lastName || r.last_name || r.last || r.last_first || ""}`
            .trim()
            .toUpperCase();
        const key =
          prnKey && !prnKey.startsWith("PRN-")
            ? "p:" + prnKey
            : nameKey
              ? "n:" + nameKey
              : "";
        if (!key) return true;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      }),
    };
    if (masterRes.rows.length !== before)
      console.warn(
        `[LocalDraft] Dropped ${before - masterRes.rows.length} duplicate master row(s) from ${sourceTable} for ${cleanSchoolId}.`,
      );
  }
  const sourceConfirmed = true;

  console.log(
    `[LocalDraft] Formatting ${masterRes.rows.length} personnel records from ${sourceTable} in-memory (0 database inserts)...`,
  );

  const list = [];
  for (let i = 0; i < masterRes.rows.length; i++) {
    const row = masterRes.rows[i];
    const seq = String(i + 1).padStart(3, "0");
    const profileId = String(
      row.id ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : require("crypto").randomUUID()),
    );
    const empId = row.employmentId || profileId;
    const educId = row.educationId || `EDU-${cleanSchoolId}-${seq}`;

    let fName = row.firstName || row.first_name || row.first || "";
    let lName = row.lastName || row.last_name || row.last || "";
    let mName = row.middleName || row.middle_name || row.middle || "";

    if ((!fName || !lName) && row.last_first) {
      const parts = String(row.last_first).trim().split(/\s+/);
      lName = parts[0] || "TEACHER";
      fName = parts.slice(1).join(" ") || "STAFF";
    }

    if (!fName) fName = `TEACHER`;
    if (!lName) lName = `STAFF ${seq}`;

    const prn = formatCanonicalPrn(row.prn, seq);
    const isSchoolHead =
      row.isSchoolHead !== undefined
        ? !!row.isSchoolHead
        : row.is_school_head !== undefined
          ? !!row.is_school_head
          : checkIsSchoolHead(row);
    const bDate =
      row.birthdate ||
      parseDateFromParts(row.birthday_yyyy, row.birthday_mm, row.birthday_dd) ||
      null;
    const computedAge = sanitizeAge(row.age, bDate);
    const firstApptDate =
      row.firstServiceDate ||
      row.first_service_date ||
      parseDateFromParts(row.appt_yyyy, row.appt_mm, row.appt_dd) ||
      null;
    const stationDate =
      row.newStationDate ||
      row.new_station_date ||
      parseDateFromParts(row.station_yyyy, row.station_mm, row.station_dd) ||
      null;
    const stepIncrement = sanitizeStepIncrement(
      row.stepIncrement || row.step_increment,
    );
    const degree =
      row.collegeDegree ||
      row.college_degree ||
      row.degree_finished__baccalaureate ||
      "BACHELOR OF SECONDARY EDUCATION";
    const major = row.major || row.major__specialization || "GENERAL EDUCATION";
    const minor = row.minor || "N/A";
    const highestAttainment =
      row.highestEducationalAttainment ||
      row.highest_educational_attainment ||
      "COLLEGE GRADUATE / BACCALAUREATE";
    const postGrad =
      row.postGraduateDegree ||
      row.post_graduate_degree ||
      row.post_graduate__degree ||
      "N/A";
    const postGradDisc =
      row.postGraduateDiscipline ||
      row.post_graduate_discipline ||
      '{"mastersWithUnits":[],"mastersGraduated":[],"doctorateWithUnits":[],"doctorateGraduated":[],"masters":[],"doctorate":[]}';
    const elig = Array.isArray(row.eligibility)
      ? row.eligibility
      : [row.eligibility || "LICENSURE EXAMINATION FOR TEACHERS"];
    const prcSpec = row.prcSpecialization || row.prc_specialization || major;
    const degreeRows =
      Array.isArray(row.degreeRows) && row.degreeRows.length > 0
        ? row.degreeRows
        : Array.isArray(row.collegeDegrees) && row.collegeDegrees.length > 0
          ? row.collegeDegrees
          : [{ collegeDegree: degree, major, minor }];

    const cleanEmpNo =
      row.employee_no &&
      !String(row.employee_no).toUpperCase().startsWith("PRN")
        ? String(row.employee_no).trim()
        : row.employeeNo &&
            !String(row.employeeNo).toUpperCase().startsWith("PRN")
          ? String(row.employeeNo).trim()
          : "";
    const depedEmail = row.deped_email || row.depedEmail || "";

    const rawPos = (
      row.position_title ||
      row.position ||
      row.plantilla_position ||
      ""
    ).trim();
    const isCanon = isCanonicalPosition(rawPos);
    const posName = isCanon ? rawPos : "";
    const catObj = determinePositionCategory(posName);

    list.push({
      ...row,
      masterSource: sourceTable,
      masterSourceConfirmed: sourceConfirmed,
      masterSourceError: masterError
        ? `${masterError.query}: ${masterError.message}${masterError.code ? ` (code ${masterError.code})` : ""}`
        : null,
      id: profileId,
      status:
        row.status ||
        (String(profileId).startsWith("local-p-")
          ? "client-created"
          : String(profileId).startsWith("P-HARVEST-")
            ? "harvester-created"
            : "canonical"),
      legacyId: row.legacy_id || row.legacyId || null,
      legacy_id: row.legacy_id || row.legacyId || null,
      prn,
      schoolId: cleanSchoolId,
      school_id: cleanSchoolId,
      schoolYear: "2026-2027",
      school_year: "2026-2027",
      type: catObj.type,
      salutation: (row.salutation || "MR.").toUpperCase(),
      firstName: String(fName).toUpperCase(),
      first_name: String(fName).toUpperCase(),
      middleName: mName ? String(mName).toUpperCase() : "",
      middle_name: mName ? String(mName).toUpperCase() : "",
      lastName: String(lName).toUpperCase(),
      last_name: String(lName).toUpperCase(),
      nameExtension: row.name_extension || row.nameExtension || "",
      name_extension: row.name_extension || row.nameExtension || "",
      tin: row.tin || "",
      noTin: !row.tin,
      no_tin: !row.tin,
      sexAtBirth: (
        row.sex ||
        row.sex_at_birth ||
        row.sexAtBirth ||
        row.gender ||
        "FEMALE"
      ).toUpperCase(),
      sex_at_birth: (
        row.sex ||
        row.sex_at_birth ||
        row.sexAtBirth ||
        row.gender ||
        "FEMALE"
      ).toUpperCase(),
      civilStatus: (
        row.civil_status ||
        row.civilStatus ||
        "SINGLE"
      ).toUpperCase(),
      civil_status: (
        row.civil_status ||
        row.civilStatus ||
        "SINGLE"
      ).toUpperCase(),
      soloParent:
        row.solo_parent === "YES" ||
        row.soloParent === "YES" ||
        row.soloParent === true
          ? "YES"
          : "NO",
      religion: (
        (row.religion === "OTHERS" ? "" : row.religion) || "CHRISTIANITY"
      ).toUpperCase(),
      ethnicGroup: (
        (row.ehtinic_group === "OTHERS" ||
        row.ethnic_group === "OTHERS" ||
        row.ethnicGroup === "OTHERS"
          ? ""
          : row.ehtinic_group || row.ethnic_group || row.ethnicGroup) || ""
      ).toUpperCase(),
      ethnic_group: (
        (row.ehtinic_group === "OTHERS" ||
        row.ethnic_group === "OTHERS" ||
        row.ethnicGroup === "OTHERS"
          ? ""
          : row.ehtinic_group || row.ethnic_group || row.ethnicGroup) || ""
      ).toUpperCase(),
      birthdate: bDate,
      age: computedAge,
      employeeNo: cleanEmpNo,
      employee_no: cleanEmpNo,
      depedEmail: depedEmail,
      noDepedEmail:
        !!row.no_deped_email || !!row.noDepedEmail || depedEmail === "N/A",
      no_deped_email:
        !!row.no_deped_email || !!row.noDepedEmail || depedEmail === "N/A",
      allowEmailDiscrepancy:
        !!row.allow_email_discrepancy || !!row.allowEmailDiscrepancy,
      allow_email_discrepancy:
        !!row.allow_email_discrepancy || !!row.allowEmailDiscrepancy,

      isSchoolHead: isSchoolHead,
      is_school_head: isSchoolHead,

      // Employment Fields
      employmentId: empId,
      positionCategory: catObj.category,
      position_category: catObj.category,
      position: posName,
      stepIncrement,
      step_increment: stepIncrement,
      fundSource: (
        row.fund_source ||
        row.fundSource ||
        "NATIONAL"
      ).toUpperCase(),
      fund_source: (
        row.fund_source ||
        row.fundSource ||
        "NATIONAL"
      ).toUpperCase(),
      natureOfAppointment: (
        row.nature_of_appointment ||
        row.natureOfAppointment ||
        "REGULAR PERMANENT"
      ).toUpperCase(),
      nature_of_appointment: (
        row.nature_of_appointment ||
        row.natureOfAppointment ||
        "REGULAR PERMANENT"
      ).toUpperCase(),
      hiringArrangement: (
        row.hiring_arrangement ||
        row.hiringArrangement ||
        "REGULAR"
      ).toUpperCase(),
      deploymentStatus: (
        row.status__item_ ||
        row.deploymentStatus ||
        row.deployment_status ||
        "OWN STATION"
      ).toUpperCase(),
      deployment_status: (
        row.status__item_ ||
        row.deploymentStatus ||
        row.deployment_status ||
        "OWN STATION"
      ).toUpperCase(),
      assignedSchools: row.assignedSchools || row.assigned_schools || [],
      assigned_schools: row.assignedSchools || row.assigned_schools || [],
      gradeLevelsTaught:
        row.gradeLevelsTaught ||
        row.grade_levels_taught ||
        row.assignedGradeLevels ||
        row.assigned_grade_levels ||
        [],
      grade_levels_taught:
        row.gradeLevelsTaught ||
        row.grade_levels_taught ||
        row.assignedGradeLevels ||
        row.assigned_grade_levels ||
        [],
      assignedGradeLevels:
        row.gradeLevelsTaught ||
        row.grade_levels_taught ||
        row.assignedGradeLevels ||
        row.assigned_grade_levels ||
        [],
      assigned_grade_levels:
        row.gradeLevelsTaught ||
        row.grade_levels_taught ||
        row.assignedGradeLevels ||
        row.assigned_grade_levels ||
        [],
      firstServiceDate: firstApptDate,
      lastPromotionDate: firstApptDate,
      newStationDate: stationDate || firstApptDate,
      lastLateralMovementDate: "N/A",
      last_lateral_movement_date: "N/A",
      stepIncrementConfirmed: true,
      step_increment_confirmed: true,

      // Education Fields
      educationId: educId,
      collegeDegree: String(degree).toUpperCase(),
      college_degree: String(degree).toUpperCase(),
      major: String(major).toUpperCase(),
      minor: String(minor).toUpperCase(),
      highestEducationalAttainment: String(highestAttainment).toUpperCase(),
      highest_educational_attainment: String(highestAttainment).toUpperCase(),
      degreeRows: degreeRows,
      collegeDegrees: degreeRows,
      postGraduateDegree: String(postGrad).toUpperCase(),
      post_graduate_degree: String(postGrad).toUpperCase(),
      postGraduateDiscipline:
        typeof postGradDisc === "string"
          ? postGradDisc
          : JSON.stringify(postGradDisc),
      post_graduate_discipline:
        typeof postGradDisc === "string"
          ? postGradDisc
          : JSON.stringify(postGradDisc),
      eligibility: elig,
      prcSpecialization: String(prcSpec).toUpperCase(),
      prc_specialization: String(prcSpec).toUpperCase(),

      workloadRows: (() => {
        if (Array.isArray(row.workloadRows) && row.workloadRows.length > 0)
          return row.workloadRows;
        const parsedWorkloads = [];
        for (let slot = 1; slot <= 20; slot++) {
          const sfx = slot === 1 ? "" : `_${slot}`;
          const subj = row[`subject_1${sfx}`];
          const from = row[`from_1${sfx}`];
          const to = row[`to_1${sfx}`];
          const sec = row[`section_1${sfx}`];
          const lvl = row[`lvl_1${sfx}`];
          if (!subj && !from && !sec) continue;

          const subjectStr = String(subj || "GENERAL SUBJECT").trim();
          const sectionStr = String(sec || "SECTION 1").trim();
          const gradeStr = sanitizeGrade(lvl);
          const startTime = convertExcelTimeToHHMM(from) || "07:30";
          const endTime = convertExcelTimeToHHMM(to) || "08:30";
          const days = parseDays(row, sfx);
          const rowId = `wkl_${cleanSchoolId}_${profileId}_${slot}`;
          const isShs =
            gradeStr.includes("11") ||
            gradeStr.includes("12") ||
            String(row[`department_1${sfx}`] || "")
              .toUpperCase()
              .includes("SHS") ||
            String(row[`categ_1${sfx}`] || "")
              .toUpperCase()
              .includes("SHS");

          parsedWorkloads.push({
            id: rowId,
            personnelId: profileId,
            personnel_id: profileId,
            schoolId: cleanSchoolId,
            school_id: cleanSchoolId,
            schoolYear: "2025-2026",
            school_year: "2025-2026",
            gradeLevel: gradeStr,
            grade_level: gradeStr,
            sectionId: `SEC-${cleanSchoolId}-${slot}`,
            section_id: `SEC-${cleanSchoolId}-${slot}`,
            sectionName: sectionStr,
            section_name: sectionStr,
            subject: subjectStr,
            subjectId: `SUB-${cleanSchoolId}-${slot}`,
            subject_id: `SUB-${cleanSchoolId}-${slot}`,
            remediationSubject: "",
            remediation_subject: "",
            startTime: startTime,
            start_time: startTime,
            endTime: endTime,
            end_time: endTime,
            days: days,
            term: "1st",
            trackStrand: isShs ? "TVL/ACADEMIC" : "",
            track_strand: isShs ? "TVL/ACADEMIC" : "",
            shsSubjectCategory: isShs ? "Specialized" : "",
            shs_subject_category: isShs ? "Specialized" : "",
            semester: "1st Semester",
            rawPayload: {
              id: rowId,
              personnelId: profileId,
              schoolId: cleanSchoolId,
              gradeLevel: gradeStr,
              sectionName: sectionStr,
              subject: subjectStr,
              startTime,
              endTime,
              days,
              term: "1st",
            },
          });
        }
        return parsedWorkloads;
      })(),
      neapTrainingRows: Array.isArray(row.neapTrainingRows)
        ? row.neapTrainingRows
        : [],
      certificationRows: Array.isArray(row.certificationRows)
        ? row.certificationRows
        : [],
      otherTrainingRows: Array.isArray(row.otherTrainingRows)
        ? row.otherTrainingRows
        : [],
      learningAreaMap:
        row.learningAreaMap || row.matrixData || row.matrix_data || {},
      designations: Array.isArray(row.designations) ? row.designations : [],
    });
  }

  return list;
}

// Helper to generate a random 6-character profiling code
const generateProfilingCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const calculateAge = (dobString) => {
  if (!dobString) return null;
  const birth = new Date(dobString);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

function formatTrainingRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    type: String(row.training_type).toLowerCase(),
    title: row.title,
    conductor: row.conductor || "N/A",
    startDate: row.start_date
      ? row.start_date instanceof Date
        ? row.start_date.toISOString().split("T")[0]
        : String(row.start_date).split("T")[0]
      : null,
    endDate: row.end_date
      ? row.end_date instanceof Date
        ? row.end_date.toISOString().split("T")[0]
        : String(row.end_date).split("T")[0]
      : null,
    days: row.days || 0,
    totalHours: Number(row.total_hours || 0),
  };
}

function formatDesignationRecord(row) {
  if (!row) return null;
  const raw = row.raw_payload || {};
  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    designationName: row.designation_name,
    designation_name: row.designation_name,
    keyStage: row.key_stage || raw.keyStage || null,
    key_stage: row.key_stage || raw.keyStage || null,
    gradeLevel: row.grade_level || "",
    grade_level: row.grade_level || "",
    subjectArea: row.subject_area || "",
    subject_area: row.subject_area || "",
    track: row.track || "",
    isSdsApproved: !!row.is_sds_approved,
    is_sds_approved: !!row.is_sds_approved,
    sdsConfirmed: !!row.sds_confirmed,
    sds_confirmed: !!row.sds_confirmed,
    serializedKey: row.serialized_key,
    serialized_key: row.serialized_key,
    rawPayload: raw,
  };
}

// esf7_workload_rows keeps a slim `extras` JSONB instead of a copy of the request body (list queries omit it on purpose).
function formatWorkloadRecord(row) {
  if (!row) return null;
  const raw = row.extras || {};
  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    gradeLevel: row.grade_level || "",
    grade_level: row.grade_level || "",
    sectionId: row.section_id || null,
    section_id: row.section_id || null,
    sectionName: row.section_name || "",
    section_name: row.section_name || "",
    subject: row.subject,
    subjectId: row.subject_id || null,
    subject_id: row.subject_id || null,
    remediationSubject: row.remediation_subject || "",
    remediation_subject: row.remediation_subject || "",
    startTime: row.start_time ? String(row.start_time).substring(0, 5) : null,
    start_time: row.start_time ? String(row.start_time).substring(0, 5) : null,
    endTime: row.end_time ? String(row.end_time).substring(0, 5) : null,
    end_time: row.end_time ? String(row.end_time).substring(0, 5) : null,
    days: row.days || ["M", "T", "W", "TH", "F"],
    term: row.term || raw.term || "1st",
    // aliases of the typed `subject` column (detail queries only; list queries select typed columns without extras)
    ...(row.extras
      ? {
          subjectName: raw.subjectName ?? row.subject ?? "",
          subject_name: raw.subject_name ?? row.subject ?? "",
        }
      : {}),
    rawPayload: row.extras ? reconstructPayload(row) : raw,
  };
}

function formatAdminTaskRecord(row) {
  if (!row) return null;
  const raw = row.extras || {};
  return {
    ...raw,
    id: row.id,
    personnelId: row.personnel_id,
    personnel_id: row.personnel_id,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    task: row.task_name,
    task_name: row.task_name,
    taskName: row.task_name,
    category: row.task_category || raw.category || "General Administration",
    taskCategory: row.task_category || raw.category || "General Administration",
    startTime: row.start_time
      ? String(row.start_time).substring(0, 5)
      : raw.startTime || "13:00",
    start_time: row.start_time
      ? String(row.start_time).substring(0, 5)
      : raw.startTime || "13:00",
    endTime: row.end_time
      ? String(row.end_time).substring(0, 5)
      : raw.endTime || "14:00",
    end_time: row.end_time
      ? String(row.end_time).substring(0, 5)
      : raw.endTime || "14:00",
    days: row.days || raw.days || ["M", "T", "W", "TH", "F"],
    term: row.term || raw.term || "1st",
    startDate: row.start_date || raw.startDate || null,
    start_date: row.start_date || raw.startDate || null,
    endDate: row.end_date || raw.endDate || null,
    end_date: row.end_date || raw.endDate || null,
    dates: row.dates || raw.dates || [],
    durationMinutes: row.duration_minutes || raw.durationMinutes || 60,
    duration_minutes: row.duration_minutes || raw.durationMinutes || 60,
    termTotalHours: row.term_total_hours
      ? parseFloat(row.term_total_hours)
      : raw.termTotalHours || 0,
    isDesignationSynced: !!row.is_designation_synced,
    is_designation_synced: !!row.is_designation_synced,
    status: row.status || "ACTIVE",
    rawPayload: adminTaskPayload.reconstruct(row),
  };
}

// Formatter to standardize database rows into frontend-compatible objects
// Years of service the user excluded from the Learning Area total (e.g. non-teaching years before becoming a teacher).
// Additive, idempotent; existing records default to 0 so their counts do not change.
let disabledYearsColumnReady;
function ensureDisabledYearsColumn() {
  if (!disabledYearsColumnReady) {
    disabledYearsColumnReady = db
      .query(
        `ALTER TABLE esf7_personnel_profile ADD COLUMN IF NOT EXISTS disabled_service_years INTEGER NOT NULL DEFAULT 0`,
      )
      .catch((e) => {
        disabledYearsColumnReady = null;
        throw e;
      });
  }
  return disabledYearsColumnReady;
}

function formatPersonnelRecord(
  row,
  trainingsList = [],
  designationsList = [],
  workloadList = [],
  adminTaskList = [],
) {
  if (!row) return null;
  const rawProfile = row.raw_payload || {};
  const rawEmp = row.employment_raw_payload || {};
  const rawEduc = row.educ_raw_payload || {};
  const rawLA = row.la_raw_payload || {};

  const neapRows = [];
  const certRows = [];
  const otherRows = [];

  for (const tr of trainingsList) {
    const formatted = formatTrainingRecord(tr);
    const type = String(tr.training_type).toUpperCase();
    if (type === "NEAP") neapRows.push(formatted);
    else if (type === "TESDA" || type === "CERTIFICATION")
      certRows.push(formatted);
    else otherRows.push(formatted);
  }
  const formattedDesignations = designationsList.map(formatDesignationRecord);
  const primaryDesignation =
    formattedDesignations.length > 0
      ? formattedDesignations[0].serializedKey
      : rawProfile.designation || "";

  const catObj = determinePositionCategory(row.position);
  const finalType = row.position_category
    ? row.position_category.toLowerCase().includes("non")
      ? "non-teaching"
      : row.position_category.toLowerCase().includes("related")
        ? "teaching-related"
        : "teaching"
    : catObj.type;

  const parsedPostDisc = parsePostGraduateDiscipline(
    row.post_graduate_discipline,
    rawEduc,
    rawProfile,
    row.highest_educational_attainment,
  );

  return {
    ...rawProfile,
    ...rawEmp,
    ...rawEduc,
    ...rawLA,
    id: row.id,
    status: row.status || "canonical",
    legacyId: row.legacy_id || null,
    legacy_id: row.legacy_id || null,
    prn: row.prn,
    schoolId: row.school_id,
    school_id: row.school_id,
    schoolYear: row.school_year,
    school_year: row.school_year,
    type: finalType,
    salutation: row.salutation || "MR.",
    firstName: row.first_name,
    first_name: row.first_name,
    middleName: row.middle_name || "",
    middle_name: row.middle_name || "",
    lastName: row.last_name,
    last_name: row.last_name,
    nameExtension: row.name_extension || "",
    name_extension: row.name_extension || "",
    tin: row.tin || "",
    noTin: !!row.no_tin,
    no_tin: !!row.no_tin,
    sexAtBirth: row.sex_at_birth || "",
    sex_at_birth: row.sex_at_birth || "",
    civilStatus: row.civil_status || "",
    civil_status: row.civil_status || "",
    soloParent: row.solo_parent ? "YES" : "NO",
    religion: row.religion || "",
    ethnicGroup: row.ethnic_group || "",
    ethnic_group: row.ethnic_group || "",
    birthdate: row.birthdate
      ? row.birthdate instanceof Date
        ? row.birthdate.toISOString().split("T")[0]
        : String(row.birthdate).split("T")[0]
      : null,
    age: row.age || (row.birthdate ? calculateAge(row.birthdate) : null),
    philsysNo: row.philsys_no || "",
    philsys_no: row.philsys_no || "",
    noPhilsys: !!row.no_philsys,
    no_philsys: !!row.no_philsys,
    employeeNo:
      row.employee_no &&
      !String(row.employee_no).toUpperCase().startsWith("PRN")
        ? String(row.employee_no).trim()
        : "",
    employee_no:
      row.employee_no &&
      !String(row.employee_no).toUpperCase().startsWith("PRN")
        ? String(row.employee_no).trim()
        : "",
    depedEmail: row.deped_email || "",
    noDepedEmail: !!row.no_deped_email || row.deped_email === "N/A",
    no_deped_email: !!row.no_deped_email || row.deped_email === "N/A",
    allowEmailDiscrepancy: !!row.allow_email_discrepancy,
    allow_email_discrepancy: !!row.allow_email_discrepancy,
    isSchoolHead: !!row.is_school_head,
    is_school_head: !!row.is_school_head,
    disabledServiceYears: Number(row.disabled_service_years || 0),
    disabled_service_years: Number(row.disabled_service_years || 0),

    // Employment Tab Fields
    employmentId: row.emp_id || null,
    positionCategory: catObj.category,
    position_category: catObj.category,
    position: row.position || "",
    stepIncrement: row.step_increment || 1,
    step_increment: row.step_increment || 1,
    fundSource: row.fund_source || "",
    fund_source: row.fund_source || "",
    natureOfAppointment: row.nature_of_appointment || "",
    nature_of_appointment: row.nature_of_appointment || "",
    hiringArrangement: row.hiring_arrangement || "",
    hiring_arrangement: row.hiring_arrangement || "",
    deploymentStatus: row.deployment_status || "OWN STATION",
    deployment_status: row.deployment_status || "OWN STATION",
    assignedSchools: row.assigned_schools || [],
    assigned_schools: row.assigned_schools || [],
    gradeLevelsTaught: sanitizeGradeArray(row.grade_levels_taught || []),
    grade_levels_taught: sanitizeGradeArray(row.grade_levels_taught || []),
    assignedGradeLevels: sanitizeGradeArray(row.grade_levels_taught || []),
    assigned_grade_levels: sanitizeGradeArray(row.grade_levels_taught || []),
    teachesShs:
      !!(rawEmp.teachesShs || rawEmp.teaches_shs || rawProfile.teachesShs) ||
      (Array.isArray(row.grade_levels_taught) &&
        row.grade_levels_taught.some(
          (g) => String(g).includes("11") || String(g).includes("12"),
        )),
    teaches_shs:
      !!(rawEmp.teachesShs || rawEmp.teaches_shs || rawProfile.teachesShs) ||
      (Array.isArray(row.grade_levels_taught) &&
        row.grade_levels_taught.some(
          (g) => String(g).includes("11") || String(g).includes("12"),
        )),
    firstServiceDate: row.first_service_date
      ? row.first_service_date instanceof Date
        ? row.first_service_date.toISOString().split("T")[0]
        : String(row.first_service_date).split("T")[0]
      : null,
    lastPromotionDate: row.last_promotion_date
      ? row.last_promotion_date instanceof Date
        ? row.last_promotion_date.toISOString().split("T")[0]
        : String(row.last_promotion_date).split("T")[0]
      : row.first_service_date
        ? row.first_service_date instanceof Date
          ? row.first_service_date.toISOString().split("T")[0]
          : String(row.first_service_date).split("T")[0]
        : "N/A",
    newStationDate: row.new_station_date
      ? row.new_station_date instanceof Date
        ? row.new_station_date.toISOString().split("T")[0]
        : String(row.new_station_date).split("T")[0]
      : row.first_service_date
        ? row.first_service_date instanceof Date
          ? row.first_service_date.toISOString().split("T")[0]
          : String(row.first_service_date).split("T")[0]
        : "N/A",
    lastLateralMovementDate: row.last_lateral_movement_date
      ? row.last_lateral_movement_date instanceof Date
        ? row.last_lateral_movement_date.toISOString().split("T")[0]
        : String(row.last_lateral_movement_date).split("T")[0]
      : "N/A",
    stepIncrementConfirmed: true,
    step_increment_confirmed: true,

    // Education Tab Fields
    educationId: row.educ_id || null,
    highestEducationalAttainment:
      row.highest_educational_attainment ||
      (row.college_degree ? "COLLEGE GRADUATE / BACCALAUREATE" : ""),
    highest_educational_attainment:
      row.highest_educational_attainment ||
      (row.college_degree ? "COLLEGE GRADUATE / BACCALAUREATE" : ""),
    shsTrack: row.shs_track || "",
    shs_track: row.shs_track || "",
    vocationalCourse: row.vocational_course || "",
    vocational_course: row.vocational_course || "",
    vocationalLevel: row.vocational_level || "",
    vocational_level: row.vocational_level || "",
    collegeDegree: row.college_degree || "",
    college_degree: row.college_degree || "",
    major: row.major || "",
    minor: row.minor || "",
    postGraduateDegree: row.post_graduate_degree || "N/A",
    post_graduate_degree: row.post_graduate_degree || "N/A",
    postGraduateDiscipline: parsedPostDisc.jsonString,
    post_graduate_discipline: parsedPostDisc.jsonString,
    mastersDiscipline: parsedPostDisc.mastersDiscipline,
    mastersDisciplines: parsedPostDisc.masters,
    mastersWithUnitsDisciplines: parsedPostDisc.mastersWithUnits,
    mastersGraduatedDisciplines: parsedPostDisc.mastersGraduated,
    doctorateDiscipline: parsedPostDisc.doctorateDiscipline,
    doctorateDisciplines: parsedPostDisc.doctorate,
    doctorateWithUnitsDisciplines: parsedPostDisc.doctorateWithUnits,
    doctorateGraduatedDisciplines: parsedPostDisc.doctorateGraduated,
    collegeDegrees:
      row.college_degrees &&
      Array.isArray(row.college_degrees) &&
      row.college_degrees.length > 0
        ? row.college_degrees
        : rawEduc.collegeDegrees ||
          rawProfile.collegeDegrees ||
          (row.college_degree
            ? [
                {
                  collegeDegree: row.college_degree,
                  major: row.major || "",
                  minor: row.minor || "",
                },
              ]
            : []),
    degreeRows:
      rawEduc.degreeRows ||
      rawProfile.degreeRows ||
      (row.college_degree
        ? [
            {
              clientKey: "legacy-1",
              level: "BACCALAUREATE",
              collegeDegree: row.college_degree,
              major: row.major || "",
              minor: row.minor || "",
            },
          ]
        : []),
    eligibility: row.eligibility || [],
    prcSpecialization: row.prc_specialization || "",
    prc_specialization: row.prc_specialization || "",

    // L&D Training Rows
    neapTrainingRows: neapRows,
    certificationRows: certRows,
    otherTrainingRows: otherRows,

    // Learning Area Matrix Tab
    learningAreaId: row.la_id || null,
    learningAreaMap: row.matrix_data || {},
    matrix_data: row.matrix_data || {},

    // Designations Tab (Relational table esf7_personnel_designations with sds_confirmed)
    designation: primaryDesignation,
    designations: formattedDesignations,

    // Workload Rows (from esf7_workload_rows or raw_payload fallback)
    workloadRows:
      Array.isArray(workloadList) && workloadList.length > 0
        ? workloadList
        : Array.isArray(rawProfile.workloadRows)
          ? rawProfile.workloadRows
          : [],

    // Administrative Tasks (from esf7_admin_task or raw_payload fallback)
    administrativeRows:
      Array.isArray(adminTaskList) && adminTaskList.length > 0
        ? adminTaskList.map(formatAdminTaskRecord)
        : Array.isArray(rawProfile.administrativeRows)
          ? rawProfile.administrativeRows
          : [],

    rawPayload: { ...rawProfile, ...rawEmp, ...rawEduc, ...rawLA },
  };
}


module.exports = {
  formatCanonicalPrn,
  resolvePersonnelId,
  convertExcelTimeToHHMM,
  parseDays,
  sanitizeGrade,
  parseDateFromParts,
  parsePostGraduateDiscipline,
  sanitizeGradeLevel,
  sanitizeGradeArray,
  checkIsSchoolHead,
  sanitizeStepIncrement,
  sanitizeAge,
  isCanonicalPosition,
  determinePositionCategory,
  generateProfilingCode,
  calculateAge,
  formatTrainingRecord,
  formatDesignationRecord,
  formatWorkloadRecord,
  formatAdminTaskRecord,
  ensureDisabledYearsColumn,
  formatPersonnelRecord,
  fetchMasterPersonnelFromInsightEd,
  MONTH_NAME_MAP,
  CANONICAL_POSITIONS_BY_CATEGORY,
  CANONICAL_TEACHING_POSITIONS: CANONICAL_POSITIONS_BY_CATEGORY.teaching,
  CANONICAL_TEACHING_RELATED_POSITIONS:
    CANONICAL_POSITIONS_BY_CATEGORY["teaching-related"],
  CANONICAL_NON_TEACHING_POSITIONS:
    CANONICAL_POSITIONS_BY_CATEGORY["non-teaching"],
};
