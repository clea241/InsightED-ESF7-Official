const { getPool } = require("../db");

function sanitizeAge(ageVal, birthDate) {
  if (birthDate) {
    const d = new Date(birthDate);
    if (!isNaN(d.getTime())) {
      const now = new Date();
      let diff = now.getFullYear() - d.getFullYear();
      const m = now.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < d.getDate())) diff--;
      if (diff >= 18 && diff <= 100) return diff;
    }
  }
  const parsed = parseInt(ageVal, 10);
  return !isNaN(parsed) && parsed >= 18 && parsed <= 100 ? parsed : 30;
}

function sanitizeStepIncrement(step) {
  const parsed = parseInt(step, 10);
  return !isNaN(parsed) && parsed >= 1 && parsed <= 8 ? parsed : 1;
}

function sanitizeDate(val) {
  if (!val || typeof val !== "string") return null;
  const s = val.trim().toUpperCase();
  if (!s || s === "N/A" || s === "NONE" || s === "NULL" || s === "UNDEFINED")
    return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return val.trim();
}

async function main() {
  const pool = getPool();
  try {
    const schoolId = "300488";
    console.log(`Starting hydration for School ${schoolId}...`);

    // 1. Fetch roster_json from esf7_room_roster_cache
    const cacheRes = await pool.query(
      `SELECT roster_json FROM esf7_room_roster_cache WHERE school_id = $1`,
      [schoolId],
    );
    if (
      cacheRes.rows.length === 0 ||
      !Array.isArray(cacheRes.rows[0].roster_json)
    ) {
      throw new Error(
        `No roster_json found in esf7_room_roster_cache for School ${schoolId}`,
      );
    }
    const roster = cacheRes.rows[0].roster_json;
    console.log(`Found ${roster.length} authentic teachers in cache.`);

    // 2. Fetch current 14 records in esf7_personnel_profile
    const profRes = await pool.query(
      `SELECT * FROM esf7_personnel_profile WHERE school_id = $1 ORDER BY id`,
      [schoolId],
    );
    console.log(
      `Found ${profRes.rows.length} existing rows in esf7_personnel_profile.`,
    );

    for (const p of profRes.rows) {
      // Find matching teacher in roster
      const match = roster.find(
        (r) => r.id === p.id || r.personnel_id === p.id || r.prn === p.prn,
      );
      if (!match) {
        console.warn(
          `No match found in roster for personnel ID ${p.id} (PRN: ${p.prn})`,
        );
        continue;
      }

      console.log(
        `\nHydrating ${p.id}: ${match.lastName || match.last_name || match.last}, ${match.firstName || match.first_name || match.first}`,
      );

      const seq = p.id.split("-").pop();
      const fName = String(
        match.firstName || match.first_name || match.first || "TEACHER",
      )
        .trim()
        .toUpperCase();
      const lName = String(
        match.lastName || match.last_name || match.last || "STAFF",
      )
        .trim()
        .toUpperCase();
      const mName = String(
        match.middleName || match.middle_name || match.middle || "",
      )
        .trim()
        .toUpperCase();
      const extName = String(match.nameExtension || match.name_extension || "")
        .trim()
        .toUpperCase();
      const salutation = String(match.salutation || "MR.")
        .trim()
        .toUpperCase();
      const tin = String(match.tin || "").trim();
      const noTin = !tin;
      const sex = String(
        match.sexAtBirth || match.sex_at_birth || match.sex || "FEMALE",
      )
        .trim()
        .toUpperCase();
      const civilStatus = String(
        match.civilStatus || match.civil_status || "SINGLE",
      )
        .trim()
        .toUpperCase();
      const soloParent =
        String(match.soloParent || match.solo_parent || "NO")
          .trim()
          .toUpperCase() === "YES";
      const religion = String(match.religion || "CHRISTIANITY")
        .trim()
        .toUpperCase();
      const ethnicGroup = String(
        match.ethnicGroup || match.ethnic_group || match.ehtinic_group || "",
      )
        .trim()
        .toUpperCase();
      const rawBDate =
        match.birthdate ||
        (match.birthday_yyyy && match.birthday_mm && match.birthday_dd
          ? `${match.birthday_yyyy}-${String(match.birthday_mm).padStart(2, "0")}-${String(match.birthday_dd).padStart(2, "0")}`
          : null);
      const bDate = sanitizeDate(rawBDate);
      const computedAge = sanitizeAge(match.age, bDate);
      const empNo = String(match.employeeNo || match.employee_no || "").trim();
      const depedEmail = String(
        match.depedEmail || match.deped_email || "",
      ).trim();
      const noDepedEmail = !depedEmail || depedEmail === "N/A";
      const isHead = Boolean(match.isSchoolHead || match.is_school_head);

      // Employment
      const pos = String(
        match.position_title ||
          match.position ||
          match.plantilla_position ||
          "TEACHER I",
      )
        .trim()
        .toUpperCase();
      const posCat = String(
        match.positionCategory ||
          match.position_category ||
          match.type ||
          "TEACHING",
      )
        .trim()
        .toUpperCase();
      const stepInc = sanitizeStepIncrement(
        match.stepIncrement || match.step_increment,
      );
      const fundSrc = String(
        match.fundSource || match.fund_source || "NATIONAL",
      )
        .trim()
        .toUpperCase();
      const natAppt = String(
        match.natureOfAppointment ||
          match.nature_of_appointment ||
          "REGULAR PERMANENT",
      )
        .trim()
        .toUpperCase();
      const hireArr = String(
        match.hiringArrangement || match.hiring_arrangement || "REGULAR",
      )
        .trim()
        .toUpperCase();
      const depStat = String(
        match.deploymentStatus ||
          match.deployment_status ||
          match.status__item_ ||
          "OWN STATION",
      )
        .trim()
        .toUpperCase();
      const firstSvcDate = sanitizeDate(
        match.firstServiceDate || match.first_service_date,
      );
      const lastPromoDate =
        sanitizeDate(match.lastPromotionDate || match.last_promotion_date) ||
        firstSvcDate;
      const newStationDate =
        sanitizeDate(match.newStationDate || match.new_station_date) ||
        firstSvcDate;
      const lastLateralMovementDate = sanitizeDate(
        match.lastLateralMovementDate || match.last_lateral_movement_date,
      );
      const glTaught = match.gradeLevelsTaught ||
        match.grade_levels_taught ||
        match.assignedGradeLevels ||
        match.assigned_grade_levels || ["Grade 7", "Grade 8"];

      // Education
      const collegeDeg = String(
        match.collegeDegree ||
          match.college_degree ||
          match.degree_finished__baccalaureate ||
          "BACHELOR OF SECONDARY EDUCATION",
      )
        .trim()
        .toUpperCase();
      const major = String(
        match.major || match.major__specialization || "GENERAL EDUCATION",
      )
        .trim()
        .toUpperCase();
      const minor = String(match.minor || "N/A")
        .trim()
        .toUpperCase();
      const highestAttainment = String(
        match.highestEducationalAttainment ||
          match.highest_educational_attainment ||
          "COLLEGE GRADUATE / BACCALAUREATE",
      )
        .trim()
        .toUpperCase();
      const postGradDeg = String(
        match.postGraduateDegree ||
          match.post_graduate_degree ||
          match.post_graduate__degree ||
          "N/A",
      )
        .trim()
        .toUpperCase();
      const postGradDisc =
        match.postGraduateDiscipline ||
        match.post_graduate_discipline ||
        '{"mastersWithUnits":[],"mastersGraduated":[],"doctorateWithUnits":[],"doctorateGraduated":[],"masters":[],"doctorate":[]}';
      const elig = Array.isArray(match.eligibility)
        ? match.eligibility
        : [match.eligibility || "Licensure Examination for Teachers"];
      const prcSpec = String(
        match.prcSpecialization || match.prc_specialization || major,
      )
        .trim()
        .toUpperCase();
      const degreeRows = match.degreeRows ||
        match.collegeDegrees || [{ collegeDegree: collegeDeg, major, minor }];

      // A. Update esf7_personnel_profile
      await pool.query(
        `
        UPDATE esf7_personnel_profile SET
          first_name = $1,
          middle_name = $2,
          last_name = $3,
          name_extension = $4,
          salutation = $5,
          tin = $6,
          no_tin = $7,
          sex_at_birth = $8,
          civil_status = $9,
          solo_parent = $10,
          religion = $11,
          ethnic_group = $12,
          birthdate = $13,
          age = $14,
          employee_no = $15,
          deped_email = $16,
          no_deped_email = $17,
          is_school_head = $18,
          updated_at = NOW()
        WHERE id = $19
      `,
        [
          fName,
          mName,
          lName,
          extName,
          salutation,
          tin,
          noTin,
          sex,
          civilStatus,
          soloParent,
          religion,
          ethnicGroup,
          bDate,
          computedAge,
          empNo,
          depedEmail,
          noDepedEmail,
          isHead,
          p.id,
        ],
      );

      // B. Upsert esf7_personnel_employment
      const empId = `EMP-${schoolId}-${seq}`;
      await pool.query(
        `
        INSERT INTO esf7_personnel_employment (
          id, personnel_id, position_category, position, step_increment, fund_source,
          nature_of_appointment, hiring_arrangement, deployment_status, assigned_schools,
          grade_levels_taught, first_service_date, last_promotion_date, new_station_date,
          last_lateral_movement_date, raw_payload, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16::jsonb, NOW()
        )
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
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
      `,
        [
          empId,
          p.id,
          posCat,
          pos,
          stepInc,
          fundSrc,
          natAppt,
          hireArr,
          depStat,
          JSON.stringify([]),
          JSON.stringify(glTaught),
          firstSvcDate,
          lastPromoDate,
          newStationDate,
          lastLateralMovementDate,
          JSON.stringify({ match }),
        ],
      );

      // C. Upsert esf7_perssonel_educ
      const eduId = `EDU-${schoolId}-${seq}`;
      await pool.query(
        `
        INSERT INTO esf7_perssonel_educ (
          id, personnel_id, highest_educational_attainment, college_degree, college_degrees,
          major, minor, post_graduate_degree, post_graduate_discipline, eligibility,
          prc_specialization, raw_payload, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12::jsonb, NOW()
        )
        ON CONFLICT (personnel_id) DO UPDATE SET
          highest_educational_attainment = EXCLUDED.highest_educational_attainment,
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
      `,
        [
          eduId,
          p.id,
          highestAttainment,
          collegeDeg,
          JSON.stringify(degreeRows),
          major,
          minor,
          postGradDeg,
          typeof postGradDisc === "string"
            ? postGradDisc
            : JSON.stringify(postGradDisc),
          JSON.stringify(elig),
          prcSpec,
          JSON.stringify({ match }),
        ],
      );

      // D. Update esf7_personnel_node_status
      const profNodePayload = {
        status: "COMPLETED",
        degrees: degreeRows,
        completed_at: new Date().toISOString(),
        prc_license_no: match.prcLicenseNo || "",
        learning_area_matrix:
          match.matrixData || match.matrix_data || match.learningAreaMap || {},
        highest_educational_attainment: highestAttainment,
      };

      await pool.query(
        `
        UPDATE esf7_personnel_node_status SET
          personnel_name = $1,
          position_title = $2,
          category = $3,
          node_04_profile = $4::jsonb,
          updated_at = NOW()
        WHERE school_id = $5 AND personnel_id = $6
      `,
        [
          `${lName}, ${fName}${mName ? " " + mName : ""}`,
          pos,
          posCat,
          JSON.stringify(profNodePayload),
          schoolId,
          p.id,
        ],
      );
    }

    // 3. Update school_drafts for school 300488
    const draftRes = await pool.query(
      `SELECT payload FROM school_drafts WHERE school_id = $1`,
      [schoolId],
    );
    if (draftRes.rows.length > 0 && draftRes.rows[0].payload) {
      const payload = draftRes.rows[0].payload;
      if (Array.isArray(payload.personnel)) {
        console.log(
          `Updating ${payload.personnel.length} draft personnel records in school_drafts...`,
        );
        payload.personnel = payload.personnel.map((dp) => {
          const match = roster.find(
            (r) =>
              r.id === dp.id || r.personnel_id === dp.id || r.prn === dp.prn,
          );
          if (!match) return dp;

          const fName = String(
            match.firstName || match.first_name || match.first || dp.firstName,
          )
            .trim()
            .toUpperCase();
          const lName = String(
            match.lastName || match.last_name || match.last || dp.lastName,
          )
            .trim()
            .toUpperCase();
          const mName = String(
            match.middleName ||
              match.middle_name ||
              match.middle ||
              dp.middleName ||
              "",
          )
            .trim()
            .toUpperCase();
          const collegeDeg = String(
            match.collegeDegree ||
              match.college_degree ||
              dp.collegeDegree ||
              "",
          )
            .trim()
            .toUpperCase();
          const major = String(
            match.major || match.major__specialization || dp.major || "",
          )
            .trim()
            .toUpperCase();
          const attainment = String(
            match.highestEducationalAttainment ||
              match.highest_educational_attainment ||
              dp.highestEducationalAttainment ||
              "",
          )
            .trim()
            .toUpperCase();
          const pos = String(
            match.position_title || match.position || dp.position || "",
          )
            .trim()
            .toUpperCase();
          const degreeRows = match.degreeRows ||
            match.collegeDegrees ||
            dp.degreeRows || [
              { collegeDegree: collegeDeg, major, minor: "N/A" },
            ];

          return {
            ...dp,
            firstName: fName,
            first_name: fName,
            lastName: lName,
            last_name: lName,
            middleName: mName,
            middle_name: mName,
            collegeDegree: collegeDeg,
            college_degree: collegeDeg,
            major: major,
            highestEducationalAttainment: attainment,
            highest_educational_attainment: attainment,
            degreeRows: degreeRows,
            collegeDegrees: degreeRows,
            position: pos,
            position_title: pos,
            plantilla_position: pos,
            isProfileCompleted: true,
            is_profile_completed: true,
          };
        });

        await pool.query(
          `
          UPDATE school_drafts SET payload = $1::jsonb, updated_at = NOW() WHERE school_id = $2
        `,
          [JSON.stringify(payload), schoolId],
        );
        console.log(`Updated school_drafts payload successfully.`);
      }
    }

    console.log(
      `\n🎉 Hydration completed successfully for School ${schoolId}!`,
    );
  } catch (err) {
    console.error("Hydration error:", err);
  } finally {
    await pool.end();
  }
}

main();
