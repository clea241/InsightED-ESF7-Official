const express = require("express");
const router = express.Router();
const db = require("../../db");
const { getSchoolIdFromRequest } = require("../../utils/auth");
const { coerceDateField, isDatePlaceholder } = require("../../utils/dateInput");
const {
  formatCanonicalPrn,
  resolvePersonnelId,
  parsePostGraduateDiscipline,
  sanitizeGradeArray,
  sanitizeStepIncrement,
  sanitizeAge,
  determinePositionCategory,
  calculateAge,
  formatWorkloadRecord,
  ensureDisabledYearsColumn,
  formatPersonnelRecord,
  fetchMasterPersonnelFromInsightEd,
} = require("./common");


router.get("/autofill-template", async (req, res) => {
  try {
    let schoolId =
      getSchoolIdFromRequest(req) ||
      req.query.schoolId ||
      req.query.school_id ||
      "502949";
    const list = await fetchMasterPersonnelFromInsightEd(schoolId);
    res.json(list);
  } catch (err) {
    console.error("Error in /autofill-template:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/personnel/share — Share a clustered personnel to target satellite schools
router.post("/share", async (req, res) => {
  try {
    const { prn, target_school_ids } = req.body;
    const sourceSchoolId = getSchoolIdFromRequest(req) || "199998";
    const cleanSourceId = String(sourceSchoolId).replace("SCH-", "").trim();

    if (
      !prn ||
      !Array.isArray(target_school_ids) ||
      target_school_ids.length === 0
    ) {
      return res
        .status(400)
        .json({ error: "prn and target_school_ids are required" });
    }

    // Ensure clustered_personnel table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS clustered_personnel (
        id SERIAL PRIMARY KEY,
        prn VARCHAR(255) NOT NULL,
        source_school_id VARCHAR(255) NOT NULL,
        target_school_id VARCHAR(255) NOT NULL,
        shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (prn, source_school_id, target_school_id)
      );
    `);

    for (const targetId of target_school_ids) {
      const cleanTargetId = String(targetId).replace("SCH-", "").trim();
      await db.query(
        `INSERT INTO clustered_personnel (prn, source_school_id, target_school_id, shared_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (prn, source_school_id, target_school_id) DO UPDATE SET shared_at = NOW()`,
        [prn, cleanSourceId, cleanTargetId],
      );
    }

    res.json({
      success: true,
      count: target_school_ids.length,
      message: "Personnel shared to clustered schools successfully.",
    });
  } catch (err) {
    console.error("Error sharing personnel to clustered schools:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET single personnel profile by ID
router.get("/:id", async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT 
        p.*,
        e.id AS emp_id,
        e.position_category,
        e.position,
        e.step_increment,
        e.fund_source,
        e.nature_of_appointment,
        e.hiring_arrangement,
        e.deployment_status,
        e.assigned_schools,
        e.grade_levels_taught,
        e.first_service_date,
        e.last_promotion_date,
        e.new_station_date,
        e.last_lateral_movement_date,
        '{}'::jsonb AS employment_raw_payload,
        ed.id AS educ_id,
        ed.highest_educational_attainment,
        ed.shs_track,
        ed.vocational_course,
        ed.vocational_level,
        ed.college_degree,
        ed.college_degrees,
        ed.major,
        ed.minor,
        ed.post_graduate_degree,
        ed.post_graduate_discipline,
        ed.eligibility,
        ed.prc_specialization,
        ed.raw_payload AS educ_raw_payload,
        la.id AS la_id,
        la.matrix_data,
        la.raw_payload AS la_raw_payload
      FROM esf7_personnel_profile p
      LEFT JOIN esf7_personnel_employment e ON p.id = e.personnel_id
      LEFT JOIN esf7_perssonel_educ ed ON p.id = ed.personnel_id
      LEFT JOIN esf7_personnel_learning_areas la ON p.id = la.personnel_id
      WHERE p.id = $1 OR p.prn = $1 
      LIMIT 1
    `,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Personnel profile not found" });
    }

    const row = result.rows[0];
    const trRes = await db.query(
      `SELECT * FROM esf7_personnel_ld_trainings WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [row.id],
    );
    const dsgRes = await db.query(
      `SELECT * FROM esf7_personnel_designations WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [row.id],
    );
    const [wklRes, shsWklRes] = await Promise.all([
      db
        .query(
          `SELECT * FROM esf7_workload_rows WHERE personnel_id = $1 ORDER BY created_at ASC`,
          [row.id],
        )
        .catch(() => ({ rows: [] })),
      db
        .query(
          `SELECT * FROM esf7_shs_workload_rows WHERE personnel_id = $1 ORDER BY created_at ASC`,
          [row.id],
        )
        .catch(() => ({ rows: [] })),
    ]);
    const seenWklIds = new Set();
    const wklList = [];
    for (const r of [...wklRes.rows, ...shsWklRes.rows]) {
      if (!seenWklIds.has(r.id)) {
        seenWklIds.add(r.id);
        wklList.push(formatWorkloadRecord(r));
      }
    }

    const admRes = await db.query(
      `SELECT * FROM esf7_admin_task WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [row.id],
    );

    res.json(
      formatPersonnelRecord(row, trRes.rows, dsgRes.rows, wklList, admRes.rows),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper function to sync trainings in transaction
async function syncTrainingsInTransaction(
  client,
  personnelId,
  neapTrainingRows,
  certificationRows,
  otherTrainingRows,
) {
  if (!neapTrainingRows && !certificationRows && !otherTrainingRows) return;

  await client.query(
    "DELETE FROM esf7_personnel_ld_trainings WHERE personnel_id = $1",
    [personnelId],
  );

  const allTrainings = [
    ...(neapTrainingRows || []).map((t) => ({ ...t, training_type: "NEAP" })),
    ...(certificationRows || []).map((t) => ({ ...t, training_type: "TESDA" })),
    ...(otherTrainingRows || []).map((t) => ({ ...t, training_type: "OTHER" })),
  ];

  let counter = 1;
  for (const t of allTrainings) {
    const trnId = `TRN-${personnelId.replace("PER-", "")}-${String(counter++).padStart(3, "0")}`;
    const type = (t.training_type || t.type || "OTHER").toUpperCase();
    const title = t.title || "Professional Training";
    const conductor = t.conductor || "NEAP / DepEd";
    const startDate = t.startDate || t.start_date || null;
    const endDate = t.endDate || t.end_date || null;
    const days = t.days ? Number(t.days) : 0;
    const totalHours = t.totalHours
      ? Number(t.totalHours)
      : t.total_hours
        ? Number(t.total_hours)
        : 0;

    await client.query(
      `INSERT INTO esf7_personnel_ld_trainings (
        id, personnel_id, training_type, title, conductor, start_date, end_date, days, total_hours, raw_payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        trnId,
        personnelId,
        type,
        title,
        conductor,
        startDate,
        endDate,
        days,
        totalHours,
        JSON.stringify(t),
      ],
    );
  }
}

// Helper function to sync learning areas matrix in transaction
async function syncLearningAreasInTransaction(
  client,
  personnelId,
  targetSchoolId,
  learningAreaMap,
  matrix_data,
  reqBody,
) {
  const targetMap = learningAreaMap || matrix_data;
  if (!targetMap) return;

  const countRes = await client.query(
    `SELECT COUNT(*) FROM esf7_personnel_learning_areas`,
  );
  const seq = String(Number(countRes.rows[0].count) + 1).padStart(3, "0");
  const laId = `LA-${targetSchoolId.replace("SCH-", "")}-${seq}`;

  await client.query(
    `INSERT INTO esf7_personnel_learning_areas (id, personnel_id, matrix_data, raw_payload)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     ON CONFLICT (personnel_id) DO UPDATE SET
       matrix_data = EXCLUDED.matrix_data,
       raw_payload = EXCLUDED.raw_payload,
       updated_at = NOW()`,
    [laId, personnelId, JSON.stringify(targetMap), JSON.stringify(reqBody)],
  );
}

// Helper function to sync designations in transaction
async function syncDesignationsInTransaction(
  client,
  personnelId,
  targetSchoolId,
  designation,
  designations,
  reqBody,
) {
  if (!designation && !designations) return;

  await client.query(
    "DELETE FROM esf7_personnel_designations WHERE personnel_id = $1",
    [personnelId],
  );

  const rawDesigList = [];
  if (designation && typeof designation === "string" && designation.trim()) {
    rawDesigList.push(designation.trim());
  }
  if (Array.isArray(designations)) {
    designations.forEach((d) => {
      if (d) rawDesigList.push(d);
    });
  }

  const processedKeys = new Set();
  let counter = 1;

  for (const item of rawDesigList) {
    if (!item) continue;

    let dsgObj = {};
    if (typeof item === "string") {
      const rawStr = item.trim();
      const isSds =
        rawStr.includes("::APPROVED_SDS") ||
        rawStr.toUpperCase().includes("APPROVED_SDS");
      const cleanKey = rawStr.replace(/::APPROVED_SDS/gi, "").trim();
      if (!cleanKey || processedKeys.has(cleanKey.toUpperCase())) continue;
      processedKeys.add(cleanKey.toUpperCase());

      let dsgName = cleanKey;
      let keyStage = null;
      let gradeLevel = null;
      let subjectArea = null;
      let track = null;

      const upper = cleanKey.toUpperCase();

      // 1. Department Head - Key Stage 1 (Early Primary: Kinder - Grade 3)
      if (
        upper.startsWith("DEPARTMENT HEAD") &&
        (upper.includes("KEY STAGE 1") ||
          upper.includes("KS1") ||
          upper.includes("KINDER") ||
          upper.includes("GRADE 1") ||
          upper.includes("GRADE 2") ||
          upper.includes("GRADE 3")) &&
        !upper.includes("KEY STAGE 2") &&
        !upper.includes("KEY STAGE 3") &&
        !upper.includes("KEY STAGE 4") &&
        !upper.includes("GRADE 4") &&
        !upper.includes("GRADE 5") &&
        !upper.includes("GRADE 6") &&
        !upper.includes("GRADE 7") &&
        !upper.includes("GRADE 8") &&
        !upper.includes("GRADE 9") &&
        !upper.includes("GRADE 10")
      ) {
        keyStage = "KS1";
        dsgName = "DEPARTMENT HEAD";
        subjectArea = "Early Primary Literacy & Numeracy";

        if (
          upper.includes("KINDER - GRADE 3") ||
          upper.includes("KINDER TO GRADE 3") ||
          upper === "DEPARTMENT HEAD - KEY STAGE 1" ||
          upper === "DEPARTMENT HEAD - KS1"
        ) {
          gradeLevel = "Kinder, Grade 1, Grade 2, Grade 3";
        } else {
          const detected = [];
          if (upper.includes("KINDER")) detected.push("Kinder");
          if (upper.includes("GRADE 1") || upper.includes("G1"))
            detected.push("Grade 1");
          if (upper.includes("GRADE 2") || upper.includes("G2"))
            detected.push("Grade 2");
          if (upper.includes("GRADE 3") || upper.includes("G3"))
            detected.push("Grade 3");
          gradeLevel =
            detected.length > 0
              ? detected.join(", ")
              : "Kinder, Grade 1, Grade 2, Grade 3";
        }
      }
      // 2. Department Head - Key Stage 2 (Intermediate: Grade 4 - Grade 6)
      else if (
        upper.startsWith("DEPARTMENT HEAD") &&
        (upper.includes("KEY STAGE 2") || upper.includes("KS2"))
      ) {
        keyStage = "KS2";
        dsgName = "DEPARTMENT HEAD";
        gradeLevel = "Grade 4, Grade 5, Grade 6";
        if (cleanKey.includes(" - ")) {
          const parts = cleanKey.split(" - ");
          subjectArea = parts[parts.length - 1].trim();
        }
      }
      // 3. Department Head - Key Stage 3 (Junior High School: Grade 7 - Grade 10)
      else if (
        upper.startsWith("DEPARTMENT HEAD") &&
        (upper.includes("KEY STAGE 3") || upper.includes("KS3"))
      ) {
        keyStage = "KS3";
        dsgName = "DEPARTMENT HEAD";
        gradeLevel = "Grade 7, Grade 8, Grade 9, Grade 10";
        if (cleanKey.includes(" - ")) {
          const parts = cleanKey.split(" - ");
          subjectArea = parts[parts.length - 1].trim();
        }
      }
      // 4. Department Head - Key Stage 4 (Senior High School: Grade 11 - Grade 12)
      else if (
        upper.startsWith("DEPARTMENT HEAD") &&
        (upper.includes("KEY STAGE 4") ||
          upper.includes("KS4") ||
          upper.includes("ACADEMIC TRACK") ||
          upper.includes("TECH-PRO TRACK") ||
          upper.includes("SHS"))
      ) {
        keyStage = "KS4";
        dsgName = "DEPARTMENT HEAD";
        gradeLevel = "Grade 11, Grade 12";
        track = upper.includes("TECH") ? "Tech-Pro Track" : "Academic Track";
      }
      // 5. Grade Level / Learning Area Chairpersons & Other Roles
      else if (cleanKey.includes(" - ")) {
        const parts = cleanKey.split(" - ");
        dsgName = parts[0].trim();
        const subPart = parts.slice(1).join(" - ").trim();

        const gradeMatch =
          subPart.match(/\((Grade\s*\d+|Kinder|Grade\s*1[0-2])\)/i) ||
          subPart.match(/^(Grade\s*\d+|Kinder|Grade\s*1[0-2])$/i);
        if (gradeMatch) {
          gradeLevel = gradeMatch[1] || gradeMatch[0];
          subjectArea = subPart.replace(gradeMatch[0], "").trim() || null;
        } else {
          subjectArea = subPart;
        }
      }

      dsgObj = {
        designationName: dsgName,
        keyStage: keyStage || null,
        gradeLevel: gradeLevel || "",
        subjectArea: subjectArea || "",
        track: track || "",
        isSdsApproved: isSds,
        sdsConfirmed: isSds,
        serializedKey: rawStr,
        rawPayload: {
          designation: cleanKey,
          keyStage: keyStage || null,
          gradeLevel: gradeLevel || null,
          subjectArea: subjectArea || null,
          track: track || null,
          isSdsApproved: isSds,
          serializedKey: rawStr,
        },
      };
    } else if (typeof item === "object") {
      const rawKey =
        item.serializedKey ||
        item.serialized_key ||
        item.designation ||
        item.designationName ||
        item.designation_name ||
        item.name ||
        "OFFICIAL DESIGNATION";
      const cleanKey = String(rawKey)
        .replace(/::APPROVED_SDS/gi, "")
        .trim();
      if (!cleanKey || processedKeys.has(cleanKey.toUpperCase())) continue;
      processedKeys.add(cleanKey.toUpperCase());

      const upper = cleanKey.toUpperCase();
      let keyStage = item.keyStage || item.key_stage || null;
      if (!keyStage) {
        if (
          upper.startsWith("DEPARTMENT HEAD") &&
          (upper.includes("KEY STAGE 1") ||
            upper.includes("KS1") ||
            upper.includes("KINDER") ||
            upper.includes("GRADE 1") ||
            upper.includes("GRADE 2") ||
            upper.includes("GRADE 3")) &&
          !upper.includes("KEY STAGE 2") &&
          !upper.includes("KEY STAGE 3") &&
          !upper.includes("KEY STAGE 4") &&
          !upper.includes("GRADE 4") &&
          !upper.includes("GRADE 5") &&
          !upper.includes("GRADE 6") &&
          !upper.includes("GRADE 7") &&
          !upper.includes("GRADE 8") &&
          !upper.includes("GRADE 9") &&
          !upper.includes("GRADE 10")
        ) {
          keyStage = "KS1";
        } else if (upper.includes("KEY STAGE 2") || upper.includes("KS2")) {
          keyStage = "KS2";
        } else if (upper.includes("KEY STAGE 3") || upper.includes("KS3")) {
          keyStage = "KS3";
        } else if (
          upper.includes("KEY STAGE 4") ||
          upper.includes("KS4") ||
          upper.includes("ACADEMIC TRACK") ||
          upper.includes("TECH-PRO TRACK")
        ) {
          keyStage = "KS4";
        }
      }

      const isSds = !!(
        item.isSdsApproved ||
        item.is_sds_approved ||
        String(rawKey).includes("::APPROVED_SDS")
      );
      const isConf = !!(item.sdsConfirmed || item.sds_confirmed || isSds);
      const dsgName = (
        item.designationName ||
        item.designation_name ||
        item.name ||
        cleanKey.split(" - ")[0]
      )
        .replace(/::APPROVED_SDS/gi, "")
        .trim();

      dsgObj = {
        designationName: dsgName || "OFFICIAL DESIGNATION",
        keyStage: keyStage || null,
        gradeLevel: item.gradeLevel || item.grade_level || "",
        subjectArea: item.subjectArea || item.subject_area || "",
        track: item.track || "",
        isSdsApproved: isSds,
        sdsConfirmed: isConf,
        serializedKey: rawKey,
        rawPayload: item,
      };
    }

    if (!dsgObj.designationName) continue;

    const dsgId = `DSG-${String(targetSchoolId).replace("SCH-", "")}-${String(personnelId).split("-").pop()}-${String(counter++).padStart(3, "0")}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    await client.query(
      `INSERT INTO esf7_personnel_designations (
        id, personnel_id, designation_name, key_stage, grade_level, subject_area, track,
        is_sds_approved, sds_confirmed, serialized_key, raw_payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [
        dsgId,
        personnelId,
        dsgObj.designationName,
        dsgObj.keyStage || null,
        dsgObj.gradeLevel || null,
        dsgObj.subjectArea || null,
        dsgObj.track || null,
        !!dsgObj.isSdsApproved,
        !!dsgObj.sdsConfirmed,
        dsgObj.serializedKey || dsgObj.designationName,
        JSON.stringify(dsgObj.rawPayload || dsgObj),
      ],
    );
  }
}

// POST Add new personnel profile
router.post("/", async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const {
      school_id,
      schoolId: bodySchoolId,
      school_year,
      schoolYear: bodySchoolYear,
      type,
      salutation,
      first_name,
      firstName,
      middle_name,
      middleName,
      last_name,
      lastName,
      name_extension,
      nameExtension,
      sex_at_birth,
      sexAtBirth,
      civil_status,
      civilStatus,
      solo_parent,
      soloParent,
      religion,
      ethnic_group,
      ethnicGroup,
      birthdate,
      age,
      philsys_no,
      philsysNo,
      no_philsys,
      noPhilsys,
      tin,
      no_tin,
      noTin,
      employee_no,
      employeeNo,
      deped_email,
      depedEmail,
      no_deped_email,
      noDepedEmail,
      allow_email_discrepancy,
      allowEmailDiscrepancy,
      is_school_head,
      isSchoolHead,
      prn: inputPrn,
      // Employment fields
      position_category,
      positionCategory,
      position,
      step_increment,
      stepIncrement,
      fund_source,
      fundSource,
      nature_of_appointment,
      natureOfAppointment,
      hiring_arrangement,
      hiringArrangement,
      deployment_status,
      deploymentStatus,
      assigned_schools,
      assignedSchools,
      grade_levels_taught,
      gradeLevelsTaught,
      assignedGradeLevels,
      assigned_grade_levels,
      first_service_date,
      firstServiceDate,
      last_promotion_date,
      lastPromotionDate,
      new_station_date,
      newStationDate,
      last_lateral_movement_date,
      lastLateralMovementDate,
      // Education fields
      highest_educational_attainment,
      highestEducationalAttainment,
      shs_track,
      shsTrack,
      vocational_course,
      vocationalCourse,
      vocational_level,
      vocationalLevel,
      college_degree,
      collegeDegree,
      major,
      minor,
      post_graduate_degree,
      postGraduateDegree,
      post_graduate_discipline,
      postGraduateDiscipline,
      postGraduateDisciplineCustom,
      eligibility,
      prc_specialization,
      prcSpecialization,
      // L&D Training rows
      neapTrainingRows,
      certificationRows,
      otherTrainingRows,
      // Learning Area Map
      learningAreaMap,
      matrix_data,
      // Designations
      designation,
      designations,
    } = req.body;

    const targetSchoolId =
      school_id || bodySchoolId || (req.auth && req.auth.schoolId) || "108348";
    const targetSchoolYear = school_year || bodySchoolYear || "2026-2027";

    // Match existing records by PRN, ID/legacy_id, or First + Last Name in this school
    const checkFName = (first_name || firstName || "").toUpperCase().trim();
    const checkLName = (last_name || lastName || "").toUpperCase().trim();
    const cleanTargetSchool = String(targetSchoolId).replace("SCH-", "").trim();

    const dup = await client.query(
      `SELECT id, prn, school_id, status FROM esf7_personnel_profile 
       WHERE ($1::text IS NOT NULL AND (id = $1 OR legacy_id = $1)) 
          OR ($2::text IS NOT NULL AND prn = $2) 
          OR (REPLACE(school_id, 'SCH-', '') = $3 AND $4 <> '' AND $5 <> '' AND first_name = $4 AND last_name = $5)
       LIMIT 1`,
      [req.body.id || null, inputPrn || null, cleanTargetSchool, checkFName, checkLName],
    );
    if (dup.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(200).json({
        id: dup.rows[0].id,
        prn: dup.rows[0].prn,
        schoolId: dup.rows[0].school_id,
        status: dup.rows[0].status,
        existing: true,
      });
    }

    // A school can have several Principals but only ONE designated school head
    if (is_school_head === true || isSchoolHead === true) {
      const bare = String(targetSchoolId).replace("SCH-", "");
      const headCheck = await client.query(
        `SELECT first_name, last_name, position FROM esf7_personnel_profile
          WHERE REPLACE(school_id, 'SCH-', '') = $1 AND is_school_head = TRUE LIMIT 1`,
        [bare],
      );
      if (headCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        const h = headCheck.rows[0];
        return res.status(400).json({
          error: `School head already designated (${h.first_name} ${h.last_name} - ${h.position}). A school can only have ONE School Head.`,
        });
      }
    }

    // Generate sequential numeric ID matching all existing personnel records
    let newId = req.body.id && /^\d+$/.test(req.body.id) ? req.body.id : null;
    if (!newId) {
      const maxIdRes = await client.query(
        "SELECT MAX(id::bigint) AS max_id FROM esf7_personnel_profile WHERE id ~ '^[0-9]+$'"
      );
      const nextNum = maxIdRes.rows[0]?.max_id ? BigInt(maxIdRes.rows[0].max_id) + 1n : 843141n;
      newId = nextNum.toString();
    }
    const legacyId = req.body.id ? String(req.body.id).trim() : newId;
    const personnelStatus = req.body.status || "canonical";
    const customId = newId;

    let finalPrn = null;
    if (inputPrn || employee_no || employeeNo) {
      finalPrn = formatCanonicalPrn(inputPrn || employee_no || employeeNo);
    } else {
      const countRes = await client.query(
        "SELECT COUNT(*)::int AS cnt FROM esf7_personnel_profile WHERE REPLACE(school_id, 'SCH-', '') = $1",
        [String(targetSchoolId).replace("SCH-", "")]
      );
      const nextSeq = (countRes.rows[0]?.cnt || 0) + 1;
      finalPrn = `PRN-${nextSeq}`;
    }
    const finalFirstName = (first_name || firstName || "").toUpperCase();
    const finalLastName = (last_name || lastName || "").toUpperCase();
    const finalMiddleName = (middle_name || middleName || "").toUpperCase();
    const finalSalutation = (salutation || "MR.").toUpperCase();
    const finalSex = (sex_at_birth || sexAtBirth || "MALE").toUpperCase();
    const computedAge = calculateAge(birthdate) || (age ? Number(age) : null);

    const finalAllowEmailDiscrepancy =
      allow_email_discrepancy !== undefined
        ? allow_email_discrepancy === true || allow_email_discrepancy === "true"
        : allowEmailDiscrepancy !== undefined
          ? allowEmailDiscrepancy === true || allowEmailDiscrepancy === "true"
          : false;

    const insertProfileQuery = `
      INSERT INTO esf7_personnel_profile (
        id, prn, school_id, school_year, type, salutation, first_name, middle_name, last_name, name_extension,
        tin, no_tin, sex_at_birth, civil_status, solo_parent, religion, ethnic_group, birthdate, age,
        philsys_no, no_philsys, employee_no, deped_email, no_deped_email, allow_email_discrepancy, is_school_head,
        status, legacy_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
      RETURNING *;
    `;

    const profileValues = [
      customId,
      finalPrn,
      targetSchoolId,
      targetSchoolYear,
      type || "teaching",
      finalSalutation,
      finalFirstName,
      finalMiddleName || null,
      finalLastName,
      (name_extension || nameExtension || "").toUpperCase() || null,
      tin || null,
      no_tin === true || noTin === true,
      finalSex,
      (civil_status || civilStatus || "").toUpperCase() || null,
      solo_parent === true || soloParent === "YES" || soloParent === true,
      (religion || "").toUpperCase() || null,
      (ethnic_group || ethnicGroup || "").toUpperCase() || null,
      coerceDateField(birthdate, "birthdate"),
      computedAge,
      philsys_no || philsysNo || null,
      no_philsys === true || noPhilsys === true,
      employee_no || employeeNo || null,
      (() => {
        const rawAppt = (nature_of_appointment || natureOfAppointment || "")
          .toUpperCase()
          .trim();
        const rawMail = (deped_email || depedEmail || "").trim();
        if (rawAppt === "REGULAR PERMANENT" && rawMail === "N/A") return "";
        return rawMail;
      })(),
      (() => {
        const rawAppt = (nature_of_appointment || natureOfAppointment || "")
          .toUpperCase()
          .trim();
        if (rawAppt === "REGULAR PERMANENT") return false;
        return (
          no_deped_email === true ||
          noDepedEmail === true ||
          deped_email === "N/A" ||
          depedEmail === "N/A"
        );
      })(),
      finalAllowEmailDiscrepancy,
      is_school_head === true || isSchoolHead === true,
      personnelStatus,
      legacyId,
    ];

    const profileRes = await client.query(insertProfileQuery, profileValues);
    const createdProfile = profileRes.rows[0];

    if (legacyId) {
      await client
        .query(
          `INSERT INTO esf7_personnel_id_mapping (legacy_id, new_id, status) VALUES ($1, $2, $3) ON CONFLICT (legacy_id) DO NOTHING`,
          [legacyId, newId, personnelStatus],
        )
        .catch(() => {});
    }

    // Insert linked employment
    const empPos = (position || "TEACHER I").toUpperCase();
    const isCook = empPos === "COOK";
    const catObj = determinePositionCategory(empPos);
    const empCat = isCook
      ? "NON-TEACHING"
      : (
          position_category ||
          positionCategory ||
          type ||
          catObj.category ||
          "TEACHING"
        ).toUpperCase();
    const empStep = Number(step_increment || stepIncrement || 1);
    let empFund = (
      fund_source ||
      fundSource ||
      (isCook ? "SBFP" : "NATIONAL")
    ).toUpperCase();
    if (!isCook && empFund === "SBFP") {
      empFund = "NATIONAL";
    }
    const empAppt = (
      nature_of_appointment ||
      natureOfAppointment ||
      (isCook ? "CONTRACTUAL" : "REGULAR PERMANENT")
    ).toUpperCase();
    const empHire = (
      hiring_arrangement ||
      hiringArrangement ||
      (isCook ? "CONTRACTUAL" : "PERMANENT")
    ).toUpperCase();
    const empDeploy = (
      deployment_status ||
      deploymentStatus ||
      "OWN STATION"
    ).toUpperCase();
    const crypto = require("crypto");
    const empId = crypto.randomUUID();

    const insertEmpQuery = `
      INSERT INTO esf7_personnel_employment (
        id, personnel_id, position_category, position, step_increment, fund_source, nature_of_appointment,
        hiring_arrangement, deployment_status, assigned_schools, grade_levels_taught,
        first_service_date, last_promotion_date, new_station_date, last_lateral_movement_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15)
      ON CONFLICT (personnel_id) DO UPDATE SET
        position_category = EXCLUDED.position_category,
        position = EXCLUDED.position,
        step_increment = EXCLUDED.step_increment,
        fund_source = EXCLUDED.fund_source,
        nature_of_appointment = EXCLUDED.nature_of_appointment,
        hiring_arrangement = EXCLUDED.hiring_arrangement,
        deployment_status = EXCLUDED.deployment_status,
        assigned_schools = EXCLUDED.assigned_schools,
        grade_levels_taught = EXCLUDED.grade_levels_taught,
        first_service_date = EXCLUDED.first_service_date,
        last_promotion_date = EXCLUDED.last_promotion_date,
        new_station_date = EXCLUDED.new_station_date,
        last_lateral_movement_date = EXCLUDED.last_lateral_movement_date,
        updated_at = NOW()
      RETURNING *;
    `;

    const empValues = [
      empId,
      createdProfile.id,
      empCat,
      empPos,
      empStep,
      empFund,
      empAppt,
      empHire,
      empDeploy,
      JSON.stringify(assigned_schools || assignedSchools || []),
      JSON.stringify(
        sanitizeGradeArray(
          assignedGradeLevels ||
            assigned_grade_levels ||
            grade_levels_taught ||
            gradeLevelsTaught ||
            [],
        ),
      ),
      coerceDateField(
        first_service_date || firstServiceDate,
        "first_service_date",
      ),
      coerceDateField(
        last_promotion_date || lastPromotionDate,
        "last_promotion_date",
      ),
      coerceDateField(new_station_date || newStationDate, "new_station_date"),
      coerceDateField(
        last_lateral_movement_date || lastLateralMovementDate,
        "last_lateral_movement_date",
      ),
    ];

    await client.query(insertEmpQuery, empValues);

    //     // Upsert linked education
    const eduHighestAttainment = (
      highest_educational_attainment ||
      highestEducationalAttainment ||
      (college_degree || collegeDegree
        ? "COLLEGE GRADUATE / BACCALAUREATE"
        : "COLLEGE GRADUATE / BACCALAUREATE")
    ).toUpperCase();
    const eduShsTrack = (shs_track || shsTrack || "").toUpperCase() || null;
    const eduVocationalCourse =
      (vocational_course || vocationalCourse || "").toUpperCase() || null;
    const eduVocationalLevel =
      (vocational_level || vocationalLevel || "").toUpperCase() || null;
    let eduDegree =
      (college_degree || collegeDegree || "").toUpperCase() || null;
    let eduMaj = (major || "").toUpperCase();
    let eduMin = (minor || "").toUpperCase();

    const rawCollegeDegrees =
      req.body.college_degrees || req.body.collegeDegrees;
    let eduCollegeDegrees = [];
    if (Array.isArray(rawCollegeDegrees)) {
      eduCollegeDegrees = rawCollegeDegrees
        .filter((d) => d && (d.collegeDegree || d.college_degree))
        .map((d) => ({
          collegeDegree: (d.collegeDegree || d.college_degree || "")
            .trim()
            .toUpperCase(),
          major: (d.major || "").trim().toUpperCase(),
          minor: (d.minor || "").trim().toUpperCase(),
        }));
    }
    if (eduCollegeDegrees.length > 0) {
      eduDegree = eduCollegeDegrees[0].collegeDegree || eduDegree;
      eduMaj = eduCollegeDegrees[0].major || eduMaj;
      eduMin = eduCollegeDegrees[0].minor || eduMin;
    } else if (eduDegree) {
      eduCollegeDegrees = [
        {
          collegeDegree: eduDegree,
          major: eduMaj || "",
          minor: eduMin || "",
        },
      ];
    }

    const eduPostDeg = (
      post_graduate_degree ||
      postGraduateDegree ||
      "N/A"
    ).toUpperCase();
    const parsedPostDisc = parsePostGraduateDiscipline(
      post_graduate_discipline ||
        postGraduateDiscipline ||
        postGraduateDisciplineCustom,
      req.body,
      req.body,
      eduHighestAttainment,
    );
    const eduPostDisc = parsedPostDisc.jsonString;
    const eduPrcSpec = (
      prc_specialization ||
      prcSpecialization ||
      ""
    ).toUpperCase();
    const eduId = `EDU-${targetSchoolId.replace("SCH-", "")}-${newId.slice(0, 8)}`;

    let eligibilityArray = [];
    if (Array.isArray(eligibility)) {
      eligibilityArray = eligibility;
    } else if (
      typeof eligibility === "string" &&
      eligibility.trim().length > 0
    ) {
      eligibilityArray = eligibility
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const insertEducQuery = `
      INSERT INTO esf7_perssonel_educ (
        id, personnel_id, highest_educational_attainment, shs_track, vocational_course, vocational_level,
        college_degree, college_degrees, major, minor, post_graduate_degree,
        post_graduate_discipline, eligibility, prc_specialization, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15::jsonb)
      ON CONFLICT (personnel_id) DO UPDATE SET
        highest_educational_attainment = EXCLUDED.highest_educational_attainment,
        shs_track = EXCLUDED.shs_track,
        vocational_course = EXCLUDED.vocational_course,
        vocational_level = EXCLUDED.vocational_level,
        college_degree = EXCLUDED.college_degree,
        college_degrees = EXCLUDED.college_degrees,
        major = EXCLUDED.major,
        minor = EXCLUDED.minor,
        post_graduate_degree = EXCLUDED.post_graduate_degree,
        post_graduate_discipline = EXCLUDED.post_graduate_discipline,
        eligibility = EXCLUDED.eligibility,
        prc_specialization = EXCLUDED.prc_specialization,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const educValues = [
      eduId,
      createdProfile.id,
      eduHighestAttainment,
      eduShsTrack,
      eduVocationalCourse,
      eduVocationalLevel,
      eduDegree,
      JSON.stringify(eduCollegeDegrees),
      eduMaj || null,
      eduMin || null,
      eduPostDeg,
      eduPostDisc || null,
      JSON.stringify(eligibilityArray),
      eduPrcSpec || null,
      JSON.stringify(req.body),
    ];

    await client.query(insertEducQuery, educValues);

    // Sync training rows into esf7_personnel_ld_trainings
    await syncTrainingsInTransaction(
      client,
      createdProfile.id,
      neapTrainingRows,
      certificationRows,
      otherTrainingRows,
    );

    // Sync learning area matrix into esf7_personnel_learning_areas
    await syncLearningAreasInTransaction(
      client,
      createdProfile.id,
      targetSchoolId,
      learningAreaMap,
      matrix_data,
      req.body,
    );

    // Sync designations into esf7_personnel_designations
    await syncDesignationsInTransaction(
      client,
      createdProfile.id,
      targetSchoolId,
      designation,
      designations,
      req.body,
    );

    await client.query("COMMIT");

    // Fetch the newly created complete record
    const completeRes = await db.query(
      `
      SELECT 
        p.*,
        e.id AS emp_id,
        e.position_category,
        e.position,
        e.step_increment,
        e.fund_source,
        e.nature_of_appointment,
        e.hiring_arrangement,
        e.deployment_status,
        e.assigned_schools,
        e.grade_levels_taught,
        e.first_service_date,
        e.last_promotion_date,
        e.new_station_date,
        e.last_lateral_movement_date,
        '{}'::jsonb AS employment_raw_payload,
        ed.id AS educ_id,
        ed.highest_educational_attainment,
        ed.shs_track,
        ed.vocational_course,
        ed.vocational_level,
        ed.college_degree,
        ed.college_degrees,
        ed.major,
        ed.minor,
        ed.post_graduate_degree,
        ed.post_graduate_discipline,
        ed.eligibility,
        ed.prc_specialization,
        ed.raw_payload AS educ_raw_payload,
        la.id AS la_id,
        la.matrix_data,
        la.raw_payload AS la_raw_payload
      FROM esf7_personnel_profile p
      LEFT JOIN esf7_personnel_employment e ON p.id = e.personnel_id
      LEFT JOIN esf7_perssonel_educ ed ON p.id = ed.personnel_id
      LEFT JOIN esf7_personnel_learning_areas la ON p.id = la.personnel_id
      WHERE p.id = $1
    `,
      [createdProfile.id],
    );

    const createdRecord = completeRes.rows[0];
    const trRes = await db.query(
      `SELECT * FROM esf7_personnel_ld_trainings WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [createdRecord.id],
    );
    const dsgRes = await db.query(
      `SELECT * FROM esf7_personnel_designations WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [createdRecord.id],
    );

    res
      .status(201)
      .json(formatPersonnelRecord(createdRecord, trRes.rows, dsgRes.rows));
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error creating personnel record:", err);
    if (
      err.code === "23505" &&
      String(err.constraint || "").includes("one_school_head")
    ) {
      return res.status(400).json({
        error:
          "A school can only have ONE School Head. Remove the current designation first.",
      });
    }
    res
      .status(err.status || 500)
      .json({ error: err.message, ...(err.field ? { field: err.field } : {}) });
  } finally {
    client.release();
  }
});

// PUT update personnel profile JOINED with Employment, Education, Trainings, Learning Areas & Designations
router.put("/:id", async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query("BEGIN");

    const {
      school_id,
      schoolId,
      type,
      salutation,
      first_name,
      firstName,
      middle_name,
      middleName,
      last_name,
      lastName,
      name_extension,
      nameExtension,
      tin,
      no_tin,
      noTin,
      sex_at_birth,
      sexAtBirth,
      civil_status,
      civilStatus,
      solo_parent,
      soloParent,
      religion,
      ethnic_group,
      ethnicGroup,
      birthdate,
      age,
      philsys_no,
      philsysNo,
      no_philsys,
      noPhilsys,
      employee_no,
      employeeNo,
      deped_email,
      depedEmail,
      no_deped_email,
      noDepedEmail,
      allow_email_discrepancy,
      allowEmailDiscrepancy,
      is_school_head,
      isSchoolHead,

      // Employment Fields
      position_category,
      positionCategory,
      position,
      step_increment,
      stepIncrement,
      fund_source,
      fundSource,
      nature_of_appointment,
      natureOfAppointment,
      hiring_arrangement,
      hiringArrangement,
      deployment_status,
      deploymentStatus,
      assigned_schools,
      assignedSchools,
      grade_levels_taught,
      gradeLevelsTaught,
      assignedGradeLevels,
      assigned_grade_levels,
      first_service_date,
      firstServiceDate,
      last_promotion_date,
      lastPromotionDate,
      new_station_date,
      newStationDate,
      last_lateral_movement_date,
      lastLateralMovementDate,

      // Education Fields
      highest_educational_attainment,
      highestEducationalAttainment,
      shs_track,
      shsTrack,
      vocational_course,
      vocationalCourse,
      vocational_level,
      vocationalLevel,
      college_degree,
      collegeDegree,
      major,
      minor,
      post_graduate_degree,
      postGraduateDegree,
      post_graduate_discipline,
      postGraduateDiscipline,
      postGraduateDisciplineCustom,
      eligibility,
      prc_specialization,
      prcSpecialization,

      // Training Rows
      neapTrainingRows = [],
      certificationRows = [],
      otherTrainingRows = [],

      // Learning Area Map
      learningAreaMap = {},
      matrix_data = {},

      // Designations
      designation = "",
      designations = [],
    } = req.body;

    // Check if updating to school head conflicts with another school head
    const targetSchoolId = (school_id || schoolId || "108348").replace(
      "SCH-",
      "",
    );
    const isTargetHead =
      is_school_head !== undefined
        ? !!is_school_head
        : isSchoolHead !== undefined
          ? !!isSchoolHead
          : false;

    if (isTargetHead) {
      const headCheck = await client.query(
        `SELECT id, first_name, last_name, position FROM esf7_personnel_profile 
         WHERE (school_id = $1 OR school_id = $2) AND is_school_head = TRUE AND id != $3 AND (legacy_id IS NULL OR legacy_id != $3) LIMIT 1`,
        [targetSchoolId, `SCH-${targetSchoolId}`, req.params.id],
      );
      if (headCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        const h = headCheck.rows[0];
        return res.status(400).json({
          error: `School head already designated (${h.first_name} ${h.last_name} - ${h.position}). A school can only have ONE School Head.`,
        });
      }
    }

    const resolvedId = await resolvePersonnelId(client, req.params.id);
    const currentRes = await client.query(
      `SELECT * FROM esf7_personnel_profile WHERE id = $1 OR UPPER(id) = UPPER($1) OR legacy_id = $1 OR UPPER(legacy_id) = UPPER($1) OR prn = $1 OR id = $2 OR id IN (SELECT new_id FROM esf7_personnel_id_mapping WHERE legacy_id = $1) LIMIT 1`,
      [req.params.id, resolvedId],
    );

    if (currentRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Personnel profile not found" });
    }

    const current = currentRes.rows[0];

    const finalFName = (
      first_name !== undefined
        ? first_name
        : firstName !== undefined
          ? firstName
          : current.first_name || ""
    ).toUpperCase();
    const finalMName = (
      middle_name !== undefined
        ? middle_name
        : middleName !== undefined
          ? middleName
          : current.middle_name || ""
    ).toUpperCase();
    const finalLName = (
      last_name !== undefined
        ? last_name
        : lastName !== undefined
          ? lastName
          : current.last_name || ""
    ).toUpperCase();
    const finalExt = (
      name_extension !== undefined
        ? name_extension
        : nameExtension !== undefined
          ? nameExtension
          : current.name_extension || ""
    ).toUpperCase();
    const finalTin = (tin !== undefined ? tin : current.tin || "").trim();
    const finalNoTin =
      no_tin !== undefined
        ? no_tin
        : noTin !== undefined
          ? noTin
          : current.no_tin;
    const finalSex = (
      sex_at_birth !== undefined
        ? sex_at_birth
        : sexAtBirth !== undefined
          ? sexAtBirth
          : current.sex_at_birth || "FEMALE"
    ).toUpperCase();
    const finalCivil = (
      civil_status !== undefined
        ? civil_status
        : civilStatus !== undefined
          ? civilStatus
          : current.civil_status || "SINGLE"
    ).toUpperCase();
    const finalSolo =
      solo_parent !== undefined
        ? solo_parent === "YES" || solo_parent === true
        : soloParent !== undefined
          ? soloParent === "YES" || soloParent === true
          : current.solo_parent;
    const finalRel = (
      religion !== undefined ? religion : current.religion || "CHRISTIANITY"
    ).toUpperCase();
    const rawEth =
      ethnic_group !== undefined
        ? ethnic_group
        : ethnicGroup !== undefined
          ? ethnicGroup
          : current.ethnic_group || "";
    const finalEth = (rawEth === "OTHERS" ? "" : rawEth).toUpperCase();
    const finalBDate =
      birthdate !== undefined
        ? isDatePlaceholder(birthdate) && birthdate !== null && birthdate !== ""
          ? current.birthdate
          : coerceDateField(birthdate, "birthdate")
        : current.birthdate;
    const finalAge =
      age !== undefined ? age : sanitizeAge(current.age, finalBDate);
    const finalPhilSys = (
      philsys_no !== undefined
        ? philsys_no
        : philsysNo !== undefined
          ? philsysNo
          : current.philsys_no || ""
    ).trim();
    const finalNoPhilSys =
      no_philsys !== undefined
        ? no_philsys === true || no_philsys === "true"
        : noPhilsys !== undefined
          ? noPhilsys === true || noPhilsys === "true"
          : current.no_philsys;
    const finalEmpNo = (
      employee_no !== undefined
        ? employee_no
        : employeeNo !== undefined
          ? employeeNo
          : current.employee_no || ""
    ).trim();
    const empApptCheck = (
      nature_of_appointment ||
      natureOfAppointment ||
      current.nature_of_appointment ||
      "REGULAR PERMANENT"
    )
      .toUpperCase()
      .trim();
    const isRegularPermanent = empApptCheck === "REGULAR PERMANENT";
    const rawEmail = (
      deped_email !== undefined
        ? deped_email
        : depedEmail !== undefined
          ? depedEmail
          : current.deped_email || ""
    ).trim();
    const finalEmail = isRegularPermanent && rawEmail === "N/A" ? "" : rawEmail;
    const finalNoEmail = isRegularPermanent
      ? false
      : (no_deped_email !== undefined
          ? no_deped_email === true || no_deped_email === "true"
          : noDepedEmail !== undefined
            ? noDepedEmail === true || noDepedEmail === "true"
            : !!current.no_deped_email) || finalEmail === "N/A";
    const finalAllowEmailDiscrepancy =
      allow_email_discrepancy !== undefined
        ? allow_email_discrepancy === true || allow_email_discrepancy === "true"
        : allowEmailDiscrepancy !== undefined
          ? allowEmailDiscrepancy === true || allowEmailDiscrepancy === "true"
          : !!current.allow_email_discrepancy;
    const finalSalutation = (
      salutation !== undefined ? salutation : current.salutation || "MR."
    ).toUpperCase();
    const finalType = type !== undefined ? type : current.type;

    const finalPrn = req.body.prn ? formatCanonicalPrn(req.body.prn) : null;

    const updateProfileQuery = `
      UPDATE esf7_personnel_profile SET
        school_id = $1,
        type = $2,
        salutation = $3,
        first_name = $4,
        middle_name = $5,
        last_name = $6,
        name_extension = $7,
        tin = $8,
        no_tin = $9,
        sex_at_birth = $10,
        civil_status = $11,
        solo_parent = $12,
        religion = $13,
        ethnic_group = $14,
        birthdate = $15,
        age = $16,
        philsys_no = $17,
        no_philsys = $18,
        employee_no = $19,
        deped_email = $20,
        no_deped_email = $21,
        allow_email_discrepancy = $22,
        is_school_head = $23,
        prn = COALESCE($24, esf7_personnel_profile.prn),
        status = COALESCE($25, esf7_personnel_profile.status),
        updated_at = NOW()
      WHERE id = $26
      RETURNING *;
    `;

    const profileValues = [
      targetSchoolId,
      finalType,
      finalSalutation,
      finalFName,
      finalMName,
      finalLName,
      finalExt,
      finalTin,
      finalNoTin,
      finalSex,
      finalCivil,
      finalSolo,
      finalRel,
      finalEth,
      finalBDate,
      finalAge,
      finalPhilSys,
      finalNoPhilSys,
      finalEmpNo,
      finalEmail,
      finalNoEmail,
      finalAllowEmailDiscrepancy,
      isTargetHead,
      finalPrn,
      req.body.status || null,
      current.id,
    ];

    const profileRes = await client.query(updateProfileQuery, profileValues);
    let updatedProfile = profileRes.rows[0];

    // Disabled service years (Learning Area tab). Validated whole number, never more than the years since first service.
    const rawDisabled =
      req.body.disabledServiceYears ?? req.body.disabled_service_years;
    if (
      rawDisabled !== undefined &&
      rawDisabled !== null &&
      rawDisabled !== ""
    ) {
      const n = Number(rawDisabled);
      if (!Number.isInteger(n) || n < 0 || n > 70) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "Disabled service years must be a whole number from 0 to 70.",
        });
      }
      await ensureDisabledYearsColumn();
      const upd = await client.query(
        `UPDATE esf7_personnel_profile SET disabled_service_years = $1 WHERE id = $2 RETURNING *`,
        [n, updatedProfile.id],
      );
      if (upd.rows[0]) updatedProfile = upd.rows[0];
    }

    let empPos = (position || "TEACHER I").toUpperCase();
    const isCook = empPos === "COOK";
    const catObj = determinePositionCategory(empPos);
    const empCat = isCook
      ? "NON-TEACHING"
      : (
          position_category ||
          positionCategory ||
          catObj.category ||
          "TEACHING"
        ).toUpperCase();
    const empStep = sanitizeStepIncrement(step_increment || stepIncrement);
    let empFund = (
      fund_source ||
      fundSource ||
      (isCook ? "SBFP" : "NATIONAL")
    ).toUpperCase();
    if (!isCook && empFund === "SBFP") {
      empFund = "NATIONAL";
    }
    const empAppt = (
      nature_of_appointment ||
      natureOfAppointment ||
      (isCook ? "CONTRACTUAL" : "REGULAR PERMANENT")
    ).toUpperCase();
    const empHire = (
      hiring_arrangement ||
      hiringArrangement ||
      (isCook ? "CONTRACTUAL" : "REGULAR")
    ).toUpperCase();
    const empDeploy = (
      deployment_status ||
      deploymentStatus ||
      "OWN STATION"
    ).toUpperCase();
    const crypto = require("crypto");
    const empId = crypto.randomUUID();

    const upsertEmpQuery = `
      INSERT INTO esf7_personnel_employment (
        id, personnel_id, position_category, position, step_increment, fund_source,
        nature_of_appointment, hiring_arrangement, deployment_status, assigned_schools,
        grade_levels_taught, first_service_date, last_promotion_date, new_station_date,
        last_lateral_movement_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15)
      ON CONFLICT (personnel_id) DO UPDATE SET
        position_category = EXCLUDED.position_category,
        position = EXCLUDED.position,
        step_increment = EXCLUDED.step_increment,
        fund_source = EXCLUDED.fund_source,
        nature_of_appointment = EXCLUDED.nature_of_appointment,
        hiring_arrangement = EXCLUDED.hiring_arrangement,
        deployment_status = EXCLUDED.deployment_status,
        assigned_schools = EXCLUDED.assigned_schools,
        grade_levels_taught = EXCLUDED.grade_levels_taught,
        first_service_date = EXCLUDED.first_service_date,
        last_promotion_date = EXCLUDED.last_promotion_date,
        new_station_date = EXCLUDED.new_station_date,
        last_lateral_movement_date = EXCLUDED.last_lateral_movement_date,
        updated_at = NOW()
      RETURNING *;
    `;

    const empValues = [
      empId,
      updatedProfile.id,
      empCat,
      empPos,
      empStep,
      empFund,
      empAppt,
      empHire,
      empDeploy,
      JSON.stringify(assigned_schools || assignedSchools || []),
      JSON.stringify(
        sanitizeGradeArray(
          assignedGradeLevels ||
            assigned_grade_levels ||
            grade_levels_taught ||
            gradeLevelsTaught ||
            [],
        ),
      ),
      coerceDateField(
        first_service_date || firstServiceDate,
        "first_service_date",
      ),
      coerceDateField(
        last_promotion_date || lastPromotionDate,
        "last_promotion_date",
      ),
      coerceDateField(new_station_date || newStationDate, "new_station_date"),
      coerceDateField(
        last_lateral_movement_date || lastLateralMovementDate,
        "last_lateral_movement_date",
      ),
    ];

    const empRes = await client.query(upsertEmpQuery, empValues);

    // Upsert linked education
    const eduHighestAttainment = (
      highest_educational_attainment ||
      highestEducationalAttainment ||
      (college_degree || collegeDegree
        ? "COLLEGE GRADUATE / BACCALAUREATE"
        : "COLLEGE GRADUATE / BACCALAUREATE")
    ).toUpperCase();
    const eduShsTrack = (shs_track || shsTrack || "").toUpperCase() || null;
    const eduVocationalCourse =
      (vocational_course || vocationalCourse || "").toUpperCase() || null;
    const eduVocationalLevel =
      (vocational_level || vocationalLevel || "").toUpperCase() || null;
    let eduDegree =
      (college_degree || collegeDegree || "").toUpperCase() || null;
    let eduMaj = (major || "").toUpperCase();
    let eduMin = (minor || "").toUpperCase();

    const rawCollegeDegrees =
      req.body.college_degrees || req.body.collegeDegrees;
    let eduCollegeDegrees = [];
    if (Array.isArray(rawCollegeDegrees)) {
      eduCollegeDegrees = rawCollegeDegrees
        .filter((d) => d && (d.collegeDegree || d.college_degree))
        .map((d) => ({
          collegeDegree: (d.collegeDegree || d.college_degree || "")
            .trim()
            .toUpperCase(),
          major: (d.major || "").trim().toUpperCase(),
          minor: (d.minor || "").trim().toUpperCase(),
        }));
    }
    if (eduCollegeDegrees.length > 0) {
      eduDegree = eduCollegeDegrees[0].collegeDegree || eduDegree;
      eduMaj = eduCollegeDegrees[0].major || eduMaj;
      eduMin = eduCollegeDegrees[0].minor || eduMin;
    } else if (eduDegree) {
      eduCollegeDegrees = [
        {
          collegeDegree: eduDegree,
          major: eduMaj || "",
          minor: eduMin || "",
        },
      ];
    }

    const eduPostDeg = (
      post_graduate_degree ||
      postGraduateDegree ||
      "N/A"
    ).toUpperCase();
    const parsedPostDisc = parsePostGraduateDiscipline(
      post_graduate_discipline ||
        postGraduateDiscipline ||
        postGraduateDisciplineCustom,
      req.body,
      req.body,
      eduHighestAttainment,
    );
    const eduPostDisc = parsedPostDisc.jsonString;
    const eduPrcSpec = (
      prc_specialization ||
      prcSpecialization ||
      ""
    ).toUpperCase();
    const eduId = `EDU-${updatedProfile.school_id.replace("SCH-", "")}-${updatedProfile.id.split("-").pop()}`;

    let eligibilityArray = [];
    if (Array.isArray(eligibility)) {
      eligibilityArray = eligibility;
    } else if (
      typeof eligibility === "string" &&
      eligibility.trim().length > 0
    ) {
      eligibilityArray = eligibility
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const upsertEducQuery = `
      INSERT INTO esf7_perssonel_educ (
        id, personnel_id, highest_educational_attainment, shs_track, vocational_course, vocational_level,
        college_degree, college_degrees, major, minor, post_graduate_degree,
        post_graduate_discipline, eligibility, prc_specialization, raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15::jsonb)
      ON CONFLICT (personnel_id) DO UPDATE SET
        highest_educational_attainment = EXCLUDED.highest_educational_attainment,
        shs_track = EXCLUDED.shs_track,
        vocational_course = EXCLUDED.vocational_course,
        vocational_level = EXCLUDED.vocational_level,
        college_degree = EXCLUDED.college_degree,
        college_degrees = EXCLUDED.college_degrees,
        major = EXCLUDED.major,
        minor = EXCLUDED.minor,
        post_graduate_degree = EXCLUDED.post_graduate_degree,
        post_graduate_discipline = EXCLUDED.post_graduate_discipline,
        eligibility = EXCLUDED.eligibility,
        prc_specialization = EXCLUDED.prc_specialization,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *;
    `;

    const educValues = [
      eduId,
      updatedProfile.id,
      eduHighestAttainment,
      eduShsTrack,
      eduVocationalCourse,
      eduVocationalLevel,
      eduDegree,
      JSON.stringify(eduCollegeDegrees),
      eduMaj || null,
      eduMin || null,
      eduPostDeg,
      eduPostDisc || null,
      JSON.stringify(eligibilityArray),
      eduPrcSpec || null,
      JSON.stringify(req.body),
    ];

    const educRes = await client.query(upsertEducQuery, educValues);

    // Sync L&D training rows into esf7_personnel_ld_trainings
    await syncTrainingsInTransaction(
      client,
      updatedProfile.id,
      neapTrainingRows,
      certificationRows,
      otherTrainingRows,
    );

    // Sync learning area matrix into esf7_personnel_learning_areas
    await syncLearningAreasInTransaction(
      client,
      updatedProfile.id,
      updatedProfile.school_id,
      learningAreaMap,
      matrix_data,
      req.body,
    );

    // Sync designations into esf7_personnel_designations
    await syncDesignationsInTransaction(
      client,
      updatedProfile.id,
      updatedProfile.school_id,
      designation,
      designations,
      req.body,
    );

    await client.query("COMMIT");

    const trRes = await db.query(
      `SELECT * FROM esf7_personnel_ld_trainings WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [updatedProfile.id],
    );

    const laRes = await db.query(
      `SELECT * FROM esf7_personnel_learning_areas WHERE personnel_id = $1 LIMIT 1`,
      [updatedProfile.id],
    );

    const dsgRes = await db.query(
      `SELECT * FROM esf7_personnel_designations WHERE personnel_id = $1 ORDER BY created_at ASC`,
      [updatedProfile.id],
    );

    const laRow = laRes.rows.length > 0 ? laRes.rows[0] : {};

    const combinedRow = {
      ...updatedProfile,
      emp_id: empRes.rows[0].id,
      position_category: empRes.rows[0].position_category,
      position: empRes.rows[0].position,
      step_increment: empRes.rows[0].step_increment,
      fund_source: empRes.rows[0].fund_source,
      nature_of_appointment: empRes.rows[0].nature_of_appointment,
      hiring_arrangement: empRes.rows[0].hiring_arrangement,
      deployment_status: empRes.rows[0].deployment_status,
      assigned_schools: empRes.rows[0].assigned_schools,
      grade_levels_taught: empRes.rows[0].grade_levels_taught,
      first_service_date: empRes.rows[0].first_service_date,
      last_promotion_date: empRes.rows[0].last_promotion_date,
      new_station_date: empRes.rows[0].new_station_date,
      last_lateral_movement_date: empRes.rows[0].last_lateral_movement_date,
      employment_raw_payload: {},
      educ_id: educRes.rows[0].id,
      highest_educational_attainment:
        educRes.rows[0].highest_educational_attainment,
      shs_track: educRes.rows[0].shs_track,
      vocational_course: educRes.rows[0].vocational_course,
      vocational_level: educRes.rows[0].vocational_level,
      college_degree: educRes.rows[0].college_degree,
      college_degrees: educRes.rows[0].college_degrees,
      major: educRes.rows[0].major,
      minor: educRes.rows[0].minor,
      post_graduate_degree: educRes.rows[0].post_graduate_degree,
      post_graduate_discipline: educRes.rows[0].post_graduate_discipline,
      eligibility: educRes.rows[0].eligibility,
      prc_specialization: educRes.rows[0].prc_specialization,
      educ_raw_payload: educRes.rows[0].raw_payload,
      la_id: laRow.id || null,
      matrix_data: laRow.matrix_data || {},
      la_raw_payload: laRow.raw_payload || {},
    };

    res.json(formatPersonnelRecord(combinedRow, trRes.rows, dsgRes.rows));
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error updating personnel profile:", err);
    if (
      err.code === "23505" &&
      String(err.constraint || "").includes("one_school_head")
    ) {
      return res.status(400).json({
        error:
          "A school can only have ONE School Head. Remove the current designation first.",
      });
    }
    res
      .status(err.status || 500)
      .json({ error: err.message, ...(err.field ? { field: err.field } : {}) });
  } finally {
    client.release();
  }
});

// DELETE personnel profile (and cleanly cascade remove linked records + record deletion tombstone)

module.exports = router;
